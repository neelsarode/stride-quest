// =============================================================================
// Steps ledger — the source of truth.
// =============================================================================
import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getUserGroup } from "./players";
import {
  dayString,
  effectiveNow,
  effectiveWeekForTz,
  endOfEffectiveDay,
} from "./time";
import { settleFuelAndIdle } from "./idle";
import { grantFuel, grantStarterFuelIfNew } from "./fuel";
import { settleShieldEarning } from "./shields";
import {
  DAILY_STEP_GOAL,
  FUEL,
  jobLevelForWeeklySteps,
  multiplierForJobLevel,
} from "./gameConfig";

// A clearly absurd upper bound — a placeholder for real anti-cheat. The point is
// that EVERY step number flows through the server, so validation (rate limits,
// source checks, device attestation) plugs in HERE without touching game logic.
const MAX_PLAUSIBLE_DAILY_STEPS = 300_000;

const DAY_MS = 86_400_000;

/** The same ENABLE_DEV_TOOLS env gate dev.ts asserts (not imported from there —
 *  dev.ts imports this module). Real deployments leave it unset. */
function devToolsEnabled(): boolean {
  return process.env.ENABLE_DEV_TOOLS === "true";
}

/**
 * Record a step observation. The client PROPOSES a cumulative total for `date`;
 * the server RECORDS it as a brand-new immutable ledger row (never edits a past
 * row). Returns the resulting "today" total so the caller can react immediately.
 */
export const recordSteps = mutation({
  args: {
    stepCount: v.number(), // cumulative steps for the day being asserted
    source: v.union(v.literal("healthkit"), v.literal("injector")),
    date: v.optional(v.string()), // defaults to the server's effective day
  },
  handler: async (ctx, { stepCount, source, date }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");

    // Server decides which calendar day this is (guild timezone + dev clock),
    // unless an explicit date is given.
    const ug = await getUserGroup(ctx, userId);
    const tz = ug?.group.tzOffsetMinutes;
    const now = await effectiveNow(ctx);
    const today = dayString(now, tz ?? 0);

    // --- server-side validation (anti-cheat seam) ---
    // Backdating clamp (2026-07-16 audit, STR-84): an arbitrary client `date`
    // could mint energy/shields/jobs for any past day. Real clients only ever
    // need today (live sync) or yesterday (HealthKit backfilling across
    // midnight); anything else is rejected unless the deployment runs with
    // dev tools on (dev backdating keeps working there).
    let day: string;
    if (date === undefined || devToolsEnabled()) {
      day = date ?? today;
    } else {
      const yesterday = dayString(now - DAY_MS, tz ?? 0);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        (date !== today && date !== yesterday)
      ) {
        throw new ConvexError({
          code: "bad_date",
          message:
            "Steps can only sync for today or yesterday — that date is out of range.",
        });
      }
      day = date;
    }

    // Injector gate (STR-84): "injector" is the dev step source — real builds
    // sync from HealthKit only.
    if (source === "injector" && !devToolsEnabled()) {
      throw new ConvexError({
        code: "bad_source",
        message:
          "Injected steps only work on a dev build — real steps come from Health.",
      });
    }

    if (!Number.isFinite(stepCount) || stepCount < 0) {
      throw new Error("Invalid step count.");
    }
    const clamped = Math.min(Math.floor(stepCount), MAX_PLAUSIBLE_DAILY_STEPS);

    // Fuel is earned on the day-max DELTA (readings are cumulative, so only the
    // increase over what we'd already counted for this date grants new fuel).
    const prevDayMax = await stepsForDate(ctx, userId, day);

    await ctx.db.insert("stepEntries", {
      userId,
      date: day,
      stepCount: clamped,
      source,
      createdAt: Date.now(),
    });

    // First HealthKit sync with REAL data (>0) ⇒ Health is provably connected
    // (STR-48). iOS never reveals read-permission status, so evidence-of-data
    // is the only honest signal; a 0-step grant (Simulator, denied read) keeps
    // the calm CONNECT HEALTH chip on the dashboard. One-shot stamp.
    if (source === "healthkit" && clamped > 0) {
      const user = await ctx.db.get(userId);
      if (user && user.healthKitConnectedAt === undefined) {
        await ctx.db.patch(userId, { healthKitConnectedAt: Date.now() });
      }
    }

    await grantStarterFuelIfNew(ctx, userId, now);

    // SETTLE fuel + idle damage together BEFORE this sync changes any rate:
    // the elapsed window accrued at the OLD fuel level and OLD job multiplier.
    // New fuel (and a job-up's new multiplier) only apply from now on — no
    // "bank a window, then upgrade to cash it out high" exploit, same rule the
    // old flat accrual enforced on job changes.
    if (ug) {
      const { weekStart, weekEnd } = await effectiveWeekForTz(ctx, tz);
      const weekly = await stepsForWeek(ctx, userId, weekStart, weekEnd);
      const newMult = multiplierForJobLevel(jobLevelForWeeklySteps(weekly));
      // The guild's CURRENT challenge regardless of active/won status
      // (2026-07-16 audit, STR-84): during a victory week the current
      // challenge is the "won" one until Monday's rollover (M1.5), and the
      // old status:"active" lookup skipped this settle all week — grantFuel
      // below then re-stamped fuelSettledAt alone, orphaning
      // progress.lastIdleCollectedAt. The stale idle window later got priced
      // by fuelMath's damage-only lead-in at the CURRENT fuel state (wrong
      // state, wrong cap anchor), and the settle-before-Overdrive-stamp
      // invariant at the bottom of this handler was voided. settleFuelAndIdle
      // already routes "won" damage into the bonus meter (idle.ts), so
      // settling is correct in BOTH phases. Passive lookup — not
      // ensureCurrentChallenge (combat.ts imports steps.ts; rollover stays
      // the on-open/deploy path's job): prefer this week's live challenge,
      // else a not-yet-rolled prior active (the pre-existing semantic).
      const challenges = await ctx.db
        .query("challenges")
        .withIndex("by_group", (q) => q.eq("groupId", ug.group._id))
        .collect();
      const challenge =
        challenges.find(
          (c) => c.startDate === weekStart && c.status !== "expired",
        ) ??
        challenges.find((c) => c.status === "active") ??
        null;
      if (challenge) {
        const progress = await ctx.db
          .query("challengeProgress")
          .withIndex("by_challenge_and_user", (q) =>
            q.eq("challengeId", challenge._id).eq("userId", userId),
          )
          .first();
        if (progress) {
          await settleFuelAndIdle(
            ctx,
            userId,
            progress,
            now,
            challenge.boostMult ?? 1, // guild-wide boost stamped on this week (STR-56)
            newMult,
          );
        }
        // No progress row = a mid-victory-week joiner (join only creates rows
        // on an "active" boss): they have no idle stamp to orphan yet, and
        // applyIdleOnOpen's ensureProgress starts their clock fresh on open.
      }
    }

    // THEN grant the fuel earned by this sync (the settled window is empty now,
    // so grantFuel's internal settle is a no-op; the 48h cap clamps inside).
    const earnedFuel = Math.max(0, clamped - prevDayMax) * FUEL.fuelPerStep;
    await grantFuel(ctx, userId, now, earnedFuel);

    // Streak Shields (STR-10): this sync may have turned today into a goal day —
    // settle earning so protection is in the pocket BEFORE it's needed.
    await settleShieldEarning(ctx, userId, now);

    // Overdrive retrigger (Core Loop v2 §5.4): the moment today's day-max crosses
    // DAILY_STEP_GOAL, arm Overdrive ×2 until the daily reset by stamping
    // `overdriveActiveUntil = endOfEffectiveDay(now)`. This is written LAST — only
    // AFTER the settle above banked the pending fuel+idle window at the PRE-stamp
    // state — so a past window is never retro-priced with today's end-of-day stamp
    // (the settle-before-change invariant, spec §5.4). Idempotent: re-crossing the
    // goal later today just re-writes the same end-of-day ms; falling back below
    // the goal never disarms today's Overdrive (a met goal is a met goal).
    const dayMax = await stepsForDate(ctx, userId, day);
    if (dayMax >= DAILY_STEP_GOAL) {
      await ctx.db.patch(userId, {
        overdriveActiveUntil: endOfEffectiveDay(now, tz ?? 0),
      });
    }

    return dayMax;
  },
});

// ---------------------------------------------------------------------------
// Derivation helpers (plain functions, not registered endpoints). Everything
// the game shows is COMPUTED from the append-only ledger by these.
// ---------------------------------------------------------------------------

/** Today's step total = the highest cumulative reading recorded for that date. */
export async function stepsForDate(
  ctx: QueryCtx,
  userId: Id<"users">,
  date: string,
): Promise<number> {
  const entries = await ctx.db
    .query("stepEntries")
    .withIndex("by_user_and_date", (q) =>
      q.eq("userId", userId).eq("date", date),
    )
    .collect();
  return entries.reduce((max, e) => Math.max(max, e.stepCount), 0);
}

/** Sum of each day's total across an inclusive [weekStart, weekEnd] range. */
export async function stepsForWeek(
  ctx: QueryCtx,
  userId: Id<"users">,
  weekStart: string,
  weekEnd: string,
): Promise<number> {
  const entries = await ctx.db
    .query("stepEntries")
    .withIndex("by_user_and_date", (q) =>
      q.eq("userId", userId).gte("date", weekStart).lte("date", weekEnd),
    )
    .collect();

  // Take the MAX reading per day, then sum the daily maxes.
  const maxByDay = new Map<string, number>();
  for (const e of entries) {
    maxByDay.set(e.date, Math.max(maxByDay.get(e.date) ?? 0, e.stepCount));
  }
  let total = 0;
  for (const v of maxByDay.values()) total += v;
  return total;
}
