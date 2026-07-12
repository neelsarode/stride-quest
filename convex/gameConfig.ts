// =============================================================================
// GAME CONFIG — all balance/tuning numbers live here (data, not logic).
// =============================================================================
// Pure data with no Convex imports, so BOTH the backend (convex/*) and the app
// (src/*) import the exact same numbers. Re-balancing the game = editing this
// file, never the game logic.
//
// Phase 1 only displays a few of these. Phase 2 (combat, jobs, deploy) consumes
// the rest. They're defined now so the structure is locked in early.
// =============================================================================

/** A player's Job advances by hitting CUMULATIVE weekly step thresholds.
 *  Jobs reset every Monday. Index 0 = Job 1 (the starting job). */
export const JOB_THRESHOLDS = [0, 10_000, 25_000, 50_000, 75_000] as const;

/** Idle-damage multiplier granted by each Job (same index as JOB_THRESHOLDS).
 *  Job 1 = ×1 … Job 5 = ×10. */
export const JOB_MULTIPLIERS = [1, 2, 3.5, 6, 10] as const;

/** Human-readable Warrior job names — matches the sprite folders in /characters.
 *  (MVP ships ONE class. The class/job system is data-driven so adding the other
 *  classes later is a data change, not a rewrite — see CLASSES below.) */
export const WARRIOR_JOB_NAMES = [
  "Rookie",
  "Strider",
  "Vanguard",
  "Champion",
  "Warlord",
] as const;

/** Idle combat: damage accrues even while the app is closed, but only up to this
 *  many hours. Opening the app "collects" the accrued damage onto the boss. */
export const OFFLINE_CAP_HOURS = 10;

// ============================================================================
// PHASE 2 TUNABLES — every value below is a STARTING value to tune in playtest.
// ============================================================================

/** Meters: how much each real step grants. (1 step = 1 of each to start.) */
export const ENERGY_PER_STEP = 1; // TUNABLE start
export const XP_PER_STEP = 1; // TUNABLE start (Job XP == weekly steps while = 1)

/** Deploy: how much boss damage one Energy buys. */
export const DAMAGE_PER_ENERGY = 1; // TUNABLE start

/** Idle combat: base damage-per-hour at Job 1 (×1). Scales by the job multiplier.
 *  Chosen so idle feels present but the deploy still clearly matters most. */
export const BASE_IDLE_DPH = 150; // TUNABLE start
/** Offline idle accrues up to this many hours, then pauses. */
export const OFFLINE_CAP_MS = OFFLINE_CAP_HOURS * 60 * 60 * 1000;

/** Deploy crit. */
export const CRIT = { chance: 0.1, multiplier: 2 } as const; // TUNABLE start

/** Streaks: the deploy multiplier rewards THREE things — how many consecutive
 *  days you've deployed, how hard you walked during the streak (avg steps/day vs
 *  the goal), and your job level. See streakMultiplierFrom() below.
 *    streakMult = 1 + dayBonus + intensityBonus + jobBonus   (capped)
 *  The first deploy of the day is also a guaranteed crit (stacks on top). */
export const STREAK = {
  // length
  perDayBonus: 0.08, // +8% per consecutive day — TUNABLE start
  perDayBonusCap: 0.8, // day component caps at +80% (~11 days) — TUNABLE start
  // intensity: avg steps/day during the streak, relative to DAILY_STEP_GOAL
  intensityBonusAtGoal: 0.25, // hitting the goal avg each day → +25% — TUNABLE start
  intensityBonusCap: 0.6, // intensity caps at +60% (≈ 2.4× goal avg) — TUNABLE start
  // progression
  jobBonusPerLevel: 0.1, // +10% per job above Job 1 (Job 5 → +40%) — TUNABLE start
  // overall safety ceiling
  maxStreakMult: 3.0, // hard cap ×3.0 — TUNABLE start
  firstDeployGuaranteedCrit: true, // TUNABLE start
} as const;

/** Fairness: a personal daily step goal; hitting it celebrates regardless of total. */
export const DAILY_STEP_GOAL = 8000; // TUNABLE start
/** Floor so day-1 players (no history) aren't divide-by-zero in improvement scoring. */
export const IMPROVEMENT_FLOOR = 4000; // TUNABLE start

/** Recognition (Phase 2b): improvement vs each player's own rolling average. */
export const RECOGNITION = {
  improvementWeight: 0.7,
  consistencyWeight: 0.3,
  baselineWindowDays: 7,
} as const; // TUNABLE start

/** Weekly boss. HP scales with crew size and difficulty tier so finishes stay
 *  close. bossMaxHP(tier, members) = baseHP × max(1,members) × tierScaling^(tier−1). */
export const BOSS = {
  defaultName: "The Sloth Tyrant",
  baseHP: 60_000, // per-member baseline — TUNABLE start (solo-beatable in ~a week)
  tierScaling: 1.4, // each kill-spawn is 40% tougher — TUNABLE start
  placeholderMaxHP: 100_000, // fallback only
} as const;

/** Data-driven class registry. MVP ships only "warrior" but the shape is here so
 *  the other classes slot in as DATA later (no logic changes). */
export const CLASSES = {
  warrior: {
    key: "warrior",
    displayName: "Warrior",
    jobNames: WARRIOR_JOB_NAMES,
    // sprite folder names under /characters/warrior/<jobFolder>/
    jobFolders: [
      "1_rookie",
      "2_strider",
      "3_vanguard",
      "4_champion",
      "5_warlord",
    ],
  },
} as const;

export type ClassKey = keyof typeof CLASSES;
export const MVP_CLASS: ClassKey = "warrior";

/** Given cumulative weekly steps, returns the Job level (1–5). */
export function jobLevelForWeeklySteps(weeklySteps: number): number {
  let level = 1;
  for (let i = 0; i < JOB_THRESHOLDS.length; i++) {
    if (weeklySteps >= JOB_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

/** Idle-damage multiplier for a given Job level (1–5). */
export function multiplierForJobLevel(jobLevel: number): number {
  return JOB_MULTIPLIERS[Math.min(jobLevel, JOB_MULTIPLIERS.length) - 1];
}

/** Weekly cumulative steps needed to reach the NEXT job, or null if maxed. */
export function nextJobThreshold(jobLevel: number): number | null {
  return jobLevel < JOB_THRESHOLDS.length ? JOB_THRESHOLDS[jobLevel] : null;
}

/** Boss max HP from difficulty tier (1+) and crew size. */
export function bossMaxHP(tier: number, memberCount: number): number {
  return Math.round(
    BOSS.baseHP *
      Math.max(1, memberCount) *
      Math.pow(BOSS.tierScaling, Math.max(0, tier - 1)),
  );
}

/** Deploy streak multiplier from streak length + intensity (avg steps/day during
 *  the streak) + job level. Pure function so both the deploy and the dashboard
 *  preview compute it identically. */
export function streakMultiplierFrom(
  streakCount: number,
  avgStepsDuringStreak: number,
  jobLevel: number,
): number {
  if (streakCount <= 0) return 1;
  const dayBonus = Math.min(
    STREAK.perDayBonus * (streakCount - 1),
    STREAK.perDayBonusCap,
  );
  const ratio = DAILY_STEP_GOAL > 0 ? avgStepsDuringStreak / DAILY_STEP_GOAL : 0;
  const intensityBonus = Math.min(
    STREAK.intensityBonusAtGoal * ratio,
    STREAK.intensityBonusCap,
  );
  const jobBonus = STREAK.jobBonusPerLevel * Math.max(0, jobLevel - 1);
  return Math.min(1 + dayBonus + intensityBonus + jobBonus, STREAK.maxStreakMult);
}
