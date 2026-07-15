// =============================================================================
// Overdrive window-pricing tests (STR-8, re-anchored for Core Loop v2 §6).
// Pure functions, no Convex. Run with npm test.
// Tunables in force: goal 6,000/day · ×2 idle mult · burn battling 225/h ·
// winded 112.5/h · threshold 1,350 · offline cap 10h · BASE_IDLE_DPH 150.
//
// The old charge/activate model is RETIRED (spec §5.4): the per-day-excess and
// charge-fraction tests that lived here were DROPPED with this config change
// (goal 8k→6k would have broken the excess ones, and the whole charge meter is
// gone). STR-74 owns the new goal-gated "Overdrive until next reset" stamp +
// OVERDRIVE.boostsSuperAttack logic and will add its own coverage. What remains
// below still exercises the UNCHANGED piecewise OD window engine
// (overdriveHoursAt / idleDamageForSegments / settleFuelAndIdleWindow), now at
// the ×2 multiplier.
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  overdriveHoursAt,
  idleDamageForSegments,
  settleFuelAndIdleWindow,
  walkFuel,
  idleDphFor,
} from "../convex/fuelMath.ts";
import { OVERDRIVE } from "../convex/gameConfig.ts";

const HOUR_MS = 3_600_000;
const approx = (a, b, msg) =>
  assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} !== ${b}`);

// --- the ×2 window inside the shared walk ---------------------------------------

test("overdrive doubles damage inside the boundary, burn is untouched", () => {
  // Full-ish tank (7,200), 6h window, overdrive covers the first 4h, mult 1:
  //   damage = 4h × 150×2 + 2h × 150 = 1,200 + 300 = 1,500
  //   burn   = 6h × 225 = 1,350 (same as without overdrive — pure reward)
  const t0 = 0;
  const od = settleFuelAndIdleWindow({
    fuel: 7_200,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 6 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: t0 + 4 * HOUR_MS,
  });
  const plain = settleFuelAndIdleWindow({
    fuel: 7_200,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 6 * HOUR_MS,
    jobMult: 1,
  });
  assert.equal(od.damage, 1_500);
  assert.equal(plain.damage, 900);
  approx(od.burned, plain.burned); // 1,350 both — never a cost
  approx(od.fuel, plain.fuel);
});

test("spec sizing check: Job 3 overdrive = 1,050 dph → 4,200 over the 4h window", () => {
  // 150 × 3.5 × 2 = 1,050 dph; 4h = 4,200 damage (~+2,100 over baseline 2,100).
  const w = walkFuel(10_800, 4 * HOUR_MS); // battling throughout
  const damage = idleDamageForSegments(w.segments, 3.5, 4);
  approx(damage, 4_200);
  approx(idleDamageForSegments(w.segments, 3.5, 0), 2_100); // baseline
});

test("winded ×0.5 stacks multiplicatively under overdrive", () => {
  // Winded dph 75; overdriven winded = 75 × 2 = 150/h. Tank 1,200 (winded),
  // 2h window fully inside overdrive: damage 300, burn 225 (winded rate).
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 1_200,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: t0 + 4 * HOUR_MS,
  });
  assert.equal(r.damage, 300);
  approx(r.burned, 225);
});

test("overdrive boundary splits a fuel-state segment mid-window", () => {
  // Tank 1,575, 4h, overdrive ends 2h in, mult 1:
  //   battling 1h (inside OD):        150 × 2 = 300
  //   winded 1h (inside OD):           75 × 2 = 150
  //   winded 2h (outside OD):         2h × 75 = 150
  //   damage 600 · burn 225 + 112.5 + 225 = 562.5 · end fuel 1,012.5
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 1_575,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 4 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: t0 + 2 * HOUR_MS,
  });
  assert.equal(r.damage, 600);
  approx(r.burned, 562.5);
  approx(r.fuel, 1_012.5);
});

// --- exactly `durationHours` effective hours, even across settles + offline gaps --
// (durationHours is the retired fixed activate window, kept deprecated at 4; the
// window-anchoring engine this pins is unchanged and survives into Core Loop v2.)

test("acceptance: a charge yields EXACTLY 4 effective ×2 hours across settles + a 30h gap", () => {
  // Activate at t0 (activation settles, so stamps = t0), tank 10,800, mult 1.
  const t0 = 0;
  const activeUntil = t0 + OVERDRIVE.durationHours * HOUR_MS; // t0 + 4h
  // Settle 1: open the app 2h in → 2h of ×2 = 600 damage.
  const s1 = settleFuelAndIdleWindow({
    fuel: 10_800,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: activeUntil,
  });
  assert.equal(s1.damage, 600); // 2h × 300
  approx(s1.fuel, 10_350);
  // Then vanish for 30h. Settle 2 covers the capped 10h ANCHORED AT THE STAMP
  // (t0+2h): the ×2 boundary is 2h into that window → 2h × 300 + 8h × 150.
  const s2 = settleFuelAndIdleWindow({
    fuel: s1.fuel,
    fuelLastAt: t0 + 2 * HOUR_MS,
    idleLastAt: t0 + 2 * HOUR_MS,
    now: t0 + 32 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: activeUntil,
  });
  assert.equal(s2.damage, 1_800);
  // Total ×2 hours = 2 + 2 = exactly OVERDRIVE.durationHours. The offline
  // pause truncated the FAR end of the window, never the overdrive head.
  const total = s1.damage + s2.damage; // 2,400
  const baseline = 12 * 150; // the same 12 settled hours without overdrive
  assert.equal(total - baseline, 4 * (300 - 150)); // exactly 4h of extra ×2
});

test("an expired overdrive stamp contributes nothing to later windows", () => {
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 7_200,
    fuelLastAt: t0 + 10 * HOUR_MS, // window starts AFTER activeUntil
    idleLastAt: t0 + 10 * HOUR_MS,
    now: t0 + 12 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: t0 + 4 * HOUR_MS,
  });
  assert.equal(r.damage, 300); // plain 2h × 150
  assert.equal(overdriveHoursAt(t0 + 10 * HOUR_MS, t0 + 4 * HOUR_MS), 0);
  assert.equal(overdriveHoursAt(t0, undefined), 0);
});

test("a resting hero earns nothing even under overdrive (×2 of zero is zero)", () => {
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 0,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 4 * HOUR_MS,
    jobMult: 10,
    overdriveUntil: t0 + 4 * HOUR_MS,
  });
  assert.equal(r.damage, 0);
  assert.equal(r.burned, 0);
});

test("idleDphFor sanity under overdrive config: mult is data-driven", () => {
  // The ×2 lives in OVERDRIVE.idleDamageMult (gameConfig), not hard-coded.
  assert.equal(idleDphFor("battling", 1) * OVERDRIVE.idleDamageMult, 300);
});
