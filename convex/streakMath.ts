// =============================================================================
// Streak continuation + Streak Shield math — PURE functions only (no Convex
// imports), like fuelMath. Spec §6 (Duolingo pattern).
// =============================================================================
// Shields are earned by hitting the daily step goal on 5 days within one
// Mon–Sun week (max 2 held, never double-earned for the same week) and are
// AUTO-CONSUMED silently to bridge missed deploy days: the streak survives a
// shielded day (it does NOT increment for it, and does NOT reset).
//
// GUARDRAIL (write in stone): shields are BONUS protection on top of the game's
// base forgiveness — the base forgiveness is never charged for. Concretely:
//   - deploying with the chain intact (yesterday or today) consumes NOTHING;
//   - a gap the shields can't fully cover consumes NOTHING (burning shields on
//     an already-lost streak would punish — loss-framing applies to bonuses
//     only, never twice).
//
// Everything here is deterministic from (lastDeployDate, today, shieldsHeld):
// consumption "happens" on the missed day conceptually, but is COMPUTED at the
// next deploy — the same settle-on-interaction shape as fuel/idle, and the
// result is identical no matter when that deploy occurs on `today`.
//
// NOTE the ".ts" import extension: it lets Node's type-stripping run this file
// directly in tests/shields.test.mjs (see fuelMath.ts for the same pattern).
// =============================================================================
import { STREAK_SHIELD } from "./gameConfig.ts";

const DAY_MS = 86_400_000;

/** Whole days from `a` to `b` ("YYYY-MM-DD" strings; positive when b is later). */
export function daysBetweenDates(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

/** Does a week with this many goal-hit days earn a shield? (5+ of 7) */
export function weekEarnsShield(goalDays: number): boolean {
  return goalDays >= STREAK_SHIELD.goalDaysPerWeekToEarn;
}

/** Credit one earned shield, clamped to the pocket (max 2 — overflow is lost,
 *  like the fuel tank cap). */
export function shieldsAfterEarning(held: number): number {
  return Math.min(Math.max(0, held) + 1, STREAK_SHIELD.maxHeld);
}

export type StreakContinuation = {
  /** The streak count AFTER deploying on `today`. */
  streak: number;
  /** Shields consumed to bridge missed days (only ever > 0 when they SAVE it). */
  shieldsConsumed: number;
  /** True when this is the first deploy of `today` (drives the guaranteed crit). */
  firstToday: boolean;
  /** True when the previous chain was lost (reset to 1, shields couldn't cover). */
  broken: boolean;
};

/**
 * The ONE streak-continuation rule, shared by the deploy (combat.ts) and the
 * dashboard preview (game.ts) so the shown streak/multiplier equals what a
 * deploy actually applies:
 *   - already deployed today            → unchanged, nothing consumed
 *   - deployed yesterday                → +1 (base forgiveness: costs nothing)
 *   - missed N days, shieldsHeld ≥ N    → each missed day is silently bridged
 *     by a shield (the streak SURVIVED those days without incrementing), and
 *     today's deploy extends the surviving chain: +1, N shields consumed
 *   - missed N days, shieldsHeld < N    → chain resets to 1, NOTHING consumed
 *   - first-ever deploy / date anomaly  → fresh chain at 1
 */
export function continueStreak(args: {
  prevStreak: number;
  shieldsHeld: number;
  lastDeployDate: string | undefined;
  today: string;
}): StreakContinuation {
  const { prevStreak, shieldsHeld, today, lastDeployDate } = args;

  if (lastDeployDate === today) {
    return {
      streak: prevStreak,
      shieldsConsumed: 0,
      firstToday: false,
      broken: false,
    };
  }
  if (lastDeployDate === undefined) {
    // First-ever deploy: a fresh chain begins.
    return { streak: 1, shieldsConsumed: 0, firstToday: true, broken: false };
  }

  const diff = daysBetweenDates(lastDeployDate, today);
  if (diff === 1) {
    // Deployed yesterday — the chain simply continues. GUARDRAIL: no shield is
    // EVER consumed for a day that wasn't missed.
    return {
      streak: prevStreak + 1,
      shieldsConsumed: 0,
      firstToday: true,
      broken: false,
    };
  }
  if (diff <= 0) {
    // Date anomaly (dev clock moved backwards): start over, consume nothing —
    // matches the pre-shield behavior for any non-yesterday last date.
    return { streak: 1, shieldsConsumed: 0, firstToday: true, broken: true };
  }

  const missedDays = diff - 1;
  if (missedDays <= Math.max(0, shieldsHeld)) {
    // Auto-apply, silently: one shield per missed day. The streak survived
    // those days AT THE SAME COUNT (no increment, no reset) — and today's
    // deploy now extends the surviving chain as normal.
    return {
      streak: prevStreak + 1,
      shieldsConsumed: missedDays,
      firstToday: true,
      broken: false,
    };
  }
  // Not enough shields to bridge the whole gap: the chain is lost. Consume
  // NOTHING — shields are bonus protection, and charging them for a streak
  // they can't save would punish twice.
  return { streak: 1, shieldsConsumed: 0, firstToday: true, broken: true };
}
