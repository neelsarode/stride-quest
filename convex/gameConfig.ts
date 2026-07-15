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

/** Fairness: a personal daily step goal; hitting it celebrates regardless of total.
 *  Core Loop v2 (spec §6): lowered 8,000 → 6,000 so the goal is reachable and its
 *  reward — auto-Overdrive ×2 until the next daily reset — fires most days. Re-anchored
 *  in lockstep with FUEL.burnPerHourBattling (24h of battling must stay < a goal day)
 *  and also feeds the streak-intensity ratio and the Overdrive trigger. */
export const DAILY_STEP_GOAL = 6000; // TUNABLE start
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
 *  time-to-empty. Core Loop v2 (spec §6) re-anchored burnPerHourBattling 300 → 225
 *  alongside DAILY_STEP_GOAL 8,000 → 6,000: a full 24h of fighting now costs 5,400
 *  steps — still under the 6k daily goal, so goal-hitters bank a ~600-fuel (~+2.7h)
 *  surplus instead of treading water. Hero states: Battling (fuel above the winded
 *  threshold), Winded (low fuel: half damage, half burn — the last nominal 6h
 *  stretch to 12), Resting (empty: no damage, no burn, never punished). The derived
 *  anchors (TANK_CAP/STARTER/WINDED_THRESHOLD/winded rate in fuelMath.ts) re-anchor
 *  automatically off burnPerHourBattling — see that file. */
export const FUEL = {
  fuelPerStep: 1, // TUNABLE start
  burnPerHourBattling: 225, // TUNABLE start — was 300; 24h of fighting ≈ 5,400 steps (spec §6)
  tankCapHours: 48, // TUNABLE start — derived TANK_CAP 10,800 fuel max banked
  starterFuelHours: 24, // TUNABLE start — new heroes fight from minute one (derived 5,400)
  windedThresholdHours: 6, // TUNABLE start — derived WINDED_THRESHOLD = 1,350 fuel
  windedDamageMult: 0.5, // TUNABLE start
  windedBurnMult: 0.5, // TUNABLE start
} as const;

/** Overdrive (Core Loop v2, spec §5.4 / §6): RETRIGGERED from the old
 *  charge-then-activate fever mode into an automatic goal-hit reward. Hitting
 *  DAILY_STEP_GOAL auto-enters Overdrive at ×idleDamageMult until the next daily
 *  reset (no meter, no ACTIVATE button, no stored charge), boosting BOTH the
 *  continuous idle attacks AND Super Attacks. Still a pure reward — fuel burn is
 *  never affected. */
export const OVERDRIVE = {
  idleDamageMult: 2, // TUNABLE start — was 3; all-day uptime → a gentler multiplier (spec §6.1)
  boostsSuperAttack: true, // TUNABLE start — the ×2 also multiplies the Super Attack damage line (spec §5.4)
  // Core Loop v2 (STR-74) RETIRED the whole charge/activate model: the old
  // fullChargeExcessSteps / durationHours / maxStoredCharges fields are DELETED
  // (nothing reads them anymore — the charge helpers, the activate mutation, the
  // fixed window, and the fillOverdrive dev tool all went with them).
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
  // Retuned 60k → 150k for the fuel hybrid, then 150k → 300k for Core Loop v2
  // (spec §6): all-day Overdrive ×2 + Overdrive-on-Super roughly doubles engaged
  // per-member output, so the boss HP rises to hold the ~day-5 kill. Bonus tiers
  // auto-scale (they're fractions of bossMaxHP). — TUNABLE start
  baseHP: 300_000,
  tierScaling: 1.4, // each kill-spawn is 40% tougher — TUNABLE start
  placeholderMaxHP: 100_000, // fallback only
} as const;

// ============================================================================
// M1.5 TUNABLES — Bonus Boss / victory week (spec: docs/superpowers/specs/
// 2026-07-14-bonus-boss-design.md §4). Every value is a STARTING value.
// ============================================================================

/** Bonus Boss: when the weekly boss dies early, its crowned form rises for the
 *  rest of the week. No HP — an ACCUMULATING damage meter. At Monday rollover
 *  the guild earns a next-week damage multiplier tiered by total bonus damage.
 *  Floor is ×1.0 (ignoring it costs nothing); the boost is EARNED by walking
 *  only — never purchasable (M3 guardrail). */
export const BONUS_BOSS = {
  namePrefix: "Crowned", // display name: "Crowned <bossName>" — TUNABLE start
  // Reward tiers — thresholds are FRACTIONS of the KILLED boss's bossMaxHP,
  // which already scales with member count × difficulty tier (bossMaxHP()), so
  // small guilds and late tiers inherit the right scale for free. Reaching a
  // threshold is INCLUSIVE (damage ≥ threshold). Keep tiers ascending in BOTH
  // fields — nextBonusTierTarget() walks them in order.
  tiers: [
    { thresholdFrac: 0.25, boostMult: 1.1 }, // TUNABLE start
    { thresholdFrac: 0.5, boostMult: 1.2 }, // TUNABLE start
    { thresholdFrac: 1.0, boostMult: 1.35 }, // a full second boss — TUNABLE start
  ],
  maxBoostMult: 1.5, // hard safety ceiling on the stamped mult — TUNABLE start
  // What the boost multiplies. Decided: "all" (deploys + idle + next week's own
  // bonus damage) — one sentence to explain, fair to every playstyle; the two
  // multiply sites are gated on this, so re-scoping is a config flip.
  boostAppliesTo: "all" as "all" | "deploys" | "idle", // TUNABLE start
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

/** The bonus tiers as ABSOLUTE damage thresholds (thresholdFrac × the killed
 *  boss's bossMaxHP), each with its (maxBoostMult-clamped) reward. This is the
 *  ONE place fractions become absolute numbers: bonusTierFor and
 *  nextBonusTierTarget both walk THIS list, and the dashboard exposes it
 *  verbatim as the meter's tier markers (STR-56, spec §5) — so the markers a
 *  player sees, the "damage to go" preview, and the mult the rollover stamps
 *  can never disagree, by construction. Thresholds are left un-rounded (they
 *  must equal exactly what the ≥ comparison uses); display rounding is the
 *  UI's job. */
export function bonusTiersFor(
  killedBossMaxHP: number,
): { threshold: number; boostMult: number }[] {
  return BONUS_BOSS.tiers.map((t) => ({
    threshold: t.thresholdFrac * killedBossMaxHP,
    boostMult: Math.min(t.boostMult, BONUS_BOSS.maxBoostMult),
  }));
}

/** Bonus Boss reward tier from the party's accumulating bonus damage.
 *  `killedBossMaxHP` is the bossMaxHP of the boss the crew KILLED (member-count
 *  × tier scaling already inside), so the tiers inherit every scale for free.
 *  Tier 0 / ×1.0 below the first threshold; reaching a threshold is INCLUSIVE
 *  (damage ≥ threshold); the mult is clamped by BONUS_BOSS.maxBoostMult (via
 *  bonusTiersFor). Pure function so the rollover stamping (spawnBoss) and the
 *  UI tier preview compute it identically — the number shown is ALWAYS the
 *  number applied. */
export function bonusTierFor(
  totalBonusDamage: number,
  killedBossMaxHP: number,
): { tier: number; mult: number } {
  if (killedBossMaxHP <= 0) return { tier: 0, mult: 1 }; // defensive: no boss, no boost
  const tiers = bonusTiersFor(killedBossMaxHP);
  let tier = 0;
  let mult = 1;
  for (let i = 0; i < tiers.length; i++) {
    if (totalBonusDamage >= tiers[i].threshold) {
      tier = i + 1;
      mult = tiers[i].boostMult;
    }
  }
  return { tier, mult };
}

/** The NEXT bonus tier to chase ("38,400 damage to ×1.35"), or null once the
 *  max tier is reached. Same inputs as bonusTierFor — and it goes THROUGH
 *  bonusTierFor + bonusTiersFor, so the preview readout can never disagree
 *  with what the rollover will stamp. */
export function nextBonusTierTarget(
  totalBonusDamage: number,
  killedBossMaxHP: number,
): { damageToGo: number; mult: number } | null {
  if (killedBossMaxHP <= 0) return null; // defensive: no boss, nothing to chase
  const { tier } = bonusTierFor(totalBonusDamage, killedBossMaxHP);
  const tiers = bonusTiersFor(killedBossMaxHP);
  if (tier >= tiers.length) return null;
  const next = tiers[tier]; // tiers[tier] IS the next one (tier is 1-based)
  return {
    damageToGo: Math.max(0, next.threshold - totalBonusDamage),
    mult: next.boostMult,
  };
}

/** The boost multiplier a damage CHANNEL actually applies, honoring the
 *  BONUS_BOSS.boostAppliesTo scope gate (spec §4 — decided "all", but the two
 *  multiply sites route through here so a "deploys"/"idle" re-scope is a
 *  config flip, never a logic change). `stampedBoostMult` is the current
 *  challenge's `boostMult` — absent (no reward stamped) means the ×1.0 floor.
 *  `scope` is injectable for tests only; production callers use the default. */
export function effectiveBoostMult(
  channel: "deploys" | "idle",
  stampedBoostMult: number | undefined,
  scope: "all" | "deploys" | "idle" = BONUS_BOSS.boostAppliesTo,
): number {
  if (scope !== "all" && scope !== channel) return 1;
  return stampedBoostMult ?? 1;
}
