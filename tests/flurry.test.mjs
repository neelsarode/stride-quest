// =============================================================================
// Super Attack flurry split tests (STR-85) — pure math, no React/RN. Run with:
//   node --experimental-strip-types --test tests/
// Covers the Core Loop v2 §5.3 invariants: the on-screen numbers SUM to the
// real damage EXACTLY, N clamps to [minHits, maxHits] by bank size, the
// special finisher is always LAST and STRICTLY the largest number (including
// the degenerate finisherFrac=0.5 / N=2 / even-total 50-50 tie), and the
// buildups are even to within 1 point.
//
// NOTE: the LIVE tunables live in src/config/assets.ts (SUPER_ATTACK), which
// node can't import (it require()s PNGs) — these tests exercise flurryMath's
// mirrored SUPER_ATTACK_DEFAULTS (energyPerHit 1500, minHits 2, maxHits 10,
// finisherFrac 0.5). ConnectedBattleScene passes the assets.ts object at
// runtime, so a retune there changes behavior without touching this math.
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SUPER_ATTACK_DEFAULTS,
  splitSuperAttack,
} from "../src/battle/flurryMath.ts";

const sum = (hits) => hits.reduce((s, h) => s + h.dmg, 0);

// --- shape: buildups then one special finisher, finisher LAST ----------------

test("shape: N-1 basic buildups then exactly one special finisher, last", () => {
  const hits = splitSuperAttack(9000, 28_250); // N = round(6) = 6
  assert.equal(hits.length, 6);
  assert.deepEqual(
    hits.map((h) => h.kind),
    ["basic", "basic", "basic", "basic", "basic", "special"],
  );
});

// --- exact sum (the hard invariant) ------------------------------------------

test("exact sum: odd and even totals, representative banks", () => {
  for (const spent of [0, 1500, 4400, 9000, 15_000, 60_000]) {
    for (const amount of [1, 2, 999, 1000, 28_249, 28_250, 624_000, 624_001]) {
      assert.equal(
        sum(splitSuperAttack(spent, amount)),
        amount,
        `spent=${spent} amount=${amount}`,
      );
    }
  }
});

test("exact sum: full sweep — every total in 1..3000 across all N", () => {
  // Banks chosen to hit every clamped N from 2 through 10.
  const banks = [0, 4500, 6000, 7500, 9000, 10_500, 12_000, 13_500, 15_000];
  for (const spent of banks) {
    for (let amount = 1; amount <= 3000; amount++) {
      const hits = splitSuperAttack(spent, amount);
      assert.equal(sum(hits), amount, `spent=${spent} amount=${amount}`);
    }
  }
});

// --- N clamps (flurry length scales with the BANK) ---------------------------

test("N clamps: spent < 3000 → minHits 2", () => {
  for (const spent of [0, 100, 1500, 2200, 2999]) {
    assert.equal(splitSuperAttack(spent, 10_000).length, 2, `spent=${spent}`);
  }
});

test("N clamps: spent ≥ 15000 → maxHits 10", () => {
  for (const spent of [15_000, 16_000, 100_000, 1_000_000]) {
    assert.equal(splitSuperAttack(spent, 10_000).length, 10, `spent=${spent}`);
  }
});

test("N clamps: mid banks round(spent / 1500)", () => {
  assert.equal(splitSuperAttack(4400, 10_000).length, 3); // round(2.93) = 3
  assert.equal(splitSuperAttack(5250, 10_000).length, 4); // round(3.5)  = 4
  assert.equal(splitSuperAttack(6000, 10_000).length, 4); // round(4)    = 4
  assert.equal(splitSuperAttack(9750, 10_000).length, 7); // round(6.5)  = 7
  assert.equal(splitSuperAttack(13_400, 10_000).length, 9); // round(8.93) = 9
});

// --- finisher strictly largest -----------------------------------------------

test("finisher strictly largest: the 50-50 / N=2 / even-total degenerate", () => {
  // finisherFrac 0.5, N=2, even total → naive split is a 500/500 tie; the
  // split shifts one point so the finisher stays STRICTLY largest, sum exact.
  const hits = splitSuperAttack(0, 1000); // N = minHits = 2
  assert.deepEqual(hits, [
    { kind: "basic", dmg: 499 },
    { kind: "special", dmg: 501 },
  ]);
});

test("finisher strictly largest: sweep across N and parity", () => {
  for (const spent of [0, 4500, 9000, 15_000]) {
    for (let amount = 2; amount <= 2000; amount++) {
      const hits = splitSuperAttack(spent, amount);
      const finisher = hits[hits.length - 1];
      assert.equal(finisher.kind, "special");
      for (const b of hits.slice(0, -1)) {
        assert.ok(
          finisher.dmg > b.dmg,
          `finisher ${finisher.dmg} not > buildup ${b.dmg} (spent=${spent} amount=${amount})`,
        );
      }
    }
  }
});

// --- buildup evenness ---------------------------------------------------------

test("buildups are even to within 1 point", () => {
  for (const spent of [4500, 9000, 15_000]) {
    for (const amount of [7, 999, 1000, 28_250, 624_001]) {
      const buildups = splitSuperAttack(spent, amount)
        .slice(0, -1)
        .map((h) => h.dmg);
      const spread = Math.max(...buildups) - Math.min(...buildups);
      assert.ok(spread <= 1, `spread ${spread} (spent=${spent} amount=${amount})`);
    }
  }
});

// --- defaults mirror ----------------------------------------------------------

test("defaults mirror assets.ts SUPER_ATTACK's split-relevant tunables", () => {
  // Guard the test-only mirror's values (see flurryMath.ts header note —
  // assets.ts itself is not node-importable, so this pins the copy we test).
  assert.deepEqual(SUPER_ATTACK_DEFAULTS, {
    energyPerHit: 1500,
    minHits: 2,
    maxHits: 10,
    finisherFrac: 0.5,
  });
});
