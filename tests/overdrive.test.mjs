// =============================================================================
// Overdrive math tests (STR-8) — pure functions, no Convex. Run with npm test.
// Tunables in force: goal 8,000/day · full charge 4,000 excess · ×3 for 4h ·
// burn battling 300/h · winded 150/h · threshold 1,800 · offline cap 10h ·
// BASE_IDLE_DPH 150.
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  overdriveExcessFromDayTotals,
  overdriveChargeFraction,
  overdriveHoursAt,
  idleDamageForSegments,
  settleFuelAndIdleWindow,
  walkFuel,
  idleDphFor,
} from "../convex/fuelMath.ts";
import { DAILY_STEP_GOAL, OVERDRIVE } from "../convex/gameConfig.ts";

const HOUR_MS = 3_600_000;
const approx = (a, b, msg) =>
  assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} !== ${b}`);

// --- charge math (acceptance: 20k over 2 days = 4k excess = exactly full) ------

test("acceptance: 20k steps over 2 goal-hitting days = 4,000 excess = 100% charge", () => {
  // The spec's calibration example (20k − 16k of goal = 4k), as PER-DAY excess:
  assert.equal(overdriveExcessFromDayTotals([10_000, 10_000]), 4_000);
  assert.equal(overdriveExcessFromDayTotals([12_000, 8_000]), 4_000);
  assert.equal(overdriveChargeFraction(4_000, 0), 1); // exactly full
});

test("only steps ABOVE the goal charge the meter — under-goal days give zero", () => {
  assert.equal(overdriveExcessFromDayTotals([7_999]), 0);
  assert.equal(overdriveExcessFromDayTotals([DAILY_STEP_GOAL]), 0);
  // A short day never DISCHARGES the meter (no negative contributions).
  assert.equal(overdriveExcessFromDayTotals([9_000, 2_000]), 1_000);
});

test("partial charge persists across days; meter holds at 100% until used", () => {
  assert.equal(overdriveChargeFraction(1_000, 0), 0.25); // partial persists
  assert.equal(overdriveChargeFraction(9_999, 0), 1); // clamped at full
  // Activation consumes the WHOLE pool (spent := earned): overflow is lost,
  // which is what "1 stored charge max" means.
  assert.equal(overdriveChargeFraction(9_999, 9_999), 0);
  // Never negative, even if the ledger shrank under the spent counter.
  assert.equal(overdriveChargeFraction(0, 4_000), 0);
});

// --- the ×3 window inside the shared walk ---------------------------------------

test("overdrive triples damage inside the boundary, burn is untouched", () => {
  // Full-ish tank (7,200), 6h window, overdrive covers the first 4h, mult 1:
  //   damage = 4h × 150×3 + 2h × 150 = 1,800 + 300 = 2,100
  //   burn   = 6h × 300 = 1,800 (same as without overdrive — pure reward)
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
  assert.equal(od.damage, 2_100);
  assert.equal(plain.damage, 900);
  approx(od.burned, plain.burned); // 1,800 both — never a cost
  approx(od.fuel, plain.fuel);
});

test("spec sizing check: Job 3 overdrive = 1,575 dph → 6,300 over the 4h window", () => {
  // 150 × 3.5 × 3 = 1,575 dph; 4h = 6,300 damage (~+4,200 over baseline 2,100).
  const w = walkFuel(14_400, 4 * HOUR_MS); // battling throughout
  const damage = idleDamageForSegments(w.segments, 3.5, 4);
  approx(damage, 6_300);
  approx(idleDamageForSegments(w.segments, 3.5, 0), 2_100); // baseline
});

test("winded ×0.5 stacks multiplicatively under overdrive", () => {
  // Winded dph 75; overdriven winded = 75 × 3 = 225/h. Tank 1,500 (winded),
  // 2h window fully inside overdrive: damage 450, burn 300 (winded rate).
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 1_500,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: t0 + 4 * HOUR_MS,
  });
  assert.equal(r.damage, 450);
  approx(r.burned, 300);
});

test("overdrive boundary splits a fuel-state segment mid-window", () => {
  // Tank 2,100, 4h, overdrive ends 2h in, mult 1:
  //   battling 1h (inside OD):        150 × 3 = 450
  //   winded 1h (inside OD):           75 × 3 = 225
  //   winded 2h (outside OD):          75 × 2 = 150
  //   damage 825 · burn unchanged at 750 (300 + 450)
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 2_100,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 4 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: t0 + 2 * HOUR_MS,
  });
  assert.equal(r.damage, 825);
  approx(r.burned, 750);
  approx(r.fuel, 1_350);
});

// --- exactly 4 effective hours, even across settles and offline gaps -------------

test("acceptance: a charge yields EXACTLY 4 effective ×3 hours across settles + a 30h gap", () => {
  // Activate at t0 (activation settles, so stamps = t0), tank 14,400, mult 1.
  const t0 = 0;
  const activeUntil = t0 + OVERDRIVE.durationHours * HOUR_MS; // t0 + 4h
  // Settle 1: open the app 2h in → 2h of ×3 = 900 damage.
  const s1 = settleFuelAndIdleWindow({
    fuel: 14_400,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: activeUntil,
  });
  assert.equal(s1.damage, 900); // 2h × 450
  approx(s1.fuel, 13_800);
  // Then vanish for 30h. Settle 2 covers the capped 10h ANCHORED AT THE STAMP
  // (t0+2h): the ×3 boundary is 2h into that window → 2h × 450 + 8h × 150.
  const s2 = settleFuelAndIdleWindow({
    fuel: s1.fuel,
    fuelLastAt: t0 + 2 * HOUR_MS,
    idleLastAt: t0 + 2 * HOUR_MS,
    now: t0 + 32 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: activeUntil,
  });
  assert.equal(s2.damage, 2_100);
  // Total ×3 hours = 2 + 2 = exactly OVERDRIVE.durationHours. The offline
  // pause truncated the FAR end of the window, never the overdrive head.
  const total = s1.damage + s2.damage; // 3,000
  const baseline = 12 * 150; // the same 12 settled hours without overdrive
  assert.equal(total - baseline, 4 * (450 - 150)); // exactly 4h of extra ×3
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

test("a resting hero earns nothing even under overdrive (×3 of zero is zero)", () => {
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
  // The ×3 lives in OVERDRIVE.idleDamageMult (gameConfig), not hard-coded.
  assert.equal(idleDphFor("battling", 1) * OVERDRIVE.idleDamageMult, 450);
});
