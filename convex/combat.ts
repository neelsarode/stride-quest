// =============================================================================
// Combat — idle collection + the daily deploy.
// =============================================================================
// Boss HP is derived (maxHP − Σ damageContributed); each member only writes their
// own progress row. The kill transition (active→won) is the single shared write,
// so it can't double-fire. Deploy spends the WHOLE Energy bank as one burst with
// crit + streak (locked design).
// =============================================================================
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { effectiveNow, effectiveDayForTz, effectiveWeekForTz } from "./time";
import { getUserGroup, memberCount } from "./players";
import { energyEarned } from "./economy";
import { settleFuelAndIdle } from "./idle";
import { stepsForWeek } from "./steps";
import { computeStreakMultiplier } from "./streak";
import { continueStreak } from "./streakMath";
import { settleShieldEarning } from "./shields";
import {
  BONUS_BOSS,
  BOSS,
  CRIT,
  DAMAGE_PER_ENERGY,
  STREAK,
  bossMaxHP,
  jobLevelForWeeklySteps,
  multiplierForJobLevel,
} from "./gameConfig";

// --- shared helpers ----------------------------------------------------------

export async function getActiveChallenge(
  ctx: MutationCtx,
  groupId: Id<"groups">,
): Promise<Doc<"challenges"> | null> {
  return await ctx.db
    .query("challenges")
    .withIndex("by_group_and_status", (q) =>
      q.eq("groupId", groupId).eq("status", "active"),
    )
    .first();
}

export async function ensureProgress(
  ctx: MutationCtx,
  challenge: Doc<"challenges">,
  userId: Id<"users">,
): Promise<Doc<"challengeProgress">> {
  const existing = await ctx.db
    .query("challengeProgress")
    .withIndex("by_challenge_and_user", (q) =>
      q.eq("challengeId", challenge._id).eq("userId", userId),
    )
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert("challengeProgress", {
    challengeId: challenge._id,
    groupId: challenge.groupId,
    userId,
    damageContributed: 0,
    lastIdleCollectedAt: await effectiveNow(ctx),
    idleMultiplierSnapshot: 1,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

/** Create a fresh weekly boss + zeroed progress rows for every member (idle clock
 *  started now, so nobody gets a free offline backlog against a brand-new boss). */
async function spawnBoss(
  ctx: MutationCtx,
  group: Doc<"groups">,
  weekStart: string,
  weekEnd: string,
  tier: number,
  prevId: Id<"challenges"> | undefined,
): Promise<Doc<"challenges">> {
  const members = await memberCount(ctx, group._id);
  const id = await ctx.db.insert("challenges", {
    groupId: group._id,
    startDate: weekStart,
    endDate: weekEnd,
    bossName: BOSS.defaultName,
    bossMaxHP: bossMaxHP(tier, members),
    status: "active",
    tier,
    previousChallengeId: prevId,
    createdAt: Date.now(),
  });
  const now = await effectiveNow(ctx);
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_group", (q) => q.eq("groupId", group._id))
    .collect();
  for (const mem of memberships) {
    const weekly = await stepsForWeek(ctx, mem.userId, weekStart, weekEnd);
    await ctx.db.insert("challengeProgress", {
      challengeId: id,
      groupId: group._id,
      userId: mem.userId,
      damageContributed: 0,
      lastIdleCollectedAt: now,
      idleMultiplierSnapshot: multiplierForJobLevel(jobLevelForWeeklySteps(weekly)),
      updatedAt: Date.now(),
    });
  }
  return (await ctx.db.get(id))!;
}

/** The single writer of weekly rollover. Returns the current week's challenge,
 *  spawning a new boss when a new week has begun:
 *   - last boss WON  → next boss is tougher (tier + 1)
 *   - last boss unbeaten → expire it (no penalty), fresh boss same tier
 *  A boss WON earlier THIS week stays in its victory lap (no new boss until Monday).
 *  Weekly Job XP / jobs reset automatically (they're derived from the week's steps);
 *  Energy + streaks persist (account-level). Call from mutations only. */
export async function ensureCurrentChallenge(
  ctx: MutationCtx,
  group: Doc<"groups">,
): Promise<Doc<"challenges">> {
  const { weekStart, weekEnd } = await effectiveWeekForTz(ctx, group.tzOffsetMinutes);
  const all = await ctx.db
    .query("challenges")
    .withIndex("by_group", (q) => q.eq("groupId", group._id))
    .collect();
  const thisWeek = all.find((c) => c.startDate === weekStart);
  if (thisWeek) {
    if (thisWeek.status === "expired") {
      return await spawnBoss(ctx, group, weekStart, weekEnd, thisWeek.tier ?? 1, thisWeek._id);
    }
    return thisWeek; // active, or won (victory lap) — no new boss this week
  }
  // A new week began. Resolve the most recent prior boss + pick the next tier.
  const prior =
    all
      .filter((c) => c.startDate < weekStart)
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0] ?? null;
  if (prior && prior.status === "active") {
    await ctx.db.patch(prior._id, { status: "expired" }); // unbeaten → no penalty
  }
  const nextTier = prior
    ? prior.status === "won"
      ? (prior.tier ?? 1) + 1
      : (prior.tier ?? 1)
    : 1;
  return await spawnBoss(ctx, group, weekStart, weekEnd, nextTier, prior?._id);
}

async function totalDamage(
  ctx: MutationCtx,
  challengeId: Id<"challenges">,
): Promise<number> {
  const rows = await ctx.db
    .query("challengeProgress")
    .withIndex("by_challenge", (q) => q.eq("challengeId", challengeId))
    .collect();
  return rows.reduce((s, r) => s + r.damageContributed, 0);
}

/** Mark the boss won if total damage has reached its HP (the kill transition).
 *  The SAME write spawns the Bonus Boss (M1.5, spec §3/§5): the status guard
 *  above makes this the single shared active→won transition, so the crowned
 *  form can't double-fire. The bonus phase itself is DERIVED — status "won" ∧
 *  week not over — never a new status literal. */
export async function resolveBoss(ctx: MutationCtx, challengeId: Id<"challenges">) {
  const challenge = await ctx.db.get(challengeId);
  if (!challenge || challenge.status !== "active") return;
  const total = await totalDamage(ctx, challengeId);
  if (total >= challenge.bossMaxHP) {
    await ctx.db.patch(challengeId, {
      status: "won",
      bonusStartedAt: await effectiveNow(ctx),
      bonusBossName: `${BONUS_BOSS.namePrefix} ${challenge.bossName}`,
    });
  }
}

// --- idle collection ---------------------------------------------------------

export const collectIdle = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const ug = await getUserGroup(ctx, userId);
    if (!ug) return { collected: 0 };
    const now = await effectiveNow(ctx);
    const challenge = await ensureCurrentChallenge(ctx, ug.group);
    const progress = await ensureProgress(ctx, challenge, userId);
    // One shared settle: fuel burn + idle damage from the same piecewise walk.
    // While the challenge is "won" (bonus phase, M1.5 spec §3) the settle banks
    // the damage into bonusDamageContributed instead of boss HP — the old
    // victory-lap branch settled fuel but DISCARDED the damage (a subtle
    // punishment; fixed). OFFLINE_CAP semantics are unchanged inside the walk.
    const { collected } = await settleFuelAndIdle(ctx, userId, progress, now);
    if (challenge.status === "active") {
      await resolveBoss(ctx, challenge._id);
    }
    return { collected };
  },
});

// --- deploy ------------------------------------------------------------------

export type DeployResult = {
  damage: number;
  crit: boolean;
  streakMult: number;
  streakCount: number;
  spent: number;
  firstToday: boolean;
};

/** Core deploy: spend the WHOLE Energy bank as a burst. Takes an explicit userId
 *  so the dev "simulate teammate deploy" can drive a bot through the same path. */
export async function applyDeploy(
  ctx: MutationCtx,
  userId: Id<"users">,
  group: Doc<"groups">,
  challenge: Doc<"challenges">,
): Promise<DeployResult> {
  const user = (await ctx.db.get(userId))!;
  const earned = await energyEarned(ctx, userId);
  const available = Math.max(0, earned - (user.energySpent ?? 0));

  // Streak (shield-aware, STR-10): first deploy of the day extends/keeps it; a
  // missed day is silently bridged by an auto-applied Streak Shield (the streak
  // survives — no increment for the shielded day, no reset); an uncovered gap
  // breaks it. Earning settles FIRST so a freshly earned shield (e.g. the 5th
  // goal day landed yesterday) is in the pocket before it's needed.
  const effNow = await effectiveNow(ctx);
  const today = await effectiveDayForTz(ctx, group.tzOffsetMinutes);
  const shieldsHeld = await settleShieldEarning(ctx, userId, effNow);
  const cont = continueStreak({
    prevStreak: user.streakCount ?? 0,
    shieldsHeld,
    lastDeployDate: user.lastDeployDate,
    today,
  });
  const streak = cont.streak;
  const firstToday = cont.firstToday;
  const longest = Math.max(user.longestStreak ?? 0, streak);

  const isCrit =
    (firstToday && STREAK.firstDeployGuaranteedCrit) ||
    Math.random() < CRIT.chance;
  const critMult = isCrit ? CRIT.multiplier : 1;

  // Streak multiplier now scales on length + intensity (avg steps/day during the
  // streak) + job level.
  const { weekStart, weekEnd } = await effectiveWeekForTz(ctx, group.tzOffsetMinutes);
  const weekly = await stepsForWeek(ctx, userId, weekStart, weekEnd);
  const jobLevel = jobLevelForWeeklySteps(weekly);
  const { multiplier: sMult } = await computeStreakMultiplier(
    ctx,
    userId,
    group.tzOffsetMinutes,
    effNow,
    streak,
    jobLevel,
    today,
  );
  const damage = Math.round(available * DAMAGE_PER_ENERGY * critMult * sMult);

  // Spend the whole bank (energySpent := lifetime earned → balance 0) and
  // settle the streak + any shields consumed to bridge the gap.
  await ctx.db.patch(userId, {
    energySpent: earned,
    streakCount: streak,
    longestStreak: longest,
    lastDeployDate: today,
    shieldsHeld: shieldsHeld - cont.shieldsConsumed,
  });

  const progress = await ensureProgress(ctx, challenge, userId);
  if (challenge.status === "won") {
    // Bonus phase (M1.5 spec §3 — the STR-53 fix): the pipeline above ran
    // IDENTICALLY (whole bank spent, first-of-day guaranteed crit, streak
    // multiplier + tick, shields settled) — only the destination changes:
    // the accumulating bonus meter, not boss HP. Nothing to resolve.
    await ctx.db.patch(progress._id, {
      bonusDamageContributed: (progress.bonusDamageContributed ?? 0) + damage,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.patch(progress._id, {
      damageContributed: progress.damageContributed + damage,
      updatedAt: Date.now(),
    });
    await resolveBoss(ctx, challenge._id);
  }

  return { damage, crit: isCrit, streakMult: sMult, streakCount: streak, spent: available, firstToday };
}

export const deploy = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const ug = await getUserGroup(ctx, userId);
    if (!ug) {
      throw new ConvexError({
        code: "no_guild",
        message: "Join or start a guild first — a deploy needs a boss to hit.",
      });
    }
    // NO status gate (M1.5, spec §5): "active" deploys hit the boss; "won"
    // deploys run the identical pipeline against the Bonus Boss. The old
    // "Boss already defeated" rejection is gone — it silently no-oped early
    // killers' deploys and cost them their streak (the STR-53 finding).
    const challenge = await ensureCurrentChallenge(ctx, ug.group);
    return await applyDeploy(ctx, userId, ug.group, challenge);
  },
});
