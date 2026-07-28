// =============================================================================
// Overdrive tests — Core Loop v2 (spec §5.4). Pure functions, no Convex.
// Run with:  node --experimental-strip-types --test tests/
// Tunables in force: goal 6,000/day · ×2 idle+super mult · burn battling 225/h ·
// winded 112.5/h · threshold 1,350 · offline cap 10h · BASE_IDLE_DPH 150.
//
// STR-74 RETIRED the charge/activate model (the per-day-excess + charge-fraction
// tests were dropped in STR-73). Overdrive is now a GOAL-HIT reward: crossing
// DAILY_STEP_GOAL stamps overdriveActiveUntil = endOfEffectiveDay(now), so ×2
// runs until the daily reset and boosts BOTH idle AND the Super Attack.
//
// Coverage below:
//   1. the UNCHANGED piecewise OD window engine (overdriveHoursAt /
//      idleDamageForSegments / settleFuelAndIdleWindow), now at ×2 — proves idle
//      still prices the armed window correctly;
//   2. the NEW goal-armed stamp: endOfEffectiveDay + the shared isOverdriveActive
//      predicate (the ONE check idle & Super both read);
//   3. the NEW Super Attack ×2 factor (OVERDRIVE.boostsSuperAttack).
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  overdriveHoursAt,
  idleDamageForSegments,
  settleFuelAndIdleWindow,
  walkFuel,
  idleDphFor,
  isOverdriveActive,
} from "../convex/fuelMath.ts";
import { endOfEffectiveDay } from "../convex/time.ts";
import { BASE_IDLE_DPH, DAMAGE_PER_ENERGY, OVERDRIVE } from "../convex/gameConfig.ts";

const HOUR_MS = 3_600_000;
const approx = (a, b, msg) =>
  assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} !== ${b}`);

// =============================================================================
// 1. The ×2 window inside the shared walk (engine unchanged; still prices idle).
// =============================================================================

test("overdrive doubles damage inside the boundary, burn is untouched", () => {
  // Full-ish tank (7,200), 6h window, overdrive covers the first 4h, mult 1:
  //   damage = 4h × dph×2 + 2h × dph = (8 + 2) × BASE_IDLE_DPH = 10 × BASE_IDLE_DPH
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
  assert.equal(od.damage, 10 * BASE_IDLE_DPH);
  assert.equal(plain.damage, 6 * BASE_IDLE_DPH);
  approx(od.burned, plain.burned); // 1,350 both — never a cost
  approx(od.fuel, plain.fuel);
});

test("spec sizing check: Job 3 overdrive dph → 28×BASE over the 4h window", () => {
  // dph = BASE_IDLE_DPH × 3.5 × 2; 4h = 28 × BASE_IDLE_DPH (~+14×BASE over baseline).
  const w = walkFuel(10_800, 4 * HOUR_MS); // battling throughout
  const damage = idleDamageForSegments(w.segments, 3.5, 4);
  approx(damage, 28 * BASE_IDLE_DPH);
  approx(idleDamageForSegments(w.segments, 3.5, 0), 14 * BASE_IDLE_DPH); // baseline
});

test("winded ×0.5 stacks multiplicatively under overdrive", () => {
  // Overdriven winded = dph×0.5×2 = dph. Tank 1,200 (winded), 2h window fully
  // inside overdrive: damage 2 × BASE_IDLE_DPH, burn 225 (winded rate).
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 1_200,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: t0 + 4 * HOUR_MS,
  });
  assert.equal(r.damage, 2 * BASE_IDLE_DPH);
  approx(r.burned, 225);
});

test("overdrive boundary splits a fuel-state segment mid-window", () => {
  // Tank 1,575, 4h, overdrive ends 2h in, mult 1:
  //   battling 1h (inside OD): dph×2        = 2 × BASE_IDLE_DPH
  //   winded 1h (inside OD):   dph×0.5×2    = 1 × BASE_IDLE_DPH
  //   winded 2h (outside OD):  2h × dph×0.5 = 1 × BASE_IDLE_DPH
  //   damage 4 × BASE_IDLE_DPH · burn 225 + 112.5 + 225 = 562.5 · end fuel 1,012.5
  const t0 = 0;
  const r = settleFuelAndIdleWindow({
    fuel: 1_575,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 4 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: t0 + 2 * HOUR_MS,
  });
  assert.equal(r.damage, 4 * BASE_IDLE_DPH);
  approx(r.burned, 562.5);
  approx(r.fuel, 1_012.5);
});

test("an armed window yields EXACTLY its ×2 hours across settles + a 30h gap", () => {
  // Overdrive armed until t0+4h (in the new model this is end-of-day, tested
  // as a literal 4h remaining here), tank 10,800, mult 1.
  const t0 = 0;
  const activeUntil = t0 + 4 * HOUR_MS;
  // Settle 1: open the app 2h in → 2h of ×2 = 600 damage.
  const s1 = settleFuelAndIdleWindow({
    fuel: 10_800,
    fuelLastAt: t0,
    idleLastAt: t0,
    now: t0 + 2 * HOUR_MS,
    jobMult: 1,
    overdriveUntil: activeUntil,
  });
  assert.equal(s1.damage, 4 * BASE_IDLE_DPH); // 2h × (dph×2)
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
  assert.equal(s2.damage, 12 * BASE_IDLE_DPH); // 2h×(dph×2) + 8h×dph
  // Total ×2 hours = 2 + 2 = exactly the 4 armed hours. The offline pause
  // truncated the FAR end of the window, never the overdrive head.
  const total = s1.damage + s2.damage; // 16 × BASE_IDLE_DPH
  const baseline = 12 * BASE_IDLE_DPH; // the same 12 settled hours without overdrive
  assert.equal(total - baseline, 4 * BASE_IDLE_DPH); // exactly 4h of extra ×2 (dph each)
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
  assert.equal(r.damage, 2 * BASE_IDLE_DPH); // plain 2h × dph
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

test("idleDphFor sanity under overdrive config: mult is data-driven (×2)", () => {
  // The ×2 lives in OVERDRIVE.idleDamageMult (gameConfig), not hard-coded.
  assert.equal(OVERDRIVE.idleDamageMult, 2);
  assert.equal(
    idleDphFor("battling", 1) * OVERDRIVE.idleDamageMult,
    BASE_IDLE_DPH * OVERDRIVE.idleDamageMult,
  );
});

// =============================================================================
// 2. The NEW goal-armed stamp: endOfEffectiveDay + isOverdriveActive predicate.
// =============================================================================

test("endOfEffectiveDay is the next local midnight (tz 0 and tz -5)", () => {
  // tz 0: 2026-07-15 10:30 UTC → 2026-07-16 00:00 UTC.
  const nowUtc = Date.UTC(2026, 6, 15, 10, 30, 0);
  assert.equal(endOfEffectiveDay(nowUtc, 0), Date.UTC(2026, 6, 16, 0, 0, 0));

  // tz +300 (UTC-5): 2026-07-15 02:00 UTC is 2026-07-14 21:00 local → the next
  // local midnight is 2026-07-15 00:00 local = 2026-07-15 05:00 UTC.
  const nowUtc2 = Date.UTC(2026, 6, 15, 2, 0, 0);
  assert.equal(endOfEffectiveDay(nowUtc2, 300), Date.UTC(2026, 6, 15, 5, 0, 0));
});

test("goal-hit arming: a fresh end-of-day stamp reads active until the reset", () => {
  const now = Date.UTC(2026, 6, 15, 10, 30, 0);
  const armedUntil = endOfEffectiveDay(now, 0); // the recordSteps stamp on a goal-hit
  assert.ok(armedUntil > now); // always in the future → arms Overdrive
  assert.equal(isOverdriveActive(armedUntil, now), true); // active right after the goal
  assert.equal(isOverdriveActive(armedUntil, armedUntil - 1), true); // still active 1ms before reset
  assert.equal(isOverdriveActive(armedUntil, armedUntil), false); // AT the reset → off (strictly >)
  assert.equal(isOverdriveActive(armedUntil, armedUntil + 1), false); // after reset → off, no punish
});

test("isOverdriveActive predicate: unset / zero / past / future", () => {
  const now = 1_000_000;
  assert.equal(isOverdriveActive(undefined, now), false); // never armed
  assert.equal(isOverdriveActive(0, now), false); // legacy zero
  assert.equal(isOverdriveActive(now - 1, now), false); // stale (yesterday's stamp)
  assert.equal(isOverdriveActive(now + 1, now), true); // armed
});

// =============================================================================
// 3. The NEW Super Attack ×2 factor (spec §5.4, OVERDRIVE.boostsSuperAttack).
// =============================================================================

// Mirrors the pure factor in combat.applyDeploy (the mutation itself isn't
// unit-testable; the factor expression is, like bonusMath tests pure helpers).
function superAttackOverdriveMult(overdriveActiveUntil, effNow) {
  return isOverdriveActive(overdriveActiveUntil, effNow) &&
    OVERDRIVE.boostsSuperAttack
    ? OVERDRIVE.idleDamageMult
    : 1;
}

test("Super Attack factor is ×2 when armed & boostsSuperAttack, else ×1", () => {
  assert.equal(OVERDRIVE.boostsSuperAttack, true);
  const now = 1_000_000;
  assert.equal(superAttackOverdriveMult(now + HOUR_MS, now), 2); // armed → ×2
  assert.equal(superAttackOverdriveMult(now - 1, now), 1); // expired → ×1
  assert.equal(superAttackOverdriveMult(undefined, now), 1); // never armed → ×1
});

test("worked example (spec §5.4): 10k bank, first-of-day crit, streak 1.4125", () => {
  // The exact combat.applyDeploy damage line:
  //   round(available × DAMAGE_PER_ENERGY × critMult × streakMult × boost(1)
  //         × overdriveMult)
  const available = 10_000;
  const critMult = 2; // first-of-day guaranteed crit
  const streakMult = 1.4125; // the ticket's Job-2 streak scenario
  const boost = 1;
  const now = 1_000_000;

  const withoutOD = Math.round(
    available * DAMAGE_PER_ENERGY * critMult * streakMult * boost * superAttackOverdriveMult(undefined, now),
  );
  const withOD = Math.round(
    available * DAMAGE_PER_ENERGY * critMult * streakMult * boost * superAttackOverdriveMult(now + HOUR_MS, now),
  );

  // 10,000 × DAMAGE_PER_ENERGY × 2 (crit) × 1.4125 (streak) = 1,412,500 at scale 50.
  assert.equal(withoutOD, Math.round(available * DAMAGE_PER_ENERGY * critMult * streakMult));
  assert.equal(withOD, withoutOD * OVERDRIVE.idleDamageMult); // exactly ×2 the no-OD Super Attack
});
