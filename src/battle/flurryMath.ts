// =============================================================================
// flurryMath — the Super Attack flurry's damage split (Core Loop v2 spec §5.3),
// extracted PURE from ConnectedBattleScene (STR-85) so node can strip-type it
// for tests (tests/flurry.test.mjs). NO React/react-native imports allowed
// here — that's what makes `node --experimental-strip-types` able to load it.
//
// NOTE on the defaults: src/config/assets.ts owns the LIVE SUPER_ATTACK
// tunables, but that module require()s PNGs at load time, so node strip-types
// cannot import it. The runtime caller (ConnectedBattleScene) therefore passes
// assets.ts's SUPER_ATTACK explicitly — the defaults below are a mirrored copy
// that only tests rely on. If you retune SUPER_ATTACK in assets.ts, mirror the
// values here (they're marked TUNABLE there too).
// =============================================================================

/** The subset of SUPER_ATTACK (src/config/assets.ts) the split math needs. */
export interface SuperAttackSplitConfig {
  /** spent ÷ this → hit count (before clamping). */
  energyPerHit: number;
  minHits: number;
  maxHits: number;
  /** The special finisher's share of the total (buildups split the rest). */
  finisherFrac: number;
}

/** Mirror of assets.ts SUPER_ATTACK (see header note) — tests use this. */
export const SUPER_ATTACK_DEFAULTS: SuperAttackSplitConfig = {
  energyPerHit: 1500,
  minHits: 2,
  maxHits: 10,
  finisherFrac: 0.5,
};

export interface FlurryHit {
  kind: "basic" | "special";
  dmg: number;
}

/**
 * Split one Super Attack into its flurry hits (spec §5.3):
 *   • N = clamp(round(spent / energyPerHit), minHits, maxHits) — the flurry's
 *     LENGTH scales with the BANK (energy spent), not the damage roll, so it
 *     honestly visualizes walking.
 *   • The damage split sums to `amount` EXACTLY (the spec's hard invariant —
 *     no economy lie): the special finisher carries finisherFrac of the total
 *     PLUS every rounding remainder → the single largest number; the N−1
 *     basic buildups share the floored rest evenly (max spread 1 point).
 *   • The finisher stays STRICTLY largest even in the degenerate
 *     finisherFrac=0.5 / N=2 / even-total 50-50 case (1 point is shifted from
 *     the first buildup to the finisher; the sum stays exact).
 * The finisher is always the LAST hit (the "BOOM").
 */
export function splitSuperAttack(
  spent: number,
  amount: number,
  cfg: SuperAttackSplitConfig = SUPER_ATTACK_DEFAULTS,
): FlurryHit[] {
  // N = clamp(round(spent / energyPerHit), minHits, maxHits).
  const N = Math.max(
    cfg.minHits,
    Math.min(cfg.maxHits, Math.round(spent / cfg.energyPerHit)),
  );
  const buildupCount = N - 1;
  const finisherBase = Math.round(cfg.finisherFrac * amount);
  const pool = amount - finisherBase; // the buildups' shared pool
  const each = buildupCount > 0 ? Math.floor(pool / buildupCount) : 0;
  let finisher = finisherBase + (pool - each * buildupCount); // remainder → finisher
  const buildups = Array.from({ length: buildupCount }, () => each);
  if (buildupCount > 0 && finisher <= each) {
    buildups[0] -= 1;
    finisher += 1;
  }
  return [
    ...buildups.map((dmg): FlurryHit => ({ kind: "basic", dmg })),
    { kind: "special", dmg: finisher },
  ];
}
