// =============================================================================
// Guild — the co-op layer: roster + recognition, and (STR-44) the explicit
// create/join lifecycle that onboarding drives.
// =============================================================================
// The shared boss is already derived (boss HP = maxHP − Σ every member's
// damageContributed in game.dashboard), so a teammate's hit drops the bar on
// everyone's screen for free. The overview query exposes WHO contributed what,
// plus the fairness-based recognition (MVP / most improved / longest streak)
// scored on IMPROVEMENT + CONSISTENCY, never raw steps — so a lighter walker
// can win.
//
// STR-44 (spec §Backend): guild creation is now EXPLICIT (Beat 2's fork), never
// implicit — users.ensureSession stopped auto-creating "My Guild". createGuild
// and joinGuildByCode are each ONE atomic mutation, so a founder/joiner can
// never end up half set up (guild without boss, membership without progress).
// User-facing rejections throw ConvexError with a structured {code, message}
// payload — the client shows `message` instead of the generic "Server Error"
// (the STR-53 finding).
// =============================================================================
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getUserGroup } from "./players";
import { stepsForDate, stepsForWeek } from "./steps";
import { effectiveNow, getClockOffsetMs, dayString, weekRange } from "./time";
import { fuelSnapshot, grantStarterFuelIfNew } from "./fuel";
import type { FuelState } from "./fuelMath";
import { ensureCurrentChallenge, ensureProgress } from "./combat";
import {
  generateInviteCode,
  normalizeInviteCode,
  isValidInviteCode,
} from "./inviteCode";
import {
  CLASSES,
  GUILD,
  MVP_CLASS,
  IMPROVEMENT_FLOOR,
  RECOGNITION,
  jobLevelForWeeklySteps,
  type ClassKey,
} from "./gameConfig";

/** Guild names are typed once at the fork (pre-filled "{Hero}'s Guild"); the cap
 *  fits a max-length hero name (20) + "'s Guild" with room to spare. */
const GUILD_NAME_MAX = 30;

const DAY_MS = 86_400_000;

/** Today's steps relative to this player's own rolling average (locked fairness
 *  decision). 1.0 = exactly their norm; >1 = beating it. Floored so a brand-new
 *  player with no history isn't divide-by-zero. */
async function improvementScore(
  ctx: QueryCtx,
  userId: Id<"users">,
  tz: number | undefined,
  now: number,
  today: string,
  todaySteps: number,
): Promise<number> {
  const windowStart = dayString(
    now - RECOGNITION.baselineWindowDays * DAY_MS,
    tz ?? 0,
  );
  const yesterday = dayString(now - DAY_MS, tz ?? 0);
  const sumPrev = await stepsForWeek(ctx, userId, windowStart, yesterday);
  const avg = sumPrev / RECOGNITION.baselineWindowDays;
  const baseline = Math.max(avg, IMPROVEMENT_FLOOR);
  return todaySteps / baseline;
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const ug = await getUserGroup(ctx, userId);
    if (!ug) return null;
    const group = ug.group;
    const tz = group.tzOffsetMinutes;

    const now = Date.now() + (await getClockOffsetMs(ctx));
    const date = dayString(now, tz ?? 0);
    const yesterday = dayString(now - DAY_MS, tz ?? 0);
    const { weekStart, weekEnd } = weekRange(now, tz ?? 0);

    // The challenge whose contributions we attribute (active, else latest).
    let challenge = await ctx.db
      .query("challenges")
      .withIndex("by_group_and_status", (q) =>
        q.eq("groupId", group._id).eq("status", "active"),
      )
      .first();
    if (!challenge) {
      challenge = await ctx.db
        .query("challenges")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .order("desc")
        .first();
    }
    const dmgByUser = new Map<string, number>();
    if (challenge) {
      const ch = challenge;
      const rows = await ctx.db
        .query("challengeProgress")
        .withIndex("by_challenge", (q) => q.eq("challengeId", ch._id))
        .collect();
      for (const r of rows) dmgByUser.set(r.userId, r.damageContributed);
    }

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();

    const members: Array<{
      userId: Id<"users">;
      displayName: string;
      class: ClassKey; // chosen class key — feeds the battle-scene roster sprites
      isMe: boolean;
      isSimulated: boolean;
      damage: number;
      todaySteps: number;
      weeklySteps: number;
      jobLevel: number;
      jobName: string;
      heroState: FuelState;
      displayStreak: number;
      improvementPct: number;
      _improvement: number;
    }> = [];

    for (const m of memberships) {
      const u = await ctx.db.get(m.userId);
      if (!u) continue;
      // Per-member class registry entry — class-less members (mid-onboarding,
      // legacy) render as the warrior MVP fallback.
      const cls = CLASSES[u.class ?? MVP_CLASS];
      const weekly = await stepsForWeek(ctx, m.userId, weekStart, weekEnd);
      const jobLevel = jobLevelForWeeklySteps(weekly);
      const todaySteps = await stepsForDate(ctx, m.userId, date);
      const rawStreak = u.streakCount ?? 0;
      const alive = u.lastDeployDate === date || u.lastDeployDate === yesterday;
      const displayStreak = alive ? rawStreak : 0;
      const improvement = await improvementScore(
        ctx,
        m.userId,
        tz,
        now,
        date,
        todaySteps,
      );
      members.push({
        userId: m.userId,
        displayName: u.displayName ?? "Hero",
        class: cls.key,
        isMe: m.userId === userId,
        isSimulated: u.isSimulated ?? false,
        damage: Math.round(dmgByUser.get(m.userId) ?? 0),
        todaySteps,
        weeklySteps: weekly,
        jobLevel,
        jobName: cls.jobNames[jobLevel - 1],
        // Hero state (STR-11): DERIVED at read time from the member's stored
        // (fuel, fuelSettledAt) by the same pure walk a settle runs — no extra
        // reads (the user doc is already in hand) and no writes. A query-time
        // derivation matches a settle-then-read exactly (see fuel.test.mjs).
        heroState: fuelSnapshot(u, now).state,
        displayStreak,
        improvementPct: Math.round((improvement - 1) * 100),
        _improvement: improvement,
      });
    }

    members.sort((a, b) => b.damage - a.damage);

    // Recognition: improvement + consistency, normalized across the crew.
    const maxImp = Math.max(...members.map((m) => m._improvement), 0.0001);
    const maxStreak = Math.max(...members.map((m) => m.displayStreak), 1);
    let mvp: Id<"users"> | null = null;
    let mostImproved: Id<"users"> | null = null;
    let longest: Id<"users"> | null = null;
    let bestMvp = -1;
    let bestImp = -1;
    let bestStreak = -1;
    for (const m of members) {
      const mvpScore =
        RECOGNITION.improvementWeight * (m._improvement / maxImp) +
        RECOGNITION.consistencyWeight * (m.displayStreak / maxStreak);
      if (mvpScore > bestMvp) {
        bestMvp = mvpScore;
        mvp = m.userId;
      }
      if (m._improvement > bestImp) {
        bestImp = m._improvement;
        mostImproved = m.userId;
      }
      if (m.displayStreak > bestStreak) {
        bestStreak = m.displayStreak;
        longest = m.userId;
      }
    }
    if (bestStreak <= 0) longest = null; // no one has a live streak yet

    return {
      members: members.map(({ _improvement, ...rest }) => rest),
      recognition: {
        mvpUserId: mvp,
        mostImprovedUserId: mostImproved,
        longestStreakUserId: longest,
      },
      memberCount: members.length,
      // STR-44: the guild board doubles as the invite surface ("code also lives
      // on the guild board"). null only for legacy guilds until their next
      // ensureSession backfills a code.
      inviteCode: group.inviteCode ?? null,
      maxMembers: GUILD.maxMembers,
    };
  },
});

// =============================================================================
// Guild lifecycle (STR-44) — create, preview, join.
// =============================================================================

/** A code that no existing guild holds. 31^6 ≈ 887M combinations makes a clash
 *  effectively impossible at friend-group scale, but the lookup-then-retry loop
 *  turns "effectively" into a guarantee — and because Convex mutations are
 *  serializable, two founders generating simultaneously can't both commit the
 *  same code (the second run sees the first's write). */
export async function generateUniqueInviteCode(
  ctx: MutationCtx,
): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const code = generateInviteCode();
    const clash = await ctx.db
      .query("groups")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
      .first();
    if (!clash) return code;
  }
  // 16 straight collisions ≈ (n/887M)^16 — if we're here something is broken.
  throw new Error("Could not generate a unique invite code.");
}

/** True when someone OTHER than `userId` in this guild is a real human.
 *  Simulated dev bots don't count — a founder testing co-op solo is still
 *  "alone" for the guild-switch rule below. */
export async function hasOtherHumans(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  userId: Id<"users">,
): Promise<boolean> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();
  for (const m of memberships) {
    if (m.userId === userId) continue;
    const u = await ctx.db.get(m.userId);
    if (u && !u.isSimulated) return true;
  }
  return false;
}

/** Delete a guild and everything scoped to it: challenges + their progress
 *  rows, memberships, and any simulated dev bots living there (bots are fully
 *  erased — steps, progress, user doc — mirroring dev.removeSimulatedTeammates).
 *  HUMAN account state survives by construction: fuel/energy/streak/shields and
 *  the step ledger all live on `users`/`stepEntries`, never on the guild — so a
 *  solo founder switching guilds keeps their whole hero (spec §Backend
 *  "Orphaned solo guilds"). Callers are responsible for the only-human check. */
export async function deleteGuildCascade(
  ctx: MutationCtx,
  group: Doc<"groups">,
): Promise<void> {
  const challenges = await ctx.db
    .query("challenges")
    .withIndex("by_group", (q) => q.eq("groupId", group._id))
    .collect();
  for (const c of challenges) {
    const rows = await ctx.db
      .query("challengeProgress")
      .withIndex("by_challenge", (q) => q.eq("challengeId", c._id))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.delete(c._id);
  }
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_group", (q) => q.eq("groupId", group._id))
    .collect();
  for (const m of memberships) {
    const u = await ctx.db.get(m.userId);
    if (u?.isSimulated) {
      // Bots exist only for this guild — erase them entirely so they can't
      // linger as ghost users (same cleanup as dev.removeSimulatedTeammates).
      const steps = await ctx.db
        .query("stepEntries")
        .withIndex("by_user", (q) => q.eq("userId", m.userId))
        .collect();
      for (const s of steps) await ctx.db.delete(s._id);
      const progress = await ctx.db
        .query("challengeProgress")
        .withIndex("by_user", (q) => q.eq("userId", m.userId))
        .collect();
      for (const p of progress) await ctx.db.delete(p._id);
      await ctx.db.delete(m.userId);
    }
    await ctx.db.delete(m._id);
  }
  await ctx.db.delete(group._id);
}

/** Beat 2, founder path: guild + unique invite code + owner membership + boss
 *  spawn + starter tank, all in ONE atomic mutation — the code-reveal screen can
 *  never show a code for a guild that half-exists. */
export const createGuild = mutation({
  args: {
    name: v.string(),
    // Founder's Date.getTimezoneOffset() — anchors the guild's shared day/week
    // boundary, exactly as bootstrap used to capture it.
    tzOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { name, tzOffsetMinutes }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");

    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > GUILD_NAME_MAX) {
      throw new ConvexError({
        code: "invalid_name",
        message: `Guild names are 1–${GUILD_NAME_MAX} characters.`,
      });
    }

    // One guild per hero (MVP): the fork only offers "start" to guild-less
    // users, and legacy solo guilds route to class-pick, not the fork.
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      throw new ConvexError({
        code: "has_guild",
        message: "You already have a guild.",
      });
    }

    const inviteCode = await generateUniqueInviteCode(ctx);
    const groupId = await ctx.db.insert("groups", {
      name: trimmed,
      ownerId: userId,
      createdAt: Date.now(),
      tzOffsetMinutes: tzOffsetMinutes ?? 0,
      inviteCode,
    });
    await ctx.db.insert("memberships", {
      userId,
      groupId,
      role: "owner",
      joinedAt: Date.now(),
    });

    // Starter tank (idempotent) — the guardrail: the first session never shows
    // a resting hero. Normally ensureSession already granted it; this covers a
    // create that races ahead of it.
    await grantStarterFuelIfNew(ctx, userId, await effectiveNow(ctx));

    // Boss spawn + the founder's progress row (idle clock starts now).
    const group = (await ctx.db.get(groupId))!;
    const challenge = await ensureCurrentChallenge(ctx, group);
    await ensureProgress(ctx, challenge, userId);

    return { groupId, inviteCode };
  },
});

/** Beat 2, joiner path step 1: the preview-confirm ("Join Team Sofia? 3 heroes
 *  fight beside you.") — name + member count, NO join. Returns null for any
 *  code that can't match (bad format or unknown), so the six-box entry shows a
 *  warm inline retry instead of a modal. */
export const previewInviteCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const normalized = normalizeInviteCode(code);
    if (!isValidInviteCode(normalized)) return null;
    const group = await ctx.db
      .query("groups")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", normalized))
      .first();
    if (!group) return null;
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    return {
      guildName: group.name,
      memberCount: memberships.length,
      maxMembers: GUILD.maxMembers,
      // Lets the UI offer the founder path BEFORE a doomed join attempt.
      isFull: memberships.length >= GUILD.maxMembers,
    };
  },
});

/** Beat 2, joiner path step 2: join by code. Success = membership +
 *  ensureProgress (idle clock starts NOW — no phantom backlog against a boss
 *  the joiner never fought) + starter tank.
 *
 *  REINFORCEMENTS RULE (decided, spec §Backend): the boss HP is NOT rescaled at
 *  join time. Rescaling would grow the boss bar at the moment of a social win
 *  (violates never-punish); next Monday's spawn re-reads the member count via
 *  bossMaxHP(tier, members) automatically. One easier founding week is a
 *  feature.
 *
 *  SOLO-GUILD SWITCH: a caller who is the only HUMAN in their current guild
 *  (a legacy auto-created "My Guild", or a founder whose friends never came)
 *  switches guilds — the old guild cascade-deletes and the hero walks over
 *  whole, because account state lives on `users`, not the guild. Leaving a
 *  guild with real teammates is a later feature → has_guild. */
export const joinGuildByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");

    const normalized = normalizeInviteCode(code);
    const group = isValidInviteCode(normalized)
      ? await ctx.db
          .query("groups")
          .withIndex("by_invite_code", (q) => q.eq("inviteCode", normalized))
          .first()
      : null;
    if (!group) {
      throw new ConvexError({
        code: "not_found",
        message: "That code doesn't match any guild — check it and try again.",
      });
    }

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    // Already in THIS guild → the client routes through silently.
    if (existing && existing.groupId === group._id) {
      throw new ConvexError({
        code: "already_member",
        message: "You're already in this guild.",
      });
    }

    // Capacity check BEFORE any destructive switch work — a full guild must
    // never cost the caller their current one. Serializable mutations make the
    // "two joins race for the last slot" case safe: the second sees 8/8.
    const targetMembers = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    if (targetMembers.length >= GUILD.maxMembers) {
      throw new ConvexError({
        code: "full",
        message: `${group.name} is full (${GUILD.maxMembers} heroes max).`,
      });
    }

    if (existing) {
      const current = await ctx.db.get(existing.groupId);
      if (current && (await hasOtherHumans(ctx, current._id, userId))) {
        throw new ConvexError({
          code: "has_guild",
          message:
            "You already fight beside a crew — leaving a guild with teammates isn't supported yet.",
        });
      }
      // Only human (or dangling membership) → switch: cascade the old guild.
      if (current) {
        await deleteGuildCascade(ctx, current);
      } else {
        await ctx.db.delete(existing._id);
      }
    }

    await ctx.db.insert("memberships", {
      userId,
      groupId: group._id,
      role: "member",
      joinedAt: Date.now(),
    });

    // Starter tank (idempotent safety, same reason as createGuild).
    await grantStarterFuelIfNew(ctx, userId, await effectiveNow(ctx));

    // Progress row on the CURRENT boss only if it's still being fought — a
    // victory-lap join succeeds, and the row arrives with Monday's spawn
    // (spawnBoss creates rows for every membership, this one included).
    const challenge = await ensureCurrentChallenge(ctx, group);
    if (challenge.status === "active") {
      await ensureProgress(ctx, challenge, userId);
    }

    return {
      groupId: group._id,
      guildName: group.name,
      memberCount: targetMembers.length + 1,
    };
  },
});
