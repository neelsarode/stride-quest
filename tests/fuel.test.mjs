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
  idleDphFor,
  idleDamageForSegments,
  settleFuelAndIdleWindow,
} from "../convex/fuelMath.ts";
import {
  BASE_IDLE_DPH,
  FUEL,
  OFFLINE_CAP_HOURS,
} from "../convex/gameConfig.ts";

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

// ==================================================================================
// STR-7 — fuel-driven idle damage: burn and damage priced off the SAME walk.
// Damage rates: Battling = 150 × jobMult dph · Winded = 75 × jobMult · Resting = 0.
// ==================================================================================

test("idle dph per state: 150 battling, 75 winded, 0 resting (at job mult 1)", () => {
  assert.equal(idleDphFor("battling", 1), BASE_IDLE_DPH); // 150
  assert.equal(idleDphFor("winded", 1), 75); // 150 × 0.5
  assert.equal(idleDphFor("resting", 1), 0);
  assert.equal(idleDphFor("battling", 3.5), 525); // Job 3
});

test("the hand-computed fueled → winded → resting day earns 3,600 damage at ×2", () => {
  // Same 3,600-fuel / 24h day as above, priced at job mult ×2:
  //   battling 6h  × (150 × 2 × 1)   = 1,800
  //   winded  12h  × (150 × 2 × 0.5) = 1,800
  //   resting  6h  × 0               =     0
  //   total damage = 3,600 (and burn = 3,600 → tank empty)
  const w = walkFuel(3_600, 24 * HOUR_MS);
  approx(idleDamageForSegments(w.segments, 2), 3_600);
});

test("shared settle (aligned stamps): burn 750 and damage 375 from one 4h walk", () => {
  // fuel 2,100, 4h window, job mult 1:
  //   battling 1h: burn 300, damage 1 × 150 = 150
  //   winded   3h: burn 450, damage 3 ×  75 = 225
  //   → burned 750, damage 375, end fuel 1,350
  const t0 = 1_000_000;
  const r = settleFuelAndIdleWindow({
    fuel: 2_100,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 4 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 750);
  assert.equal(r.damage, 375);
  approx(r.fuel, 1_350);
});

test("never-disagree invariant: damage tracks burn through every burning state", () => {
  // With windedDamageMult == windedBurnMult (both 0.5), damage/burn is the SAME
  // constant in battling and winded: (150 × mult) / 300 = mult / 2. So for any
  // window that never rests, damage must equal burned × mult / 2 exactly —
  // a direct check that both numbers came from the same segments.
  const t0 = 0;
  for (const [fuel, hours, mult] of [
    [7_200, 3, 1],
    [2_100, 4, 2],
    [1_500, 5, 3.5],
  ]) {
    const r = settleFuelAndIdleWindow({
      fuel,
      fuelLastAt: t0,
      idleLastAt: t0,
      now: t0 + hours * HOUR_MS,
      jobMult: mult,
    });
    assert.equal(r.damage, Math.floor((r.burned * mult) / 2));
  }
});

test("OFFLINE_CAP pauses BOTH burn and damage after 10h", () => {
  // 30h away, tank 7,200, mult 1: only 10h settle — all battling
  //   (end fuel 4,200 > 1,800): burn 10 × 300 = 3,000, damage 10 × 150 = 1,500.
  // The other 20h are paused: no burn, no damage. Absence pauses, never punishes.
  const t0 = 5_000;
  const r = settleFuelAndIdleWindow({
    fuel: 7_200,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 30 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 3_000);
  assert.equal(r.damage, 1_500);
  approx(r.fuel, 4_200);
});

test("weekly-rollover lead-in: older fuel stamp burns but deals no damage", () => {
  // Fresh progress row (idle stamp) 4h after the last fuel settle — the boss
  // didn't exist during the lead-in. fuel 3,000, mult 1, now = +6h:
  //   lead-in  [0h → 4h] burn-only: battling (3,000−1,800)/300 = 4h exactly
  //            → burn 1,200, damage 0, fuel 1,800
  //   shared   [4h → 6h] winded 2h: burn 300, damage 2 × 75 = 150, fuel 1,500
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 3_000,
    fuelLastAt: t0,
    idleLastAt: t0 + 4 * HOUR_MS,
    now: t0 + 6 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 1_500);
  assert.equal(r.damage, 150);
  approx(r.fuel, 1_500);
});

test("defensive path: older idle stamp earns damage at the settled level's state", () => {
  // idle stamp 2h older than the fuel stamp; fuel already settled at 900
  // (winded). The lead-in earns 2 × 75 = 150 damage, burns nothing new
  // (that burn was already settled), and the shared window is empty.
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 900,
    fuelLastAt: t0 + 2 * HOUR_MS,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 0);
  assert.equal(r.damage, 150);
  approx(r.fuel, 900);
});

test("a resting hero deals no damage and burns nothing — never punished", () => {
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 0,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 8 * HOUR_MS,
    jobMult: 10,
  });
  assert.equal(r.damage, 0);
  assert.equal(r.burned, 0);
  assert.equal(r.fuel, 0); // still zero, never negative
});

test("damage floors once at the end of a settle (no per-segment rounding)", () => {
  // fuel 101 (winded) empties in 101/150 h → damage 101/150 × 75 = 50.5 → 50.
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 101,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 101);
  assert.equal(r.damage, 50);
  assert.equal(r.fuel, 0);
});
