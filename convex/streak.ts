// =============================================================================
// Streak multiplier — derives the "intensity" input (avg steps/day during the
// streak) from the step ledger so the multiplier honestly reflects how hard the
// player walked while keeping the streak. Used by BOTH the deploy (combat.ts)
// and the dashboard preview (game.ts) so the number shown == the number applied.
//
// Streak Shields (STR-10): the `streakCount` fed in here is the shield-aware
// continuation from streakMath.continueStreak — a shielded (bridged) day counts
// inside the streak's day range, so its (low) steps honestly dilute the
// intensity average while the day count itself survives.
// =============================================================================
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { stepsForWeek } from "./steps"; // generic per-day-max sum over a date range
import { dayString } from "./time";
import { streakMultiplierFrom } from "./gameConfig";

const DAY_MS = 86_400_000;

/** Average steps/day across the streak's day range [today−(n−1) … today]. */
export async function avgStepsOverStreak(
  ctx: QueryCtx,
  userId: Id<"users">,
  tzOffsetMinutes: number | undefined,
  effNow: number,
  streakCount: number,
  today: string,
): Promise<number> {
  if (streakCount <= 0) return 0;
  const startDate = dayString(
    effNow - (streakCount - 1) * DAY_MS,
    tzOffsetMinutes ?? 0,
  );
  const total = await stepsForWeek(ctx, userId, startDate, today);
  return total / streakCount;
}

/** The streak deploy multiplier + the avg-steps it was based on (for display). */
export async function computeStreakMultiplier(
  ctx: QueryCtx,
  userId: Id<"users">,
  tzOffsetMinutes: number | undefined,
  effNow: number,
  streakCount: number,
  jobLevel: number,
  today: string,
): Promise<{ multiplier: number; avgSteps: number }> {
  const avgSteps = await avgStepsOverStreak(
    ctx,
    userId,
    tzOffsetMinutes,
    effNow,
    streakCount,
    today,
  );
  return {
    multiplier: streakMultiplierFrom(streakCount, avgSteps, jobLevel),
    avgSteps,
  };
}
