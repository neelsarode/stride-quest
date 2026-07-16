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
import { STREAK, streakMultiplierFrom } from "./gameConfig";

const DAY_MS = 86_400_000;

/** Average steps/day across the streak's RECENT day range — the last
 *  min(streakCount, STREAK.intensityWindowDays) days ending today. The window
 *  cap (2026-07-16 audit, STR-84) bounds the ledger scan that runs on EVERY
 *  dashboard read and deploy (a 200-day streak used to read 200 days of
 *  entries); the intensity axis now reflects recent effort, while the
 *  day-count axis (streakMultiplierFrom's dayBonus) still uses the full
 *  streakCount. Both consumers — deploy (combat.ts) and the dashboard preview
 *  (game.ts) — go through computeStreakMultiplier below, so the cap applies to
 *  both identically and shown == applied still holds. */
export async function avgStepsOverStreak(
  ctx: QueryCtx,
  userId: Id<"users">,
  tzOffsetMinutes: number | undefined,
  effNow: number,
  streakCount: number,
  today: string,
): Promise<number> {
  if (streakCount <= 0) return 0;
  const windowDays = Math.min(streakCount, STREAK.intensityWindowDays);
  const startDate = dayString(
    effNow - (windowDays - 1) * DAY_MS,
    tzOffsetMinutes ?? 0,
  );
  const total = await stepsForWeek(ctx, userId, startDate, today);
  return total / windowDays;
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
