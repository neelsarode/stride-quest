// =============================================================================
// DEV-ONLY tooling (convex/dev.ts) — env-gated, never runs in production.
// =============================================================================
// Lets us test time-based + multiplayer mechanics in minutes: time-travel the
// server clock, inject steps for anyone, and add simulated teammates.
//
// SECURITY: client __DEV__ is NOT a real gate (Convex functions are public).
// The real gate is the server env var ENABLE_DEV_TOOLS. Set it on the DEV
// deployment only:  npx convex env set ENABLE_DEV_TOOLS true
// =============================================================================
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  effectiveNow,
  getClockOffsetMs,
  dayString,
  weekRange,
  endOfEffectiveDay,
} from "./time";
import { getUserGroup } from "./players";
import {
  DAILY_STEP_GOAL,
  FUEL,
  RALLY,
  multiplierForJobLevel,
} from "./gameConfig";
import {
  applyDeploy,
  ensureCurrentChallenge,
  ensureProgress,
  resolveBoss,
} from "./combat";
import { stepsForDate } from "./steps";
import { grantFuel, grantStarterFuelIfNew, settleFuel } from "./fuel";
import { settleFuelAndIdle } from "./idle";
import { STARTER_FUEL, fuelForBattlingHours } from "./fuelMath";
import { settleShieldEarning } from "./shields";
import { shieldsAfterEarning } from "./streakMath";
import { applyRally } from "./rally";
import { energyEarned } from "./economy";
import { deleteGuildCascade, hasOtherHumans } from "./guild";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function devEnabled(): boolean {
  return process.env.ENABLE_DEV_TOOLS === "true";
}
function assertDevEnabled() {
  if (!devEnabled()) {
    throw new Error("Dev tools are disabled (ENABLE_DEV_TOOLS not set).");
  }
}

async function setOffset(ctx: MutationCtx, offsetMs: number) {
  const row = await ctx.db
    .query("devState")
    .withIndex("by_key", (q) => q.eq("key", "singleton"))
    .first();
  if (row) {
    await ctx.db.patch(row._id, { clockOffsetMs: offsetMs, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("devState", {
      key: "singleton",
      clockOffsetMs: offsetMs,
      updatedAt: Date.now(),
    });
  }
}

/** After time-travel, roll the boss to the (new) effective week if needed, so the
 *  weekly reset / new boss appears immediately. */
async function rollAfterClock(ctx: MutationCtx) {
  const caller = await getAuthUserId(ctx);
  if (!caller) return;
  const ug = await getUserGroup(ctx, caller);
  if (ug) await ensureCurrentChallenge(ctx, ug.group);
}

// --- clock control -----------------------------------------------------------

export const setClockOffset = mutation({
  args: { offsetMs: v.number() },
  handler: async (ctx, { offsetMs }) => {
    assertDevEnabled();
    await setOffset(ctx, offsetMs);
    await rollAfterClock(ctx);
  },
});

export const advanceTime = mutation({
  args: { ms: v.number() },
  handler: async (ctx, { ms }) => {
    assertDevEnabled();
    await setOffset(ctx, (await getClockOffsetMs(ctx)) + ms);
    await rollAfterClock(ctx);
  },
});

export const advanceDay = mutation({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    assertDevEnabled();
    await setOffset(ctx, (await getClockOffsetMs(ctx)) + (days ?? 1) * DAY_MS);
    await rollAfterClock(ctx);
  },
});

export const fastForwardIdle = mutation({
  args: { hours: v.number() },
  handler: async (ctx, { hours }) => {
    assertDevEnabled();
    await setOffset(ctx, (await getClockOffsetMs(ctx)) + hours * HOUR_MS);
    await rollAfterClock(ctx);
  },
});

export const resetClock = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevEnabled();
    await setOffset(ctx, 0);
    await rollAfterClock(ctx);
  },
});

/** Jump forward a full week + roll (tests the weekly reset / next boss). */
export const triggerWeeklyReset = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevEnabled();
    await setOffset(ctx, (await getClockOffsetMs(ctx)) + 7 * DAY_MS);
    await rollAfterClock(ctx);
  },
});

// --- status (safe to call always; returns enabled:false in prod) -------------

export const status = query({
  args: {},
  handler: async (ctx) => {
    if (!devEnabled()) return { enabled: false as const };
    const userId = await getAuthUserId(ctx);
    const ug = userId ? await getUserGroup(ctx, userId) : null;
    const tz = ug?.group.tzOffsetMinutes ?? 0;
    const offsetMs = await getClockOffsetMs(ctx);
    const now = Date.now() + offsetMs;
    const { weekStart, weekEnd } = weekRange(now, tz);

    // Simulated teammates in the caller's guild.
    const teammates: {
      userId: Id<"users">;
      displayName: string;
      stepsToday: number;
    }[] = [];
    if (ug) {
      const today = dayString(now, tz);
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_group", (q) => q.eq("groupId", ug.group._id))
        .collect();
      for (const m of memberships) {
        const u = await ctx.db.get(m.userId);
        if (u?.isSimulated) {
          const entries = await ctx.db
            .query("stepEntries")
            .withIndex("by_user_and_date", (q) =>
              q.eq("userId", m.userId).eq("date", today),
            )
            .collect();
          teammates.push({
            userId: m.userId,
            displayName: u.displayName ?? "Bot",
            stepsToday: entries.reduce((mx, e) => Math.max(mx, e.stepCount), 0),
          });
        }
      }
    }

    return {
      enabled: true as const,
      offsetMs,
      now,
      date: dayString(now, tz),
      weekStart,
      weekEnd,
      teammates,
    };
  },
});

// --- step injection for any user --------------------------------------------

async function injectFor(
  ctx: MutationCtx,
  userId: Id<"users">,
  stepCount: number,
  date: string,
  tzOffsetMinutes: number,
) {
  const clamped = Math.max(0, Math.floor(stepCount));
  // Injected steps grant fuel exactly like real syncs: on the day-max delta,
  // settled-then-added (see steps.recordSteps). Keeps the dev loop honest.
  const prevDayMax = await stepsForDate(ctx, userId, date);
  await ctx.db.insert("stepEntries", {
    userId,
    date,
    stepCount: clamped,
    source: "injector",
    createdAt: Date.now(),
  });
  const now = await effectiveNow(ctx);
  await grantStarterFuelIfNew(ctx, userId, now);
  await grantFuel(ctx, userId, now, Math.max(0, clamped - prevDayMax) * FUEL.fuelPerStep);
  // Shield earning settles on injects exactly like real syncs (STR-10) — the
  // dev inject-a-goal-day × advanceDay loop is how shield scenarios are built.
  await settleShieldEarning(ctx, userId, now);
  // Overdrive retrigger (Core Loop v2 §5.4): an injected goal day arms Overdrive
  // ×2 until the daily reset, IDENTICALLY to a real recordSteps sync — so the dev
  // "inject a goal day" loop is now how Overdrive is tested (it REPLACES the
  // retired fillOverdrive tool). Same end-of-day stamp; goal is a met-goal.
  const dayMax = Math.max(prevDayMax, clamped);
  if (dayMax >= DAILY_STEP_GOAL) {
    await ctx.db.patch(userId, {
      overdriveActiveUntil: endOfEffectiveDay(now, tzOffsetMinutes),
    });
  }
}

export const injectStepsFor = mutation({
  args: {
    userId: v.id("users"),
    stepCount: v.number(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { userId, stepCount, date }) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    const ug = caller ? await getUserGroup(ctx, caller) : null;
    const tz = ug?.group.tzOffsetMinutes ?? 0;
    const now = await effectiveNow(ctx);
    const day = date ?? dayString(now, tz);
    await injectFor(ctx, userId, stepCount, day, tz);
  },
});

// --- simulated teammates -----------------------------------------------------

export const addSimulatedTeammate = mutation({
  args: { name: v.optional(v.string()), dailySteps: v.optional(v.number()) },
  handler: async (ctx, { name, dailySteps }) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");
    const ug = await getUserGroup(ctx, caller);
    if (!ug) throw new Error("No guild yet — open the app first.");

    const botId = await ctx.db.insert("users", {
      displayName: name ?? `Bot ${Math.floor((await effectiveNow(ctx)) % 1000)}`,
      isAnonymous: false,
      isSimulated: true,
      // Bots skip bootstrap, so give them the starter tank here — a fuel-less
      // bot would rest forever and make co-op testing misleading.
      fuel: STARTER_FUEL,
      fuelSettledAt: await effectiveNow(ctx),
    });
    await ctx.db.insert("memberships", {
      userId: botId,
      groupId: ug.group._id,
      role: "member",
      joinedAt: Date.now(),
    });

    // Progress row on the active challenge with idle clock started now.
    const challenge = await ctx.db
      .query("challenges")
      .withIndex("by_group_and_status", (q) =>
        q.eq("groupId", ug.group._id).eq("status", "active"),
      )
      .first();
    if (challenge) {
      await ctx.db.insert("challengeProgress", {
        challengeId: challenge._id,
        groupId: ug.group._id,
        userId: botId,
        damageContributed: 0,
        lastIdleCollectedAt: await effectiveNow(ctx),
        idleMultiplierSnapshot: multiplierForJobLevel(1),
        updatedAt: Date.now(),
      });
    }

    if (dailySteps && dailySteps > 0) {
      const now = await effectiveNow(ctx);
      const tz = ug.group.tzOffsetMinutes ?? 0;
      await injectFor(ctx, botId, dailySteps, dayString(now, tz), tz);
    }
    return botId;
  },
});

export const removeSimulatedTeammates = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");
    const ug = await getUserGroup(ctx, caller);
    if (!ug) return;

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", ug.group._id))
      .collect();
    for (const m of memberships) {
      const u = await ctx.db.get(m.userId);
      if (!u?.isSimulated) continue;
      // delete their step entries, progress rows, membership, and user row
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
      await ctx.db.delete(m._id);
      await ctx.db.delete(m.userId);
    }
  },
});

// --- reset the caller's account meta (re-test the solo loop) -----------------

export const resetAccount = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");

    // Clean slate for the playtest: clear the step ledger…
    const steps = await ctx.db
      .query("stepEntries")
      .withIndex("by_user", (q) => q.eq("userId", caller))
      .collect();
    for (const s of steps) await ctx.db.delete(s._id);

    // …zero this player's boss damage + restart their idle clock…
    const now = await effectiveNow(ctx);
    const progress = await ctx.db
      .query("challengeProgress")
      .withIndex("by_user", (q) => q.eq("userId", caller))
      .collect();
    for (const p of progress) {
      await ctx.db.patch(p._id, {
        damageContributed: 0,
        bonusDamageContributed: 0,
        lastIdleCollectedAt: now,
        idleMultiplierSnapshot: 1,
        updatedAt: Date.now(),
      });
    }

    // …ensure THIS week's boss exists and is active (cleared damage ⇒ not
    // defeated). Reviving a won boss also un-stamps its Bonus Boss fields —
    // they're only ever valid on a "won" challenge (M1.5 invariant).
    const ug = await getUserGroup(ctx, caller);
    if (ug) {
      const challenge = await ensureCurrentChallenge(ctx, ug.group);
      if (challenge.status !== "active") {
        await ctx.db.patch(challenge._id, {
          status: "active",
          bonusStartedAt: undefined,
          bonusBossName: undefined,
        });
      }
    }

    // …and reset account meta (energy spent, streaks, fuel back to the starter
    // tank, overdrive uncharged/inactive — the ledger is empty again, so the
    // derived meters must not be offset by stale spent counters).
    await ctx.db.patch(caller, {
      energySpent: 0,
      streakCount: 0,
      longestStreak: 0,
      lastDeployDate: undefined,
      fuel: STARTER_FUEL,
      fuelSettledAt: now,
      // Overdrive is now goal-armed (Core Loop v2 §5.4): a clean slate just clears
      // the arming stamp (overdriveExcessSpent is retired — no longer written).
      overdriveActiveUntil: undefined,
      shieldsHeld: 0,
      shieldLastEarnedWeek: undefined,
      // One-shot teaching/health stamps (STR-48/49): a clean slate re-arms
      // the first-collect suffix and the CONNECT HEALTH chip for re-testing.
      healthKitConnectedAt: undefined,
      firstIdleCollectedAt: undefined,
    });
  },
});

/** Re-run onboarding from Beat 1 (the STR-44 re-test loop): clear the two
 *  routing stamps (class, onboardedAt) and tear down the caller's guild so the
 *  fork runs again too. Solo (or bots-only) guild → full cascade, mirroring the
 *  joinGuildByCode switch cleanup; a guild with OTHER HUMANS is never deleted —
 *  only the caller's own membership + progress rows leave with them. Account
 *  state (fuel/energy/streak/shields + the step ledger) survives on `users`,
 *  exactly like a real guild switch — use resetAccount for a true clean slate. */
export const resetOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");

    await ctx.db.patch(caller, { class: undefined, onboardedAt: undefined });

    const ug = await getUserGroup(ctx, caller);
    if (!ug) return;
    if (await hasOtherHumans(ctx, ug.group._id, caller)) {
      // Teammates keep their guild; only the caller walks out.
      const progress = await ctx.db
        .query("challengeProgress")
        .withIndex("by_user", (q) => q.eq("userId", caller))
        .collect();
      for (const p of progress) {
        if (p.groupId === ug.group._id) await ctx.db.delete(p._id);
      }
      await ctx.db.delete(ug.membership._id);
    } else {
      await deleteGuildCascade(ctx, ug.group);
    }
  },
});

/** Make a simulated teammate deploy (drives a bot through the SAME deploy path).
 *  No status gate (M1.5): like the real deploy, a bot deploy during the bonus
 *  phase runs the identical pipeline and lands on the bonus meter — which is
 *  exactly what makes the whole phase browser-testable (spec §5). */
export const simulateTeammateDeploy = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");
    const ug = await getUserGroup(ctx, caller);
    if (!ug) throw new Error("No guild.");
    const challenge = await ensureCurrentChallenge(ctx, ug.group);
    return await applyDeploy(ctx, userId, ug.group, challenge);
  },
});

// --- fuel / overdrive / rally / shield controls (STR-12) ----------------------
// Every M1 acceptance scenario is drivable from the browser DevPanel: drain the
// tank to Winded/Resting, fill the Overdrive meter, receive a rally from a bot,
// and stock/spend Streak Shields — all through the SAME derivations and settle
// paths the real game uses (no magic fields that could diverge).

/** Teleport the caller's tank to N nominal battling-hours (0 → Resting,
 *  ≤6 → Winded, >6 → Battling; clamped to the 48h cap). The elapsed window is
 *  SETTLED FIRST at the old level — banking idle damage over the same walk when
 *  a boss is live — so the standing settle-before-change invariant holds even
 *  under dev teleports. */
export const setFuelHours = mutation({
  args: { hours: v.number() },
  handler: async (ctx, { hours }) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");
    const now = await effectiveNow(ctx);
    const ug = await getUserGroup(ctx, caller);
    if (ug) {
      const challenge = await ensureCurrentChallenge(ctx, ug.group);
      // Status-agnostic settle (2026-07-16 audit, STR-84): the old
      // active-only branch settled fuel alone during a victory week ("won"),
      // orphaning lastIdleCollectedAt (later mispriced by the damage-only
      // lead-in). settleFuelAndIdle routes "won" damage into the bonus meter
      // (idle.ts), so one shared-walk path serves both phases.
      const progress = await ensureProgress(ctx, challenge, caller);
      await settleFuelAndIdle(
        ctx,
        caller,
        progress,
        now,
        challenge.boostMult ?? 1, // guild-wide boost stamped on this week (STR-56)
      );
      if (challenge.status === "active") {
        await resolveBoss(ctx, challenge._id);
      }
    } else {
      await settleFuel(ctx, caller, now);
    }
    // THEN set the tank (the settle above also re-stamped fuelSettledAt = now).
    await ctx.db.patch(caller, { fuel: fuelForBattlingHours(hours) });
  },
});

// fillOverdrive RETIRED (Core Loop v2 §5.4, STR-74): Overdrive is no longer a
// chargeable meter. To test it, inject a goal day (≥ DAILY_STEP_GOAL) — injectFor
// arms `overdriveActiveUntil = endOfEffectiveDay` exactly like a real sync, and
// advanceDay rolls past the reset to watch it turn off (no punishment framing).

/** Have a simulated teammate send the CALLER a rally, through the REAL
 *  applyRally path — rate limit (1/giver/day), receiver settle + Winded/Resting
 *  check, energy spend, and the rallies row (sender attribution, seen:false for
 *  the STR-15 celebration) all behave exactly like a friend's rally. The bot's
 *  Energy is topped up via the normal inject path first if it can't afford the
 *  500. Typical scenario: "Drain → Winded", then this. */
export const simulateTeammateRally = mutation({
  args: { giverId: v.id("users") },
  handler: async (ctx, { giverId }) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");
    const giver = await ctx.db.get(giverId);
    if (!giver?.isSimulated) {
      throw new Error("Pick a simulated teammate as the giver.");
    }
    const ug = await getUserGroup(ctx, caller);
    if (!ug) throw new Error("No guild.");
    const balance = Math.max(
      0,
      (await energyEarned(ctx, giverId)) - (giver.energySpent ?? 0),
    );
    if (balance < RALLY.energyCost) {
      const now = await effectiveNow(ctx);
      const tz = ug.group.tzOffsetMinutes ?? 0;
      const today = dayString(now, tz);
      const dayMax = await stepsForDate(ctx, giverId, today);
      await injectFor(
        ctx,
        giverId,
        dayMax + (RALLY.energyCost - balance),
        today,
        tz,
      );
    }
    return await applyRally(ctx, giverId, caller);
  },
});

/** Drain a SIMULATED teammate's tank to N nominal battling-hours (default 0 →
 *  Resting; ≤6 → Winded), so the STR-15 "Send Rally" affordance is exercisable
 *  in the browser: a drained bot shows up in rally.eligibleTeammates exactly
 *  like a tired friend would. Settle-before-change invariant held (same shape
 *  as setFuelHours): the bot's elapsed window banks its idle damage honestly
 *  before the tank is teleported. */
export const drainTeammate = mutation({
  args: { userId: v.id("users"), hours: v.optional(v.number()) },
  handler: async (ctx, { userId, hours }) => {
    assertDevEnabled();
    const bot = await ctx.db.get(userId);
    if (!bot?.isSimulated) {
      throw new Error("Pick a simulated teammate to drain.");
    }
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");
    const now = await effectiveNow(ctx);
    const ug = await getUserGroup(ctx, caller);
    if (ug) {
      const challenge = await ensureCurrentChallenge(ctx, ug.group);
      // Status-agnostic settle (2026-07-16 audit, STR-84) — same reason as
      // setFuelHours above: victory-week drains must price the bot's idle
      // window through the shared walk (into the bonus meter), not orphan it.
      const progress = await ensureProgress(ctx, challenge, userId);
      await settleFuelAndIdle(
        ctx,
        userId,
        progress,
        now,
        challenge.boostMult ?? 1,
      );
      if (challenge.status === "active") {
        await resolveBoss(ctx, challenge._id);
      }
    } else {
      await settleFuel(ctx, userId, now);
    }
    await ctx.db.patch(userId, { fuel: fuelForBattlingHours(hours ?? 0) });
  },
});

/** Put one Streak Shield in the caller's pocket, through the same cap rule real
 *  earning uses (max 2 — overflow is lost). Ledger earning settles first so the
 *  grant stacks on the true pocket. */
export const grantShield = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");
    const now = await effectiveNow(ctx);
    const held = await settleShieldEarning(ctx, caller, now);
    await ctx.db.patch(caller, { shieldsHeld: shieldsAfterEarning(held) });
  },
});

/** Take one Shield back out of the pocket (floors at 0). */
export const consumeShield = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");
    const user = await ctx.db.get(caller);
    if (!user) throw new Error("User row missing.");
    await ctx.db.patch(caller, {
      shieldsHeld: Math.max(0, (user.shieldsHeld ?? 0) - 1),
    });
  },
});
