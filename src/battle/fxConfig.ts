// =============================================================================
// fxConfig — typed port of the preview FX constants (docs/fx-rn-port-plan.md,
// step 3 / decision D4). Source of truth for the NUMBERS is still
// assets/fx-engine.js (`FX` + `CLASS_FX`): the HTML rig (fx-test.html) remains
// the tuning environment, so any change there must be mirrored here 1:1.
// Values verified against fx-engine.js as of 2026-07-14.
// =============================================================================

/**
 * Global FX timing / geometry constants (fx-engine.js `FX`, plus the inline
 * magic numbers from its fireProjectile/impactAt, named here so the
 * projectile/boss ticket — plan step 4 — consumes config, not literals).
 */
export const FX = {
  // --- animation playback (frames per second) ---
  idleFps: 6,
  attackFps: 12,
  specialFps: 12,
  restFps: 5, // 6-frame kneel loop → ~1.2s breath (fx-engine parity)
  projFps: 12,
  impactFps: 14,

  // --- projectile flight ---
  speedPxMs: 1.5, // constant px/ms; duration clamped to [flightMinMs, flightMaxMs]
  minTravelPx: 80, // target is pushed at least this far right of the spawn tip
  flightMinMs: 120,
  flightMaxMs: 320,

  // --- effect strip frame counts (cross-check vs sprites/manifest.json) ---
  projFrames: 5,
  impactFrames: 7,
  specialProjFrames: 5,

  // --- sizing ---
  fxScale: 1.7, // every projectile/impact sprite is scaled by this
  specialScale: 1.5, // special (ultimate) projectile/impact extra multiplier
  projBaseSizePx: 64, // basic projectile base size (pre-fxScale)
  specialBaseSizePx: 96, // special projectile base size (pre-fxScale)
  impactSizeMult: 1.3, // impact burst = projectile size × this
  specialImpactMult: 1.25, // special impact gets a further ×1.25 (fx-engine parity)

  // --- boss reaction (consumed by Boss.tsx, plan step 4) ---
  bossChestX: 0.4, // impact lands at this fraction across the boss image
  flashMs: 120, // basic-hit brightness flash duration
  specialFlashMs: 220,
  bumpPx: 4, // basic-hit vertical bump
  specialBumpPx: 9,
} as const;

/** The 8 playable classes (characters/ + assets/effects/ folder names). */
export const CLASS_NAMES = [
  "warrior",
  "mage",
  "medic",
  "archer",
  "assassin",
  "paladin",
  "warlock",
  "bard",
] as const;
export type ClassName = (typeof CLASS_NAMES)[number];

export interface ClassFx {
  /** Degrees to rotate the basic projectile so it faces its flight direction. */
  basicAngle: number;
  /** Same, for the special (ultimate) projectile. */
  specialAngle: number;
}

/**
 * Per-class art config (fx-engine.js `CLASS_FX`). Angles were set by eyeballing
 * each generated projectile sprite in the HTML rig — tune there first.
 * VFX are per-CLASS shared across jobs (user-approved budget decision);
 * per-job feel comes from the per-job anchors in ./anchors.ts.
 */
export const CLASS_FX: Record<ClassName, ClassFx> = {
  warrior: { basicAngle: -30, specialAngle: 0 },
  mage: { basicAngle: 0, specialAngle: 0 },
  medic: { basicAngle: 0, specialAngle: 0 },
  archer: { basicAngle: 0, specialAngle: 0 },
  assassin: { basicAngle: 0, specialAngle: 0 },
  paladin: { basicAngle: 0, specialAngle: 0 },
  warlock: { basicAngle: 0, specialAngle: 0 },
  bard: { basicAngle: 0, specialAngle: 0 },
};

/**
 * On-screen size of a projectile sprite, porting fx-engine's inline formula
 * `(big ? 96 : 64) * FX.fxScale * (big ? FX.specialScale / 1.5 : 1)` exactly.
 * (The /1.5 keeps specialScale a tunable multiplier around the 96px base.)
 */
export function projectileSizePx(kind: "basic" | "special"): number {
  return kind === "special"
    ? FX.specialBaseSizePx * FX.fxScale * (FX.specialScale / 1.5)
    : FX.projBaseSizePx * FX.fxScale;
}
