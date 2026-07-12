// =============================================================================
// Steps ledger — the source of truth.
// =============================================================================
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getUserGroup } from "./players";
import { effectiveDayForTz, effectiveNow, effectiveWeekForTz } from "./time";
import { settleIdle } from "./idle";
import { jobLevelForWeeklySteps, multiplierForJobLevel } from "./gameConfig";

// A clearly absurd upper bound — a placeholder for real anti-cheat. The point is
// that EVERY step number flows through the server, so validation (rate limits,
// source checks, device attestation) plugs in HERE without touching game logic.
const MAX_PLAUSIBLE_DAILY_STEPS = 300_000;

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
    // unless an explicit date is given (dev backdating).
    const ug = await getUserGroup(ctx, userId);
    const tz = ug?.group.tzOffsetMinutes;
    const day = date ?? (await effectiveDayForTz(ctx, tz));

    // --- server-side validation (anti-cheat seam) ---
    if (!Number.isFinite(stepCount) || stepCount < 0) {
      throw new Error("Invalid step count.");
    }
    const clamped = Math.min(Math.floor(stepCount), MAX_PLAUSIBLE_DAILY_STEPS);

    await ctx.db.insert("stepEntries", {
      userId,
      date: day,
      stepCount: clamped,
      source,
      createdAt: Date.now(),
    });

    // If this step changed the job (multiplier), SETTLE pending idle at the old
    // rate first, then snapshot the new multiplier — so idle never accrues at the
    // wrong rate and there's no "bank idle then job-up to cash out high" exploit.
    if (ug) {
      const { weekStart, weekEnd } = await effectiveWeekForTz(ctx, tz);
      const weekly = await stepsForWeek(ctx, userId, weekStart, weekEnd);
      const newMult = multiplierForJobLevel(jobLevelForWeeklySteps(weekly));
      const challenge = await ctx.db
        .query("challenges")
        .withIndex("by_group_and_status", (q) =>
          q.eq("groupId", ug.group._id).eq("status", "active"),
        )
        .first();
      if (challenge) {
        const progress = await ctx.db
          .query("challengeProgress")
          .withIndex("by_challenge_and_user", (q) =>
            q.eq("challengeId", challenge._id).eq("userId", userId),
          )
          .first();
        if (progress && (progress.idleMultiplierSnapshot ?? 1) !== newMult) {
          await settleIdle(ctx, progress, await effectiveNow(ctx), newMult);
        }
      }
    }

    return await stepsForDate(ctx, userId, day);
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
