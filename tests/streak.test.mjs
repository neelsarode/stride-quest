// =============================================================================
// Streak-multiplier + job-ladder + calendar-math tests (STR-87) — pure
// functions, no Convex. Run with:
//   node --experimental-strip-types --test tests/
// All expected numbers are hand-computed from the gameConfig tunables:
//   streakMult = min(1 + dayBonus + intensityBonus + jobBonus, 3.0)
//     dayBonus       = min(0.08 × (streak − 1), 0.8)     (cap ≈ 11 days)
//     intensityBonus = min(0.25 × avg/6000, 0.6)          (goal = 6,000)
//     jobBonus       = 0.1 × (jobLevel − 1)
//   JOB_THRESHOLDS [0, 10k, 25k, 50k, 75k] → Job 1–5
//   JOB_MULTIPLIERS [×1, ×2, ×3.5, ×6, ×10]
// The two E2E-verified multipliers from the sign-off runs (1.4125 in M2.75
// scenario 1, 2.08 in Core Loop v2 scenario 3) are reproduced from first
// principles below, so a config retune that would break those verified damage
// numbers fails here first.
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  streakMultiplierFrom,
  jobLevelForWeeklySteps,
  multiplierForJobLevel,
  nextJobThreshold,
  JOB_THRESHOLDS,
  JOB_MULTIPLIERS,
  STREAK,
  DAILY_STEP_GOAL,
} from "../convex/gameConfig.ts";
import { dayString, weekRange, endOfEffectiveDay } from "../convex/time.ts";

// --- streakMultiplierFrom: baseline ------------------------------------------

test("streak 0 (or negative) → ×1, regardless of the other axes", () => {
  assert.equal(streakMultiplierFrom(0, 99_999, 5), 1);
  assert.equal(streakMultiplierFrom(-3, 99_999, 5), 1);
});

// --- day-count axis: +8%/day after the first, capping at +80% ----------------

test("day bonus: +8% per consecutive day past the first", () => {
  // streak 2 → 0.08×1 = +8%; streak 3 → 0.08×2 = +16% (avg 0 + job 1 isolate it)
  assert.equal(streakMultiplierFrom(2, 0, 1), 1.08);
  assert.equal(streakMultiplierFrom(3, 0, 1), 1.16);
});

test("day bonus caps at +80% (reached at 11 days, flat beyond)", () => {
  assert.equal(streakMultiplierFrom(11, 0, 1), 1.8); // 0.08×10 = the 0.8 cap exactly
  assert.equal(streakMultiplierFrom(50, 0, 1), 1.8); // way past — still capped
});

// --- intensity axis: +25% × (avg/goal), capping at +60% -----------------------

test("intensity: goal-average walking → +25%; half-goal → +12.5%", () => {
  // avg == DAILY_STEP_GOAL (6,000) → ratio 1 → 0.25×1 = +25%
  assert.equal(streakMultiplierFrom(1, DAILY_STEP_GOAL, 1), 1.25);
  // avg 3,000 → ratio 0.5 → +12.5%
  assert.equal(streakMultiplierFrom(1, 3_000, 1), 1.125);
});

test("intensity caps at +60% (hit exactly at 2.4× goal, flat beyond)", () => {
  // 14,400 = 2.4 × 6,000 → 0.25×2.4 = the 0.6 cap exactly
  assert.equal(streakMultiplierFrom(1, 14_400, 1), 1.6);
  assert.equal(streakMultiplierFrom(1, 1_000_000, 1), 1.6); // absurd avg — capped
});

// --- job axis: +10% per level above Job 1 -------------------------------------

test("job bonus: +10%/level above Job 1 (Job 3 → +20%, Job 5 → +40%)", () => {
  assert.equal(streakMultiplierFrom(1, 0, 3), 1.2);
  assert.equal(streakMultiplierFrom(1, 0, 5), 1.4);
});

// --- the hard ×3.0 ceiling ----------------------------------------------------

test("all three axes maxed at legal job levels sum to ×2.8 (under the cap)", () => {
  // day cap 0.8 + intensity cap 0.6 + Job 5 bonus 0.4 = ×2.8 — with today's
  // tunables the ×3.0 hard cap is NOT reachable through in-game inputs.
  assert.equal(streakMultiplierFrom(50, 1_000_000, 5), 2.8);
});

test("hard cap ×3.0 clamps inputs that would exceed it", () => {
  // jobLevel is unclamped inside streakMultiplierFrom (real callers derive it
  // from JOB_THRESHOLDS, 1–5), so an out-of-range level is how the safety
  // ceiling can actually engage: job 30 → jobBonus +290% → clamped to ×3.0.
  assert.equal(streakMultiplierFrom(50, 1_000_000, 30), STREAK.maxStreakMult);
  assert.equal(STREAK.maxStreakMult, 3.0);
});

// --- the two E2E-verified multipliers, reproduced from first principles ------

test("reproduces the E2E-verified ×1.4125 (M2.75 scenario 1 shape)", () => {
  // Day-1 streak, Job 2, avg = 1.25× goal (7,500 at today's 6k goal):
  // 1 + 0 (day) + 0.25×1.25 = 0.3125 (intensity) + 0.1 (job) = 1.4125 —
  // the exact multiplier inside the verified `CRIT! 28,250` deploy.
  assert.equal(streakMultiplierFrom(1, 7_500, 2), 1.4125);
});

test("reproduces the E2E-verified ×2.08 (Core Loop v2 scenario 3 shape)", () => {
  // Day-5 streak, Job 5, avg 8,640 (1.44× goal):
  // 1 + 0.08×4 = 0.32 (day) + 0.25×1.44 = 0.36 (intensity) + 0.4 (job) = 2.08 —
  // the exact multiplier inside the verified `CRIT! 624,000` kill.
  assert.equal(streakMultiplierFrom(5, 8_640, 5), 2.08);
});

// --- job ladder: jobLevelForWeeklySteps boundaries ----------------------------

test("job ladder: every threshold boundary is inclusive", () => {
  assert.equal(jobLevelForWeeklySteps(0), 1);
  assert.equal(jobLevelForWeeklySteps(9_999), 1);
  assert.equal(jobLevelForWeeklySteps(10_000), 2); // exactly 10k → Job 2
  assert.equal(jobLevelForWeeklySteps(24_999), 2);
  assert.equal(jobLevelForWeeklySteps(25_000), 3);
  assert.equal(jobLevelForWeeklySteps(49_999), 3);
  assert.equal(jobLevelForWeeklySteps(50_000), 4);
  assert.equal(jobLevelForWeeklySteps(74_999), 4);
  assert.equal(jobLevelForWeeklySteps(75_000), 5);
});

test("job ladder: past the top threshold stays Job 5", () => {
  assert.equal(jobLevelForWeeklySteps(1_000_000), 5);
  assert.equal(JOB_THRESHOLDS.length, 5); // the ladder the boundaries above pin
});

test("multiplierForJobLevel: all five jobs, and over-range clamps to ×10", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(multiplierForJobLevel),
    [...JOB_MULTIPLIERS], // [1, 2, 3.5, 6, 10]
  );
  assert.equal(multiplierForJobLevel(6), 10); // defensive clamp
});

test("nextJobThreshold: each rung, and null once maxed", () => {
  assert.equal(nextJobThreshold(1), 10_000);
  assert.equal(nextJobThreshold(2), 25_000);
  assert.equal(nextJobThreshold(3), 50_000);
  assert.equal(nextJobThreshold(4), 75_000);
  assert.equal(nextJobThreshold(5), null);
});

// --- calendar math (convex/time.ts) -------------------------------------------
// tz convention == JS getTimezoneOffset(): minutes to ADD to local to reach UTC
// (UTC-5 → +300, UTC+9 → −540). 2026-07-13 is a Monday; 2026-07-19 a Sunday.

test("Sunday 23:59:59 → Monday 00:00:00 flips both the day and the week", () => {
  const sunLate = Date.UTC(2026, 6, 19, 23, 59, 59);
  const monMid = Date.UTC(2026, 6, 20, 0, 0, 0);
  assert.equal(dayString(sunLate, 0), "2026-07-19");
  assert.deepEqual(weekRange(sunLate, 0), {
    weekStart: "2026-07-13",
    weekEnd: "2026-07-19",
  });
  assert.equal(dayString(monMid, 0), "2026-07-20");
  assert.deepEqual(weekRange(monMid, 0), {
    weekStart: "2026-07-20",
    weekEnd: "2026-07-26",
  });
});

test("year-end: Dec 31 → Jan 1 crosses the year inside ONE Mon–Sun week", () => {
  // 2026-12-31 is a Thursday → its week runs Mon 2026-12-28 … Sun 2027-01-03.
  const nye = Date.UTC(2026, 11, 31, 23, 59, 59);
  const nyd = Date.UTC(2027, 0, 1, 0, 0, 0);
  assert.equal(dayString(nye, 0), "2026-12-31");
  assert.equal(dayString(nyd, 0), "2027-01-01");
  const week = { weekStart: "2026-12-28", weekEnd: "2027-01-03" };
  assert.deepEqual(weekRange(nye, 0), week);
  assert.deepEqual(weekRange(nyd, 0), week); // both sides of midnight, same week
});

test("positive tz (UTC-5, +300): Monday 03:00Z is still Sunday locally", () => {
  const mon3amUTC = Date.UTC(2026, 6, 20, 3, 0, 0); // 22:00 Sun local
  assert.equal(dayString(mon3amUTC, 300), "2026-07-19");
  assert.deepEqual(weekRange(mon3amUTC, 300), {
    weekStart: "2026-07-13",
    weekEnd: "2026-07-19",
  });
});

test("negative tz (UTC+9, −540): Sunday 16:00Z is already Monday locally", () => {
  const sun4pmUTC = Date.UTC(2026, 6, 19, 16, 0, 0); // 01:00 Mon local
  assert.equal(dayString(sun4pmUTC, -540), "2026-07-20");
  assert.deepEqual(weekRange(sun4pmUTC, -540), {
    weekStart: "2026-07-20",
    weekEnd: "2026-07-26",
  });
});

test("dayString/weekRange consistency: a day always belongs to its own week", () => {
  // ISO date strings compare correctly as strings; weekStart must be a Monday.
  const instants = [
    Date.UTC(2026, 6, 19, 23, 59, 59),
    Date.UTC(2026, 6, 20, 0, 0, 0),
    Date.UTC(2026, 11, 31, 23, 59, 59),
    Date.UTC(2027, 0, 1, 0, 0, 0),
    Date.UTC(2026, 1, 28, 12, 0, 0), // ordinary mid-year sanity point
  ];
  for (const instant of instants) {
    for (const tz of [-540, 0, 300]) {
      const day = dayString(instant, tz);
      const { weekStart, weekEnd } = weekRange(instant, tz);
      assert.ok(
        weekStart <= day && day <= weekEnd,
        `${day} outside ${weekStart}..${weekEnd} (tz ${tz})`,
      );
      assert.equal(
        new Date(`${weekStart}T00:00:00Z`).getUTCDay(),
        1,
        `weekStart ${weekStart} is not a Monday (tz ${tz})`,
      );
    }
  }
});

test("endOfEffectiveDay: next local midnight as a real instant, tz-honest", () => {
  // tz 0: 10:00Z on the 16th → midnight starting the 17th.
  assert.equal(
    endOfEffectiveDay(Date.UTC(2026, 6, 16, 10), 0),
    Date.UTC(2026, 6, 17),
  );
  // Exactly AT midnight → the NEXT midnight (a full day out), not itself.
  assert.equal(
    endOfEffectiveDay(Date.UTC(2026, 6, 17), 0),
    Date.UTC(2026, 6, 18),
  );
  // UTC-5 (+300): 02:00Z Jul 17 is 21:00 Jul 16 local → local midnight = 05:00Z.
  assert.equal(
    endOfEffectiveDay(Date.UTC(2026, 6, 17, 2), 300),
    Date.UTC(2026, 6, 17, 5),
  );
  // UTC+9 (−540): 16:00Z Sun is 01:00 Mon local → next local midnight = Tue
  // 00:00 local = Mon 15:00Z.
  assert.equal(
    endOfEffectiveDay(Date.UTC(2026, 6, 19, 16), -540),
    Date.UTC(2026, 6, 20, 15),
  );
  // Year-end: noon Dec 31 → midnight into 2027.
  assert.equal(
    endOfEffectiveDay(Date.UTC(2026, 11, 31, 12), 0),
    Date.UTC(2027, 0, 1),
  );
});
