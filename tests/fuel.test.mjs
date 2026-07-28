// =============================================================================
// Fuel math tests — pure functions, no Convex. Run with:
//   node --experimental-strip-types --test tests/
// (the flag lets Node load the .ts modules directly; they use erasable-types-
// only syntax). All expected numbers below are hand-computed from the tunables,
// RE-ANCHORED for Core Loop v2 (spec §6 — burn 300→225, goal 8k→6k):
//   burn battling 225/h · winded 112.5/h (×0.5) · threshold 1,350 (6h)
//   tank cap 10,800 (48h) · starter 5,400 (24h) · offline cap 10h
// NOTE: the idle-DAMAGE side is UNCHANGED — it is priced off BASE_IDLE_DPH (150),
// not the burn rate, so battling dph 150 / winded dph 75 keep their old values.
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TANK_CAP_FUEL,
  STARTER_FUEL,
  WINDED_THRESHOLD_FUEL,
  WINDED_BURN_PER_HOUR,
  RALLY_FUEL_GRANT,
  fuelStateFor,
  burnRateForState,
  walkFuel,
  cappedElapsedMs,
  addFuel,
  battlingHoursForFuel,
  fuelForBattlingHours,
  hoursToEmpty,
  idleDphFor,
  idleDamageForSegments,
  settleFuelAndIdleWindow,
} from "../convex/fuelMath.ts";
import {
  BASE_IDLE_DPH,
  DAILY_STEP_GOAL,
  FUEL,
  OFFLINE_CAP_HOURS,
} from "../convex/gameConfig.ts";

const HOUR_MS = 3_600_000;
const approx = (a, b, msg) =>
  assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} !== ${b}`);

// --- derived constants line up with the spec ---------------------------------

test("derived constants match the spec's worked numbers", () => {
  assert.equal(TANK_CAP_FUEL, 10_800); // 48h × 225
  assert.equal(STARTER_FUEL, 5_400); // 24h × 225
  assert.equal(WINDED_THRESHOLD_FUEL, 1_350); // 6h × 225
  assert.equal(WINDED_BURN_PER_HOUR, 112.5); // 225 × 0.5
});

// --- state derivation ---------------------------------------------------------

test("hero state: battling above threshold, winded at/below, resting at empty", () => {
  assert.equal(fuelStateFor(1_351), "battling");
  assert.equal(fuelStateFor(1_350), "winded"); // boundary: 0 < fuel ≤ 1,350 is winded
  assert.equal(fuelStateFor(1), "winded");
  assert.equal(fuelStateFor(0), "resting");
  assert.equal(burnRateForState("battling"), 225);
  assert.equal(burnRateForState("winded"), 112.5);
  assert.equal(burnRateForState("resting"), 0);
});

// --- battling burn -------------------------------------------------------------

test("battling burn: 2h well above the threshold burns 450", () => {
  // 7,200 − 2h × 225 = 6,750; single battling segment.
  const w = walkFuel(7_200, 2 * HOUR_MS);
  assert.equal(w.endFuel, 6_750);
  assert.equal(w.burned, 450);
  assert.equal(w.segments.length, 1);
  assert.equal(w.segments[0].state, "battling");
  approx(w.segments[0].hours, 2);
});

// --- winded threshold crossing (piecewise split within ONE window) -------------

test("threshold crossing splits one window into battling + winded segments", () => {
  // Start 1,800. Battling: (1,800 − 1,350) / 225 = 2h (burn 450).
  // Remaining 2h winded: 2 × 112.5 = 225. End = 1,800 − 450 − 225 = 1,125.
  const w = walkFuel(1_800, 4 * HOUR_MS);
  assert.equal(w.segments.length, 2);
  assert.equal(w.segments[0].state, "battling");
  approx(w.segments[0].hours, 2);
  assert.equal(w.segments[1].state, "winded");
  approx(w.segments[1].hours, 2);
  approx(w.endFuel, 1_125);
  approx(w.burned, 675);
});

// --- resting floor: never negative ---------------------------------------------

test("running dry floors at 0 — resting is never punished, never negative", () => {
  // 225 fuel is winded: empties in 225 / 112.5 = 2h; the other 8h are resting.
  const w = walkFuel(225, 10 * HOUR_MS);
  assert.equal(w.endFuel, 0);
  approx(w.burned, 225);
  const resting = w.segments.find((s) => s.state === "resting");
  approx(resting.hours, 8);
  // An already-empty tank burns nothing at all.
  const empty = walkFuel(0, 5 * HOUR_MS);
  assert.equal(empty.endFuel, 0);
  assert.equal(empty.burned, 0);
});

// --- tank cap -------------------------------------------------------------------

test("tank cap: adds clamp at 10,800, overflow is lost", () => {
  assert.equal(addFuel(10_000, 1_000), 10_800);
  assert.equal(addFuel(5_400, 999_999), 10_800);
  assert.equal(addFuel(0, 500), 500); // normal add untouched
  assert.equal(addFuel(100, 0), 100); // zero add is a no-op
});

// --- offline-cap pause -----------------------------------------------------------

test("offline cap: elapsed beyond 10h is paused, not burned", () => {
  const t0 = 1_000_000;
  // 30h away → only 10h of active time settles.
  assert.equal(cappedElapsedMs(t0, t0 + 30 * HOUR_MS), OFFLINE_CAP_HOURS * HOUR_MS);
  const w = walkFuel(7_200, cappedElapsedMs(t0, t0 + 30 * HOUR_MS));
  assert.equal(w.burned, 2_250); // 10h × 225, NOT 30h worth
  assert.equal(w.endFuel, 4_950);
  // Clock going backwards (dev time-travel) settles nothing rather than crediting.
  assert.equal(cappedElapsedMs(t0, t0 - HOUR_MS), 0);
});

// --- the hand-computed fueled → winded → resting day (burn side; STR-7 adds damage)

test("a 2,700-fuel day: 6h battling → 12h winded → 6h resting", () => {
  // Battling: (2,700 − 1,350) / 225 = 6h, burns 1,350 → at threshold.
  // Winded: 1,350 / 112.5 = 12h, burns 1,350 → empty at hour 18.
  // Resting: hours 18–24 burn nothing. Total burned = 2,700, end = 0.
  const w = walkFuel(2_700, 24 * HOUR_MS);
  assert.equal(
    w.segments.map((s) => s.state).join(","),
    "battling,winded,resting",
  );
  approx(w.segments[0].hours, 6);
  approx(w.segments[1].hours, 12);
  approx(w.segments[2].hours, 6);
  assert.equal(w.endFuel, 0);
  approx(w.burned, 2_700);
});

// --- time-to-empty (what the UI shows) -------------------------------------------

test("hoursToEmpty stretches the winded tail to double duration", () => {
  approx(hoursToEmpty(0), 0);
  approx(hoursToEmpty(1_350), 12); // 6 nominal hours last 12 real hours
  approx(hoursToEmpty(2_700), 18); // 6h battling + 12h winded
  approx(hoursToEmpty(STARTER_FUEL), 30); // 18h battling + 12h winded (5,400)
});

// --- config sanity (spec anchors) -------------------------------------------------

test("burn-rate anchor: a full 24h of fighting costs less than the daily goal", () => {
  // Core Loop v2 invariant (spec §6): 24h battling < a goal day, so goal-hitters
  // BANK fuel instead of treading water. 225 × 24 = 5,400 < 6,000 (goal), a ~600
  // fuel surplus (~+2.7h).
  assert.ok(FUEL.burnPerHourBattling * 24 < DAILY_STEP_GOAL); // 5,400 < 6,000
});

// ==================================================================================
// STR-7 — fuel-driven idle damage: burn and damage priced off the SAME walk.
// Damage rates: Battling = BASE_IDLE_DPH × jobMult · Winded = ×windedDamageMult ·
// Resting = 0. Damage is priced off BASE_IDLE_DPH, so expectations are written as
// multiples of it — a DAMAGE_SCALE re-tune keeps them correct. (Burn/fuel numbers
// are step-space and unscaled.)
// ==================================================================================

test("idle dph per state: BASE_IDLE_DPH battling, ×windedDamageMult winded, 0 resting", () => {
  assert.equal(idleDphFor("battling", 1), BASE_IDLE_DPH);
  assert.equal(idleDphFor("winded", 1), BASE_IDLE_DPH * FUEL.windedDamageMult);
  assert.equal(idleDphFor("resting", 1), 0);
  assert.equal(idleDphFor("battling", 3.5), BASE_IDLE_DPH * 3.5); // Job 3
});

test("the hand-computed fueled → winded → resting day earns 24×BASE_IDLE_DPH at ×2", () => {
  // Same 2,700-fuel / 24h day as above, priced at job mult ×2:
  //   battling 6h  × (dph×2)     = 12 × BASE_IDLE_DPH
  //   winded  12h  × (dph×2×0.5) = 12 × BASE_IDLE_DPH
  //   resting  6h  × 0           =  0
  //   total = 24 × BASE_IDLE_DPH (and burn = 2,700 → tank empty)
  const w = walkFuel(2_700, 24 * HOUR_MS);
  approx(idleDamageForSegments(w.segments, 2), 24 * BASE_IDLE_DPH);
});

test("shared settle (aligned stamps): burn 562.5 and damage 2.5×BASE from one 4h walk", () => {
  // fuel 1,575, 4h window, job mult 1:
  //   battling 1h: burn 225, damage 1 × dph       = 1.0 × BASE_IDLE_DPH
  //   winded   3h: burn 337.5, damage 3 × dph×0.5 = 1.5 × BASE_IDLE_DPH
  //   → burned 562.5, damage 2.5 × BASE_IDLE_DPH, end fuel 1,012.5
  const t0 = 1_000_000;
  const r = settleFuelAndIdleWindow({
    fuel: 1_575,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 4 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 562.5);
  assert.equal(r.damage, 2.5 * BASE_IDLE_DPH);
  approx(r.fuel, 1_012.5);
});

test("never-disagree invariant: damage tracks burn through every burning state", () => {
  // With windedDamageMult == windedBurnMult (both 0.5), the damage/burn ratio is
  // the SAME constant in battling and winded: (BASE_IDLE_DPH × mult) /
  // burnPerHourBattling = (150 × mult) / 225 = mult × 2/3. So for any window that
  // never rests, damage must equal floor(burned × mult × 150 / 225) exactly —
  // a direct check that both numbers came from the same segments. Inputs chosen
  // so every intermediate is exact (no repeating fractions to trip the floor).
  const t0 = 0;
  for (const [fuel, hours, mult] of [
    [9_000, 3, 1], // battling throughout
    [9_000, 4, 3], // battling throughout
    [2_250, 6, 2], // battling → winded (crosses the threshold)
  ]) {
    const r = settleFuelAndIdleWindow({
      fuel,
      fuelLastAt: t0,
      idleLastAt: t0,
      now: t0 + hours * HOUR_MS,
      jobMult: mult,
    });
    assert.equal(
      r.damage,
      Math.floor((r.burned * mult * BASE_IDLE_DPH) / FUEL.burnPerHourBattling),
    );
  }
});

test("OFFLINE_CAP pauses BOTH burn and damage after 10h", () => {
  // 30h away, tank 7,200, mult 1: only 10h settle — all battling
  //   (end fuel 4,950 > 1,350): burn 10 × 225 = 2,250, damage 10 × dph = 10 × BASE_IDLE_DPH.
  // The other 20h are paused: no burn, no damage. Absence pauses, never punishes.
  const t0 = 5_000;
  const r = settleFuelAndIdleWindow({
    fuel: 7_200,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 30 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 2_250);
  assert.equal(r.damage, 10 * BASE_IDLE_DPH);
  approx(r.fuel, 4_950);
});

test("weekly-rollover lead-in: older fuel stamp burns but deals no damage", () => {
  // Fresh progress row (idle stamp) 4h after the last fuel settle — the boss
  // didn't exist during the lead-in. fuel 2,250, mult 1, now = +6h:
  //   lead-in  [0h → 4h] burn-only: battling (2,250−1,350)/225 = 4h exactly
  //            → burn 900, damage 0, fuel 1,350
  //   shared   [4h → 6h] winded 2h: burn 225, damage 2 × dph×0.5 = BASE_IDLE_DPH, fuel 1,125
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 2_250,
    fuelLastAt: t0,
    idleLastAt: t0 + 4 * HOUR_MS,
    now: t0 + 6 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 1_125);
  assert.equal(r.damage, BASE_IDLE_DPH);
  approx(r.fuel, 1_125);
});

test("defensive path: older idle stamp earns damage at the settled level's state", () => {
  // idle stamp 2h older than the fuel stamp; fuel already settled at 900
  // (winded). The lead-in earns 2 × dph×0.5 = BASE_IDLE_DPH damage, burns nothing
  // new (that burn was already settled), and the shared window is empty.
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 900,
    fuelLastAt: t0 + 2 * HOUR_MS,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 0);
  assert.equal(r.damage, BASE_IDLE_DPH);
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
  // fuel 101 (winded) empties in 101/112.5 h → damage (101/112.5)×dph×0.5, floored.
  // The non-integer pre-floor value is the point of this test, so it's written as
  // the exact formula (tracks BASE_IDLE_DPH); at scale 50 it floors to 3,366.
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 101,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
  });
  approx(r.burned, 101);
  assert.equal(
    r.damage,
    Math.floor((101 / 112.5) * BASE_IDLE_DPH * FUEL.windedDamageMult),
  );
  assert.equal(r.fuel, 0);
});

// ==================================================================================
// STR-11 — dashboard exposure: read-time derivation must equal settle-then-read.
// Queries can't write, so the dashboard/guild roster derive the tank (and hero
// state) with the SAME pure walk a settle runs. These tests pin that equivalence.
// ==================================================================================

test("derived-at-read == settle-then-read (within the offline cap)", () => {
  // Reading the tank at t2 straight from the stored (fuel, t0) pair must give
  // exactly what a mutation settling at t1 and a read at t2 would give — the
  // piecewise walk composes: walk(f, a+b) == walk(walk(f, a), b). Cases cross
  // every state boundary (battling→winded and winded→resting).
  const t0 = 1_000_000;
  for (const [fuel, h1, h2] of [
    [7_200, 2, 3], // battling throughout
    [2_100, 1, 3], // crosses into winded mid-window
    [600, 2, 4], // winded → resting
    [2_250, 5, 5], // battling → winded within the 10h cap
  ]) {
    const t1 = t0 + h1 * HOUR_MS;
    const t2 = t1 + h2 * HOUR_MS;
    // one read at t2, straight from the t0 stamp
    const direct = walkFuel(fuel, cappedElapsedMs(t0, t2));
    // settle at t1 (re-stamps the clock), then read at t2
    const settled = walkFuel(fuel, cappedElapsedMs(t0, t1));
    const reread = walkFuel(settled.endFuel, cappedElapsedMs(t1, t2));
    approx(reread.endFuel, direct.endFuel, `endFuel diverged for ${fuel}`);
    assert.equal(
      fuelStateFor(reread.endFuel),
      fuelStateFor(direct.endFuel),
      `state diverged for ${fuel}`,
    );
    approx(settled.burned + reread.burned, direct.burned, `burn diverged for ${fuel}`);
  }
});

test("read-time hero state matches the settle across every band", () => {
  // The roster's badge derivation: state(walk(stored fuel, elapsed)) — spot-check
  // the boundaries the walk can land on.
  assert.equal(fuelStateFor(walkFuel(7_200, 2 * HOUR_MS).endFuel), "battling");
  // 2,100 − 4h piecewise = 1,275 → winded
  assert.equal(fuelStateFor(walkFuel(2_100, 4 * HOUR_MS).endFuel), "winded");
  // 300 fuel empties within the window → resting
  assert.equal(fuelStateFor(walkFuel(300, 10 * HOUR_MS).endFuel), "resting");
  // Landing EXACTLY on the threshold (1,350) is winded (strictly-above battles).
  assert.equal(fuelStateFor(walkFuel(1_575, HOUR_MS).endFuel), "winded");
});

test("battlingHoursForFuel: the display unit the spec sizes everything in", () => {
  approx(battlingHoursForFuel(WINDED_THRESHOLD_FUEL), 6); // 1,350 → 6h
  approx(battlingHoursForFuel(STARTER_FUEL), 24); // 5,400 → 24h
  approx(battlingHoursForFuel(TANK_CAP_FUEL), 48); // 10,800 → 48h
  approx(battlingHoursForFuel(0), 0);
  approx(battlingHoursForFuel(-50), 0); // defensive: never negative
  // A rally's fuelGiven reads back as ≈6 hours (the +1 wake margin is ~16s at 225/h).
  assert.ok(Math.abs(battlingHoursForFuel(RALLY_FUEL_GRANT) - 6) < 0.01);
});

// ==================================================================================
// STR-12 — dev fuel controls: "set fuel to N hours" uses the same clamp rules
// as every other way fuel enters the tank.
// ==================================================================================

test("fuelForBattlingHours: dev set-tank clamps like real fuel entry", () => {
  approx(fuelForBattlingHours(24), STARTER_FUEL); // 24h → 5,400
  approx(fuelForBattlingHours(0), 0);
  approx(fuelForBattlingHours(-3), 0); // never negative
  approx(fuelForBattlingHours(999), TANK_CAP_FUEL); // capped at 48h
  // Round-trips with the display conversion inside the cap.
  approx(battlingHoursForFuel(fuelForBattlingHours(13)), 13);
});

test("dev quick buttons land in the intended hero states", () => {
  // "Drain → Resting" (0h), "Drain → Winded" (3h ≤ the 6h threshold),
  // "Tank → 24h" (battling) — the states the M1 scenarios drive from.
  assert.equal(fuelStateFor(fuelForBattlingHours(0)), "resting");
  assert.equal(fuelStateFor(fuelForBattlingHours(3)), "winded");
  assert.equal(fuelStateFor(fuelForBattlingHours(6)), "winded"); // boundary: 6h exactly is still winded
  assert.equal(fuelStateFor(fuelForBattlingHours(24)), "battling");
});
