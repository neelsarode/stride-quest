// =============================================================================
// Streak Shield tests (STR-10) — pure functions, no Convex. Run with npm test.
// Tunables in force: earn at 5 goal days per Mon–Sun week · hold max 2 ·
// auto-apply silently on a missed deploy day.
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  daysBetweenDates,
  weekEarnsShield,
  shieldsAfterEarning,
  continueStreak,
} from "../convex/streakMath.ts";
import { STREAK_SHIELD } from "../convex/gameConfig.ts";

// --- earning --------------------------------------------------------------------

test("a week earns a shield at 5+ goal days, not before", () => {
  assert.equal(weekEarnsShield(4), false);
  assert.equal(weekEarnsShield(5), true);
  assert.equal(weekEarnsShield(7), true);
  assert.equal(STREAK_SHIELD.goalDaysPerWeekToEarn, 5);
});

test("the pocket holds at most 2 — overflow is lost, never negative", () => {
  assert.equal(shieldsAfterEarning(0), 1);
  assert.equal(shieldsAfterEarning(1), 2);
  assert.equal(shieldsAfterEarning(2), 2); // capped
  assert.equal(shieldsAfterEarning(-5), 1); // defensive clamp
});

test("date math: whole days between YYYY-MM-DD strings", () => {
  assert.equal(daysBetweenDates("2026-07-06", "2026-07-07"), 1);
  assert.equal(daysBetweenDates("2026-07-06", "2026-07-13"), 7);
  assert.equal(daysBetweenDates("2026-07-06", "2026-07-06"), 0);
  assert.equal(daysBetweenDates("2026-06-30", "2026-07-01"), 1); // month edge
});

// --- acceptance: the skip scenarios ----------------------------------------------

test("acceptance: 6-day streak + 1 skipped day + 1 shield → survives, shield consumed", () => {
  // Deployed daily through Sat (streak 6), missed Sun, deploying Mon.
  const r = continueStreak({
    prevStreak: 6,
    shieldsHeld: 1,
    lastDeployDate: "2026-07-11", // Sat
    today: "2026-07-13", // Mon (Sun was missed)
  });
  assert.equal(r.broken, false); // the streak SURVIVED the skip at the same count
  assert.equal(r.shieldsConsumed, 1); // the shield silently bridged Sunday
  // The shielded day did NOT increment; today's deploy extends the surviving
  // chain as normal: 6 (through Sat) → still 6 across Sun → 7 with Mon's deploy.
  assert.equal(r.streak, 7);
  assert.equal(r.firstToday, true);
});

test("acceptance: same skip with 0 shields → the streak resets", () => {
  const r = continueStreak({
    prevStreak: 6,
    shieldsHeld: 0,
    lastDeployDate: "2026-07-11",
    today: "2026-07-13",
  });
  assert.equal(r.broken, true);
  assert.equal(r.streak, 1);
  assert.equal(r.shieldsConsumed, 0);
});

test("the dashboard's 'is it broken?' view matches: shielded skip shows the streak alive", () => {
  // Before deploying on Mon, the shown streak should still read 6 (not 0):
  // broken === false is what game.ts keys the display on.
  const withShield = continueStreak({
    prevStreak: 6,
    shieldsHeld: 1,
    lastDeployDate: "2026-07-11",
    today: "2026-07-13",
  });
  const without = continueStreak({
    prevStreak: 6,
    shieldsHeld: 0,
    lastDeployDate: "2026-07-11",
    today: "2026-07-13",
  });
  assert.equal(withShield.broken, false); // shows 6
  assert.equal(without.broken, true); // shows 0
});

// --- base forgiveness is never charged for (guardrail) -----------------------------

test("guardrail: an unbroken chain never consumes a shield", () => {
  // Deployed yesterday — plain continuation, shields untouched.
  const r = continueStreak({
    prevStreak: 6,
    shieldsHeld: 2,
    lastDeployDate: "2026-07-12",
    today: "2026-07-13",
  });
  assert.equal(r.streak, 7);
  assert.equal(r.shieldsConsumed, 0);
  // Re-deploying the same day consumes nothing and changes nothing.
  const same = continueStreak({
    prevStreak: 7,
    shieldsHeld: 2,
    lastDeployDate: "2026-07-13",
    today: "2026-07-13",
  });
  assert.equal(same.streak, 7);
  assert.equal(same.shieldsConsumed, 0);
  assert.equal(same.firstToday, false);
});

test("guardrail: a gap the shields can't cover consumes NOTHING (no double loss)", () => {
  // 3 missed days but only 2 shields: the streak is lost either way — burning
  // the shields too would punish twice. They stay in the pocket.
  const r = continueStreak({
    prevStreak: 10,
    shieldsHeld: 2,
    lastDeployDate: "2026-07-09",
    today: "2026-07-13", // missed 10th, 11th, 12th
  });
  assert.equal(r.broken, true);
  assert.equal(r.streak, 1);
  assert.equal(r.shieldsConsumed, 0);
});

// --- multi-day bridging -------------------------------------------------------------

test("two missed days with two shields: both bridged, streak survives", () => {
  const r = continueStreak({
    prevStreak: 9,
    shieldsHeld: 2,
    lastDeployDate: "2026-07-10",
    today: "2026-07-13", // missed 11th and 12th
  });
  assert.equal(r.broken, false);
  assert.equal(r.shieldsConsumed, 2);
  assert.equal(r.streak, 10);
});

// --- fresh chains + anomalies ---------------------------------------------------------

test("first-ever deploy starts a chain at 1 and consumes nothing", () => {
  const r = continueStreak({
    prevStreak: 0,
    shieldsHeld: 2,
    lastDeployDate: undefined,
    today: "2026-07-13",
  });
  assert.equal(r.streak, 1);
  assert.equal(r.shieldsConsumed, 0);
  assert.equal(r.broken, false);
});

test("a backwards date anomaly resets without consuming (pre-shield behavior)", () => {
  const r = continueStreak({
    prevStreak: 5,
    shieldsHeld: 2,
    lastDeployDate: "2026-07-14",
    today: "2026-07-13",
  });
  assert.equal(r.streak, 1);
  assert.equal(r.shieldsConsumed, 0);
});
