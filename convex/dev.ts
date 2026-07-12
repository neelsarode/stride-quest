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
} from "./time";
import { getUserGroup } from "./players";
import { FUEL, multiplierForJobLevel } from "./gameConfig";
import { applyDeploy, ensureCurrentChallenge } from "./combat";
import { stepsForDate } from "./steps";
import { grantFuel, grantStarterFuelIfNew } from "./fuel";
import { STARTER_FUEL } from "./fuelMath";

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
    const now = await effectiveNow(ctx);
    const day = date ?? dayString(now, ug?.group.tzOffsetMinutes ?? 0);
    await injectFor(ctx, userId, stepCount, day);
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
      await injectFor(
        ctx,
        botId,
        dailySteps,
        dayString(now, ug.group.tzOffsetMinutes ?? 0),
      );
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
        lastIdleCollectedAt: now,
        idleMultiplierSnapshot: 1,
        updatedAt: Date.now(),
      });
    }

    // …ensure THIS week's boss exists and is active (cleared damage ⇒ not defeated)…
    const ug = await getUserGroup(ctx, caller);
    if (ug) {
      const challenge = await ensureCurrentChallenge(ctx, ug.group);
      if (challenge.status !== "active") {
        await ctx.db.patch(challenge._id, { status: "active" });
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
      overdriveExcessSpent: 0,
      overdriveActiveUntil: undefined,
    });
  },
});

/** Make a simulated teammate deploy (drives a bot through the SAME deploy path). */
export const simulateTeammateDeploy = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    assertDevEnabled();
    const caller = await getAuthUserId(ctx);
    if (caller === null) throw new Error("Not signed in.");
    const ug = await getUserGroup(ctx, caller);
    if (!ug) throw new Error("No guild.");
    const challenge = await ensureCurrentChallenge(ctx, ug.group);
    if (challenge.status !== "active") throw new Error("No active boss.");
    return await applyDeploy(ctx, userId, ug.group, challenge);
  },
});

// (triggerWeeklyReset arrives with ensureCurrentChallenge in chunk 2b-9.)
