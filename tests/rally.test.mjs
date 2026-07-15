// =============================================================================
// Rally math tests (STR-9) — pure functions, no Convex. Run with npm test.
// Tunables in force (re-anchored for Core Loop v2 §6 — the rally CONFIG is
// unchanged, but the derived fuel grant + goal-relative cost share moved):
// rally = 500 Energy → 6h of fuel = 1,350 · burn battling 225/h ·
// winded threshold 1,350 · tank cap 10,800 · goal 6,000/day.
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

test("a rally grants 6 hours of battling fuel (1,350) plus the 1-fuel wake margin", () => {
  assert.equal(RALLY.fuelHoursGiven * FUEL.burnPerHourBattling, 1_350);
  assert.equal(RALLY_FUEL_GRANT, 1_351);
});

test("the boundary bite: a bare 1,350 grant would leave an EMPTY hero Winded", () => {
  // The state convention (STR-6, load-bearing for the piecewise walk) puts the
  // threshold itself in the Winded band — and a drained tank sits at exactly 0.
  // This is WHY the wake margin exists; if it ever regresses, a rallied
  // resting hero would wake Winded instead of Battling.
  assert.equal(fuelStateFor(addFuel(0, 1_350)), "winded");
  assert.equal(fuelStateFor(WINDED_THRESHOLD_FUEL), "winded");
});

// --- rally = wake-up: every eligible receiver comes back Battling -----------------

test("acceptance: rallying an EMPTY tank wakes the hero to Battling", () => {
  const after = addFuel(0, RALLY_FUEL_GRANT); // 1,351 — strictly above the 1,350 threshold
  assert.equal(after, 1_351);
  assert.equal(fuelStateFor(after), "battling");
});

test("rallying a Winded hero (any fuel in its band) wakes them to Battling", () => {
  for (const fuel of [1, 100, 900, 1_349, WINDED_THRESHOLD_FUEL]) {
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
  // In practice unreachable: an ELIGIBLE receiver is Winded/Resting (≤ 1,350
  // fuel), and 1,350 + 1,351 = 2,701 is nowhere near the 10,800 cap.
  assert.equal(
    addFuel(WINDED_THRESHOLD_FUEL, RALLY_FUEL_GRANT),
    2_701,
  );
});

// --- cost sanity (spec anchors) ----------------------------------------------------

test("cost anchor: 500 Energy ≈ 8% of a goal day — real but small", () => {
  // The rally cost (500 Energy) is unchanged; lowering the goal 8,000 → 6,000
  // (Core Loop v2 §6) simply makes it a slightly larger — still small — share:
  // 500 / 6,000 ≈ 8.3% (was 6.25% at the old 8,000 goal).
  assert.equal(RALLY.energyCost, 500);
  const share = RALLY.energyCost / DAILY_STEP_GOAL;
  assert.ok(share > 0.07 && share < 0.1, `${share} out of expected band`);
});
