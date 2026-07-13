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

// ============================================================================
// PHASE 3 TUNABLES — fuel hybrid (spec: docs/superpowers/specs/
// 2026-07-12-core-loop-fuel-hybrid-design.md). Every value is a STARTING value.
// ============================================================================

/** Fuel: steps power a hero who fights 24/7. 1 step = 1 fuel; the UI shows
 *  time-to-empty. 300/h battling means a full 24h of fighting costs 7,200 steps —
 *  just under the 8k daily goal, so goal-hitters bank a surplus instead of
 *  treading water. Hero states: Battling (fuel above the winded threshold),
 *  Winded (low fuel: half damage, half burn — the last nominal 6h stretch to 12),
 *  Resting (empty: no damage, no burn, never punished). */
export const FUEL = {
  fuelPerStep: 1, // TUNABLE start
  burnPerHourBattling: 300, // TUNABLE start — 24h of fighting ≈ 7,200 steps
  tankCapHours: 48, // TUNABLE start — 14,400 fuel max banked
  starterFuelHours: 24, // TUNABLE start — new heroes fight from minute one
  windedThresholdHours: 6, // TUNABLE start — = 1,800 fuel
  windedDamageMult: 0.5, // TUNABLE start
  windedBurnMult: 0.5, // TUNABLE start
} as const;

/** Overdrive: player-activated fever mode, charged by steps PAST the daily goal.
 *  Pure reward — normal fuel burn, never a cost. */
export const OVERDRIVE = {
  fullChargeExcessSteps: 4_000, // TUNABLE start — steps past DAILY_STEP_GOAL charge the meter
  durationHours: 4, // TUNABLE start
  idleDamageMult: 3, // TUNABLE start
  maxStoredCharges: 1, // TUNABLE start
} as const;

/** Rally: gift a Winded/Resting teammate some fight time, at a small real cost
 *  to the giver (gifts that cost something carry social weight). */
export const RALLY = {
  energyCost: 500, // TUNABLE start — ≈6% of a goal day
  fuelHoursGiven: 6, // TUNABLE start
  perGiverPerDay: 1, // TUNABLE start
} as const;

/** Streak Shields: auto-applied streak freezes (forgiveness). One sick day never
 *  erases two weeks of momentum. */
export const STREAK_SHIELD = {
  goalDaysPerWeekToEarn: 5, // TUNABLE start — goal days within one Mon–Sun week
  maxHeld: 2, // TUNABLE start
  autoApply: true, // TUNABLE start
} as const;

/** Weekly boss. HP scales with crew size and difficulty tier so finishes stay
 *  close. bossMaxHP(tier, members) = baseHP × max(1,members) × tierScaling^(tier−1). */
export const BOSS = {
  defaultName: "The Sloth Tyrant",
  // Retuned 60k → 150k for the fuel hybrid: per-member weekly output rises
  // (24/7 fueled idle + daily crit deploys + Overdrive), so an engaged crew
  // kills around day 5–6 instead of one-shotting it. — TUNABLE start
  baseHP: 150_000,
  tierScaling: 1.4, // each kill-spawn is 40% tougher — TUNABLE start
  placeholderMaxHP: 100_000, // fallback only
} as const;

/** Guild membership + invite codes (M2.5 onboarding). Codes are read aloud and
 *  typed by hand between friends, so the alphabet deliberately drops the
 *  look-alike characters (0/O, 1/I/L). */
export const GUILD = {
  maxMembers: 8, // TUNABLE start — the 3–8 friend-group design target
  inviteCodeLength: 6,
  inviteCodeAlphabet: "23456789ABCDEFGHJKMNPQRSTUVWXYZ", // no 0/O/1/I/L
} as const;

/** Data-driven class registry — all 8 classes, chosen at onboarding (M2.5).
 *  Class is FLAVOR (sprites, job names, VFX): steps are the only power, so every
 *  class shares the same job thresholds/multipliers. jobFolders are the sprite
 *  folder names on disk under /characters/<class>/<jobFolder>/ — transcribed
 *  from characters/MANIFEST.md, which is ground truth. */
export const CLASSES = {
  warrior: {
    key: "warrior",
    displayName: "Warrior",
    jobNames: ["Rookie", "Strider", "Vanguard", "Champion", "Warlord"],
    jobFolders: [
      "1_rookie",
      "2_strider",
      "3_vanguard",
      "4_champion",
      "5_warlord",
    ],
  },
  mage: {
    key: "mage",
    displayName: "Mage",
    jobNames: ["Apprentice", "Adept", "Conjurer", "Sorcerer", "Archmage"],
    jobFolders: [
      "1_apprentice",
      "2_adept",
      "3_conjurer",
      "4_sorcerer",
      "5_archmage",
    ],
  },
  medic: {
    key: "medic",
    displayName: "Medic",
    jobNames: ["Acolyte", "Healer", "Cleric", "Priest", "Hierophant"],
    jobFolders: [
      "1_acolyte",
      "2_healer",
      "3_cleric",
      "4_priest",
      "5_hierophant",
    ],
  },
  archer: {
    key: "archer",
    displayName: "Archer",
    jobNames: ["Greenhorn", "Scout", "Hunter", "Ranger", "Sentinel"],
    jobFolders: [
      "1_greenhorn",
      "2_scout",
      "3_hunter",
      "4_ranger",
      "5_sentinel",
    ],
  },
  assassin: {
    key: "assassin",
    displayName: "Assassin",
    jobNames: ["Footpad", "Prowler", "Nightblade", "Assassin", "Shadowlord"],
    jobFolders: [
      "1_footpad",
      "2_prowler",
      "3_nightblade",
      "4_assassin",
      "5_shadowlord",
    ],
  },
  paladin: {
    key: "paladin",
    displayName: "Paladin",
    jobNames: ["Squire", "Knight", "Crusader", "Paladin", "Lightbringer"],
    jobFolders: [
      "1_squire",
      "2_knight",
      "3_crusader",
      "4_paladin",
      "5_lightbringer",
    ],
  },
  warlock: {
    key: "warlock",
    displayName: "Warlock",
    jobNames: ["Initiate", "Cultist", "Hexer", "Warlock", "Dreadlord"],
    jobFolders: [
      "1_initiate",
      "2_cultist",
      "3_hexer",
      "4_warlock",
      "5_dreadlord",
    ],
  },
  bard: {
    key: "bard",
    displayName: "Bard",
    jobNames: ["Busker", "Minstrel", "Troubadour", "Bard", "Maestro"],
    jobFolders: [
      "1_busker",
      "2_minstrel",
      "3_troubadour",
      "4_bard",
      "5_maestro",
    ],
  },
} as const;

export type ClassKey = keyof typeof CLASSES;
/** Every class key, in registry (display) order. The schema derives the
 *  `users.class` validator from this, so adding a class stays a data-only change. */
export const CLASS_KEYS = Object.keys(CLASSES) as ClassKey[];
/** FALLBACK class: users who haven't picked a hero yet (mid-onboarding, or
 *  legacy accounts from the warrior-only MVP) resolve to this everywhere via
 *  `user.class ?? MVP_CLASS` — a class-less doc is never an error. */
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
