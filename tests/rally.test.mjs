// =============================================================================
// Rally math tests (STR-9) — pure functions, no Convex. Run with npm test.
// Tunables in force: rally = 500 Energy → 6h of fuel · burn battling 300/h ·
// winded threshold 1,800 · tank cap 14,400 · goal 8,000/day.
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RALLY_FUEL_GRANT,
  TANK_CAP_FUEL,
  WINDED_THRESHOLD_FUEL,
  addFuel,
  fuelStateFor,
  hoursToEmpty,
} from "../convex/fuelMath.ts";
import { RALLY, FUEL, DAILY_STEP_GOAL } from "../convex/gameConfig.ts";

// --- the grant amount -----------------------------------------------------------

test("a rally grants 6 hours of battling fuel (1,800) plus the 1-fuel wake margin", () => {
  assert.equal(RALLY.fuelHoursGiven * FUEL.burnPerHourBattling, 1_800);
  assert.equal(RALLY_FUEL_GRANT, 1_801);
});

test("the boundary bite: a bare 1,800 grant would leave an EMPTY hero Winded", () => {
  // The state convention (STR-6, load-bearing for the piecewise walk) puts the
  // threshold itself in the Winded band — and a drained tank sits at exactly 0.
  // This is WHY the wake margin exists; if it ever regresses, a rallied
  // resting hero would wake Winded instead of Battling.
  assert.equal(fuelStateFor(addFuel(0, 1_800)), "winded");
  assert.equal(fuelStateFor(WINDED_THRESHOLD_FUEL), "winded");
});

// --- rally = wake-up: every eligible receiver comes back Battling -----------------

test("acceptance: rallying an EMPTY tank wakes the hero to Battling", () => {
  const after = addFuel(0, RALLY_FUEL_GRANT); // 1,801 — strictly above threshold
  assert.equal(after, 1_801);
  assert.equal(fuelStateFor(after), "battling");
});

test("rallying a Winded hero (any fuel in its band) wakes them to Battling", () => {
  for (const fuel of [1, 100, 900, 1_799, WINDED_THRESHOLD_FUEL]) {
    assert.equal(fuelStateFor(fuel), fuel > 0 ? "winded" : "resting");
    assert.equal(fuelStateFor(addFuel(fuel, RALLY_FUEL_GRANT)), "battling");
  }
});

test("a rallied-from-empty hero fights for over 12 real hours", () => {
  // 1,801 fuel: a sliver of battling, then the stretched winded tail.
  assert.ok(hoursToEmpty(addFuel(0, RALLY_FUEL_GRANT)) > 12);
});

// --- tank cap applies to the grant ------------------------------------------------

test("the tank cap clamps a rally grant (overflow is lost)", () => {
  assert.equal(addFuel(TANK_CAP_FUEL - 100, RALLY_FUEL_GRANT), TANK_CAP_FUEL);
  // In practice unreachable: an ELIGIBLE receiver is Winded/Resting (≤ 1,800
  // fuel), and 1,800 + 1,801 = 3,601 is nowhere near the 14,400 cap.
  assert.equal(
    addFuel(WINDED_THRESHOLD_FUEL, RALLY_FUEL_GRANT),
    3_601,
  );
});

// --- cost sanity (spec anchors) ----------------------------------------------------

test("cost anchor: 500 Energy ≈ 6% of a goal day — real but small", () => {
  assert.equal(RALLY.energyCost, 500);
  const share = RALLY.energyCost / DAILY_STEP_GOAL;
  assert.ok(share > 0.05 && share < 0.08, `${share} out of expected band`);
});
