// =============================================================================
// Bonus Boss math tests — pure functions, no Convex. Run with:
//   node --experimental-strip-types --test tests/
// (the flag lets Node load the .ts modules directly; they use erasable-types-
// only syntax). Expected values are expressed as multiples of BOSS.baseHP (B)
// rather than hard-coded magnitudes, so they stay correct if the DAMAGE_SCALE
// is re-tuned (see gameConfig.ts). The invariants under test are the tier
// FRACTIONS and member/tier scaling, not the absolute numbers:
//   tiers 0.25 / 0.5 / 1.0 of the KILLED boss's bossMaxHP → ×1.1 / ×1.2 / ×1.35
//   maxBoostMult 1.5 · tierScaling 1.4
//   → 4-member tier-1 boss = 4·B (tiers B / 2B / 4B), solo = B (tiers .25B/.5B/B).
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BONUS_BOSS,
  BOSS,
  STREAK,
  bossMaxHP,
  bonusTierFor,
  bonusTiersFor,
  effectiveBoostMult,
  nextBonusTierTarget,
} from "../convex/gameConfig.ts";

// Anchor every expectation to the configured boss base HP so a scale re-tune
// can't break these (they test the fractions/scaling, not the magnitudes).
const B = BOSS.baseHP;

// The spec's two worked examples, derived via bossMaxHP() (NOT hard-coded HP)
// so the bonus tiers provably inherit member-count scaling.
const CREW_HP = bossMaxHP(1, 4); // 4-member guild, week tier 1 = 4·B
const SOLO_HP = bossMaxHP(1, 1); // solo guild, week tier 1 = B

// --- thresholds inherit boss scaling (spec §4 example math) -------------------

test("4-member tier-1 guild: tiers land at B / 2B / 4B", () => {
  assert.equal(CREW_HP, 4 * B); // baseHP × 4 members × 1.4^0
  assert.deepEqual(
    BONUS_BOSS.tiers.map((t) => t.thresholdFrac * CREW_HP),
    [B, 2 * B, 4 * B],
  );
  assert.deepEqual(bonusTierFor(B, CREW_HP), { tier: 1, mult: 1.1 });
  assert.deepEqual(bonusTierFor(2 * B, CREW_HP), { tier: 2, mult: 1.2 });
  assert.deepEqual(bonusTierFor(4 * B, CREW_HP), { tier: 3, mult: 1.35 });
});

test("solo guild: tiers land at .25B / .5B / B — small crews can always reach", () => {
  assert.equal(SOLO_HP, B);
  assert.deepEqual(
    BONUS_BOSS.tiers.map((t) => t.thresholdFrac * SOLO_HP),
    [0.25 * B, 0.5 * B, B],
  );
  // A short window of engaged walking clears the first solo tier (0.25·B).
  assert.deepEqual(bonusTierFor(0.3 * B, SOLO_HP), { tier: 1, mult: 1.1 });
  assert.deepEqual(bonusTierFor(0.25 * B, SOLO_HP), { tier: 1, mult: 1.1 });
  assert.deepEqual(bonusTierFor(B, SOLO_HP), { tier: 3, mult: 1.35 });
});

// --- tier boundaries: reaching a threshold is INCLUSIVE (damage ≥ threshold) --

test("boundaries: 1 short of a threshold stays below, exactly ON it reaches", () => {
  assert.deepEqual(bonusTierFor(B - 1, CREW_HP), { tier: 0, mult: 1 });
  assert.deepEqual(bonusTierFor(B, CREW_HP), { tier: 1, mult: 1.1 });
  assert.deepEqual(bonusTierFor(2 * B - 1, CREW_HP), { tier: 1, mult: 1.1 });
  assert.deepEqual(bonusTierFor(2 * B, CREW_HP), { tier: 2, mult: 1.2 });
  assert.deepEqual(bonusTierFor(4 * B - 1, CREW_HP), { tier: 2, mult: 1.2 });
  assert.deepEqual(bonusTierFor(4 * B, CREW_HP), { tier: 3, mult: 1.35 });
});

test("below the first threshold is tier 0 / ×1.0 — the floor, never a loss", () => {
  assert.deepEqual(bonusTierFor(0, CREW_HP), { tier: 0, mult: 1 });
  assert.deepEqual(bonusTierFor(1, CREW_HP), { tier: 0, mult: 1 });
  assert.deepEqual(bonusTierFor(0, SOLO_HP), { tier: 0, mult: 1 });
});

// --- clamp at maxBoostMult ----------------------------------------------------

test("mult never exceeds maxBoostMult, even at absurd overkill damage", () => {
  const overkill = bonusTierFor(100 * CREW_HP, CREW_HP);
  assert.equal(overkill.tier, BONUS_BOSS.tiers.length); // max tier, no phantom tiers
  assert.ok(overkill.mult <= BONUS_BOSS.maxBoostMult);
  assert.equal(overkill.mult, Math.min(1.35, BONUS_BOSS.maxBoostMult)); // = 1.35 shipped
  // Config sanity: every shipped tier sits under the ceiling (the clamp is a
  // safety net for future tiers, not a silent re-tune of the shipped ones)…
  for (const t of BONUS_BOSS.tiers) assert.ok(t.boostMult <= BONUS_BOSS.maxBoostMult);
  // …and the preview side clamps identically.
  assert.ok(nextBonusTierTarget(0, CREW_HP).mult <= BONUS_BOSS.maxBoostMult);
});

// --- nextBonusTierTarget: the "damage to go" preview readout -------------------

test("nextBonusTierTarget at tier 0: the full first threshold to go", () => {
  assert.deepEqual(nextBonusTierTarget(0, CREW_HP), {
    damageToGo: B,
    mult: 1.1,
  });
  assert.deepEqual(nextBonusTierTarget(0, SOLO_HP), {
    damageToGo: 0.25 * B,
    mult: 1.1,
  });
});

test("nextBonusTierTarget at tiers 1 and 2 chases the NEXT threshold", () => {
  // Exactly on T1 (B): 2B − B = B to ×1.2.
  assert.deepEqual(nextBonusTierTarget(B, CREW_HP), {
    damageToGo: B,
    mult: 1.2,
  });
  // 1,000 short of T2: the readout counts down to the boundary.
  assert.deepEqual(nextBonusTierTarget(2 * B - 1000, CREW_HP), {
    damageToGo: 1_000,
    mult: 1.2,
  });
  // Mid tier 2 (3B): 4B − 3B = B to ×1.35.
  assert.deepEqual(nextBonusTierTarget(3 * B, CREW_HP), {
    damageToGo: B,
    mult: 1.35,
  });
});

test("nextBonusTierTarget is null at max tier — nothing left to chase", () => {
  assert.equal(nextBonusTierTarget(4 * B, CREW_HP), null); // exactly on T3
  assert.equal(nextBonusTierTarget(5 * B, CREW_HP), null); // way past it
  assert.equal(nextBonusTierTarget(B, SOLO_HP), null);
});

test("shown == applied: dealing exactly damageToGo lands exactly the previewed mult", () => {
  // The UI promises "N damage to ×M"; dealing precisely N must stamp M — this
  // pins both the shared-helper invariant and the inclusive (≥) boundary.
  for (const damage of [0, 0.5 * B, B, 1.5 * B, 2 * B - 1]) {
    const target = nextBonusTierTarget(damage, CREW_HP);
    const landed = bonusTierFor(damage + target.damageToGo, CREW_HP);
    assert.equal(landed.mult, target.mult, `preview broke its promise at ${damage}`);
  }
});

// --- defensive inputs -----------------------------------------------------------

test("degenerate killedBossMaxHP: tier 0 / no target, never a phantom max tier", () => {
  assert.deepEqual(bonusTierFor(50_000, 0), { tier: 0, mult: 1 });
  assert.equal(nextBonusTierTarget(50_000, 0), null);
});

// --- config sanity (spec anchors) -------------------------------------------------

test("tiers ascend in BOTH fields — nextBonusTierTarget walks them in order", () => {
  for (let i = 1; i < BONUS_BOSS.tiers.length; i++) {
    assert.ok(BONUS_BOSS.tiers[i].thresholdFrac > BONUS_BOSS.tiers[i - 1].thresholdFrac);
    assert.ok(BONUS_BOSS.tiers[i].boostMult > BONUS_BOSS.tiers[i - 1].boostMult);
  }
});

// --- bonusTiersFor (STR-56): the absolute tier markers the dashboard exposes --

test("bonusTiersFor: absolute thresholds = thresholdFrac × killed bossMaxHP", () => {
  assert.deepEqual(bonusTiersFor(CREW_HP), [
    { threshold: B, boostMult: 1.1 },
    { threshold: 2 * B, boostMult: 1.2 },
    { threshold: 4 * B, boostMult: 1.35 },
  ]);
  assert.deepEqual(bonusTiersFor(SOLO_HP), [
    { threshold: 0.25 * B, boostMult: 1.1 },
    { threshold: 0.5 * B, boostMult: 1.2 },
    { threshold: B, boostMult: 1.35 },
  ]);
});

test("bonusTiersFor clamps every tier's mult at maxBoostMult, like the stamping", () => {
  for (const t of bonusTiersFor(CREW_HP)) {
    assert.ok(t.boostMult <= BONUS_BOSS.maxBoostMult);
  }
});

test("shown markers == stamped reward: landing EXACTLY on a marker earns its mult", () => {
  // The dashboard draws bonusTiersFor's markers on the meter; the rollover
  // stamps bonusTierFor's mult. Both walk the SAME list, so touching marker i
  // must stamp marker i's mult — and one damage point below must not.
  for (const hp of [CREW_HP, SOLO_HP, 1_234_567]) {
    const tiers = bonusTiersFor(hp);
    for (let i = 0; i < tiers.length; i++) {
      assert.deepEqual(bonusTierFor(tiers[i].threshold, hp), {
        tier: i + 1,
        mult: tiers[i].boostMult,
      });
      const below = bonusTierFor(tiers[i].threshold - 1, hp);
      assert.equal(below.tier, i, `marker ${i} leaked downward at hp=${hp}`);
    }
  }
});

// --- effectiveBoostMult (STR-56): the boostAppliesTo scope gate ----------------

test("shipped scope is 'all': both channels apply the stamped mult", () => {
  assert.equal(BONUS_BOSS.boostAppliesTo, "all");
  assert.equal(effectiveBoostMult("deploys", 1.2), 1.2);
  assert.equal(effectiveBoostMult("idle", 1.2), 1.2);
});

test("no stamp (undefined) is the ×1.0 floor on every channel and scope", () => {
  for (const scope of ["all", "deploys", "idle"]) {
    assert.equal(effectiveBoostMult("deploys", undefined, scope), 1);
    assert.equal(effectiveBoostMult("idle", undefined, scope), 1);
  }
});

test("re-scoping is a config flip: each scope gates exactly its own channel", () => {
  // scope "deploys": deploys boosted, idle untouched.
  assert.equal(effectiveBoostMult("deploys", 1.35, "deploys"), 1.35);
  assert.equal(effectiveBoostMult("idle", 1.35, "deploys"), 1);
  // scope "idle": idle boosted, deploys untouched.
  assert.equal(effectiveBoostMult("idle", 1.35, "idle"), 1.35);
  assert.equal(effectiveBoostMult("deploys", 1.35, "idle"), 1);
  // scope "all": everything boosted.
  assert.equal(effectiveBoostMult("deploys", 1.35, "all"), 1.35);
  assert.equal(effectiveBoostMult("idle", 1.35, "all"), 1.35);
});

test("the boost softens the weekly ramp but can never cancel it", () => {
  // Spec §2: each kill makes next week's boss ×1.4; the max shipped boost
  // (×1.35) is deliberately SMALLER — no runaway snowball.
  const maxShippedBoost = BONUS_BOSS.tiers[BONUS_BOSS.tiers.length - 1].boostMult;
  assert.ok(maxShippedBoost < BOSS.tierScaling); // 1.35 < 1.4
  // Cap interplay: absolute worst case streak × boost stays at the spec's ×4.5.
  assert.ok(STREAK.maxStreakMult * BONUS_BOSS.maxBoostMult <= 4.5);
});
