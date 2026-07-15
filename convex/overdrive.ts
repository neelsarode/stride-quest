// =============================================================================
// Overdrive (Core Loop v2, spec §5.4) — RETRIGGERED goal-hit reward.
// =============================================================================
// The old charge-then-activate fever mode is RETIRED (STR-74). There is no
// meter to fill and no ACTIVATE button: the moment today's steps cross
// DAILY_STEP_GOAL, recordSteps (and the dev injector) auto-stamp
// `overdriveActiveUntil = endOfEffectiveDay(now)`, so Overdrive ×2 runs until
// the next daily reset. It boosts BOTH the continuous idle attacks (the settle
// machinery prices the window off the same stamp, fuelMath.overdriveHoursAt —
// untouched) AND the Super Attack (combat.applyDeploy, gated by
// OVERDRIVE.boostsSuperAttack). It is still a pure reward: fuel burn is never
// affected.
//
// Everything here is DERIVED from the stamp — `active = isOverdriveActive(stamp,
// now)` (the ONE shared predicate in fuelMath) — so no decay logic, no counter.
// This module now only exposes the read model the dashboard/DevPanel surface.
// =============================================================================
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { stepsForDate } from "./steps";
import { isOverdriveActive } from "./fuelMath";
import { DAILY_STEP_GOAL, OVERDRIVE } from "./gameConfig";

export type OverdriveStatus = {
  /** True while Overdrive is armed (goal hit today, end-of-day not yet passed). */
  active: boolean;
  /** The ×N applied while active (OVERDRIVE.idleDamageMult) — always exposed so
   *  the UI can show "walk to your goal for ×N" even while inactive. */
  mult: number;
  /** Effective-ms when the current arming ends (the next daily reset), or null
   *  when inactive. Raw stamp for display formatting only, never client math. */
  endsAt: number | null;
  /** Whole seconds until `endsAt` (0 when inactive) — the live countdown source. */
  remainingSeconds: number;
  /** Today's step total (the goal progress that arms Overdrive). */
  stepsToday: number;
  /** The daily step goal that must be crossed to arm Overdrive. */
  goal: number;
};

/** Read helper for the dashboard/DevPanel (spec §9). Everything is DERIVED from
 *  `overdriveActiveUntil` + today's steps + the config — no writes, no charge. */
export async function overdriveStatus(
  ctx: QueryCtx,
  user: Doc<"users">,
  effNow: number,
  date: string,
): Promise<OverdriveStatus> {
  const active = isOverdriveActive(user.overdriveActiveUntil, effNow);
  const endsAt = active ? user.overdriveActiveUntil! : null;
  const stepsToday = await stepsForDate(ctx, user._id, date);
  return {
    active,
    mult: OVERDRIVE.idleDamageMult,
    endsAt,
    remainingSeconds: endsAt
      ? Math.max(0, Math.ceil((endsAt - effNow) / 1000))
      : 0,
    stepsToday,
    goal: DAILY_STEP_GOAL,
  };
}
