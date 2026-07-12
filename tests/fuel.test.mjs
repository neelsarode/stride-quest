// =============================================================================
// Fuel math tests — pure functions, no Convex. Run with:
//   node --experimental-strip-types --test tests/
// (the flag lets Node load the .ts modules directly; they use erasable-types-
// only syntax). All expected numbers below are hand-computed from the tunables:
//   burn battling 300/h · winded 150/h (×0.5) · threshold 1,800 (6h)
//   tank cap 14,400 (48h) · starter 7,200 (24h) · offline cap 10h
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TANK_CAP_FUEL,
  STARTER_FUEL,
  WINDED_THRESHOLD_FUEL,
  WINDED_BURN_PER_HOUR,
  fuelStateFor,
  burnRateForState,
  walkFuel,
  cappedElapsedMs,
  addFuel,
  hoursToEmpty,
} from "../convex/fuelMath.ts";
import { FUEL, OFFLINE_CAP_HOURS } from "../convex/gameConfig.ts";

const HOUR_MS = 3_600_000;
const approx = (a, b, msg) =>
  assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} !== ${b}`);

// --- derived constants line up with the spec ---------------------------------

test("derived constants match the spec's worked numbers", () => {
  assert.equal(TANK_CAP_FUEL, 14_400); // 48h × 300
  assert.equal(STARTER_FUEL, 7_200); // 24h × 300
  assert.equal(WINDED_THRESHOLD_FUEL, 1_800); // 6h × 300
  assert.equal(WINDED_BURN_PER_HOUR, 150); // 300 × 0.5
});

// --- state derivation ---------------------------------------------------------

test("hero state: battling above threshold, winded at/below, resting at empty", () => {
  assert.equal(fuelStateFor(1_801), "battling");
  assert.equal(fuelStateFor(1_800), "winded"); // boundary: 0 < fuel ≤ 1,800 is winded
  assert.equal(fuelStateFor(1), "winded");
  assert.equal(fuelStateFor(0), "resting");
  assert.equal(burnRateForState("battling"), 300);
  assert.equal(burnRateForState("winded"), 150);
  assert.equal(burnRateForState("resting"), 0);
});

// --- battling burn -------------------------------------------------------------

test("battling burn: 2h well above the threshold burns 600", () => {
  // 7,200 − 2h × 300 = 6,600; single battling segment.
  const w = walkFuel(7_200, 2 * HOUR_MS);
  assert.equal(w.endFuel, 6_600);
  assert.equal(w.burned, 600);
  assert.equal(w.segments.length, 1);
  assert.equal(w.segments[0].state, "battling");
  approx(w.segments[0].hours, 2);
});

// --- winded threshold crossing (piecewise split within ONE window) -------------

test("threshold crossing splits one window into battling + winded segments", () => {
  // Start 2,100. Battling: (2,100 − 1,800) / 300 = 1h (burn 300).
  // Remaining 3h winded: 3 × 150 = 450. End = 2,100 − 300 − 450 = 1,350.
  const w = walkFuel(2_100, 4 * HOUR_MS);
  assert.equal(w.segments.length, 2);
  assert.equal(w.segments[0].state, "battling");
  approx(w.segments[0].hours, 1);
  assert.equal(w.segments[1].state, "winded");
  approx(w.segments[1].hours, 3);
  approx(w.endFuel, 1_350);
  approx(w.burned, 750);
});

// --- resting floor: never negative ---------------------------------------------

test("running dry floors at 0 — resting is never punished, never negative", () => {
  // 300 fuel is winded: empties in 300 / 150 = 2h; the other 8h are resting.
  const w = walkFuel(300, 10 * HOUR_MS);
  assert.equal(w.endFuel, 0);
  approx(w.burned, 300);
  const resting = w.segments.find((s) => s.state === "resting");
  approx(resting.hours, 8);
  // An already-empty tank burns nothing at all.
  const empty = walkFuel(0, 5 * HOUR_MS);
  assert.equal(empty.endFuel, 0);
  assert.equal(empty.burned, 0);
});

// --- tank cap -------------------------------------------------------------------

test("tank cap: adds clamp at 14,400, overflow is lost", () => {
  assert.equal(addFuel(14_000, 1_000), 14_400);
  assert.equal(addFuel(7_200, 999_999), 14_400);
  assert.equal(addFuel(0, 500), 500); // normal add untouched
  assert.equal(addFuel(100, 0), 100); // zero add is a no-op
});

// --- offline-cap pause -----------------------------------------------------------

test("offline cap: elapsed beyond 10h is paused, not burned", () => {
  const t0 = 1_000_000;
  // 30h away → only 10h of active time settles.
  assert.equal(cappedElapsedMs(t0, t0 + 30 * HOUR_MS), OFFLINE_CAP_HOURS * HOUR_MS);
  const w = walkFuel(7_200, cappedElapsedMs(t0, t0 + 30 * HOUR_MS));
  assert.equal(w.burned, 3_000); // 10h × 300, NOT 30h worth
  assert.equal(w.endFuel, 4_200);
  // Clock going backwards (dev time-travel) settles nothing rather than crediting.
  assert.equal(cappedElapsedMs(t0, t0 - HOUR_MS), 0);
});

// --- the hand-computed fueled → winded → resting day (burn side; STR-7 adds damage)

test("a 3,600-fuel day: 6h battling → 12h winded → 6h resting", () => {
  // Battling: (3,600 − 1,800) / 300 = 6h, burns 1,800 → at threshold.
  // Winded: 1,800 / 150 = 12h, burns 1,800 → empty at hour 18.
  // Resting: hours 18–24 burn nothing. Total burned = 3,600, end = 0.
  const w = walkFuel(3_600, 24 * HOUR_MS);
  assert.equal(
    w.segments.map((s) => s.state).join(","),
    "battling,winded,resting",
  );
  approx(w.segments[0].hours, 6);
  approx(w.segments[1].hours, 12);
  approx(w.segments[2].hours, 6);
  assert.equal(w.endFuel, 0);
  approx(w.burned, 3_600);
});

// --- time-to-empty (what the UI shows) -------------------------------------------

test("hoursToEmpty stretches the winded tail to double duration", () => {
  approx(hoursToEmpty(0), 0);
  approx(hoursToEmpty(1_800), 12); // 6 nominal hours last 12 real hours
  approx(hoursToEmpty(3_600), 18); // 6h battling + 12h winded
  approx(hoursToEmpty(STARTER_FUEL), 30); // 18h battling + 12h winded
});

// --- config sanity (spec anchors) -------------------------------------------------

test("burn-rate anchor: a full 24h of fighting costs less than the 8k goal day", () => {
  assert.ok(FUEL.burnPerHourBattling * 24 < 8_000); // 7,200 < 8,000
});
