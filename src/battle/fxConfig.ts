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
  // One-shot swings HOLD their final frame this long before onDone (STR-92).
  // Time-based playback gives the finale exactly one 83ms tick — and under
  // jank withTiming SKIPS trailing frames — so without a hold, 17-frame
  // specials read as "cut off". Deliberately SMALL: user testing rejected a
  // 120ms hold ("pause then teleport") AND an opacity crossfade (breaks the
  // pixel aesthetic) — the swing ends with the HTML preview's hard cut to
  // idle frame 0, this hold only guarantees the climax frame actually lands.
  lastFrameHoldMs: 40,

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

/**
 * Scene layout constants (battlefield-ui.html parity — plan step 5, STR-21).
 * The HTML preview remains the tuning environment; any change to its inline
 * constants must be mirrored here 1:1. Values verified 2026-07-14.
 *
 * The HTML mixes CSS percent and px (`calc(4% - 18px)`); RN has no calc(), so
 * BattleScene computes everything in px from the stage's onLayout size —
 * same numbers, same result (documented adaptation #1).
 */
export const SCENE = {
  // css px per source art px: desktop vs iPhone-class widths (PHONE flag).
  pxPerSrcDesktop: 1.7,
  pxPerSrcPhone: 1.4,
  phoneMaxWidth: 430, // stage width at/below this = phone fit

  srcHero: 128, // hero art canvas (display height = srcHero × pxPerSrc, × job1Scale for job-1s)
  srcBoss: 256, // boss art canvas (min display height before auto-scale)

  // STR-91 EXPERIMENT (may be reverted — set to 1 to turn off): job-1 sprites
  // were generated with oversized heads vs their job-ups, so rookies read as
  // physically BIGGER than evolved forms. Until/unless the art is regenerated,
  // job-1 fighters render at this fraction of normal hero height. Scene only —
  // portraits normalize size inside their frames already.
  job1Scale: 0.75,

  // Party formation: two staggered columns; hero i sits at
  // bottom (partyBasePct + i·partyStepPct)% − partyDy px,
  // left (col%)·stageW + partyDx px. Front hero (i=0) uses the RIGHT column.
  partyBasePct: 22,
  partyStepPctDesktop: 5,
  partyStepPctPhone: 4.2,
  colLeftPct: -8,
  colRightPct: 4,
  partyDx: -18, // px nudge: negative = left
  partyDy: 50, // px nudge: positive = down
  heroZFront: 9, // front hero zIndex; each row behind = one less (parity: 9…2)

  // Boss placement: bottom edge at 22% of stage height, right edge overhanging
  // the stage by 30% of the boss's own width (HTML: right:0 + translateX(30%)).
  bossBottomPct: 0.22,
  bossOverhangFrac: 0.3,

  // AUTO-SCALE rule: the boss is never shorter than the party stack — its
  // visible top must reach the top party member's head. Pads are MEASURED
  // first-visible-pixel rows (horse art starts 6px into its 256 canvas, the
  // crowned form 1px; hero heads sit ~20% into their canvas).
  bossTopPad: {
    horse_256: 6 / 256,
    horse_crowned_256: 1 / 256,
  } as Record<string, number>,
  heroTopPad: 0.2,

  // Idle choreography (timer parity): basics every cycle, staggered down the
  // party; each hero's every-4th attack upgrades to their special.
  cycleMs: 3600,
  staggerMs: 420,
  specialEvery: 4,

  // Continuous idle-attack loop (Core Loop v2, spec §5.1 / §6). The connected
  // scene drives a per-member ambient BASIC swing (basics only — spec §11 Q5;
  // specials/ultimates stay reserved for the Super Attack) keyed off each
  // member's live fuel state. STR-77 consumes these; they carry NO damage number
  // (the idle economy is server-settled, not per-swing). Period per member =
  //   idleLoopCycleMs × (winded ? windedCycleMult : 1)
  //                   × (overdrive && isMe ? overdriveCycleMult : 1),
  // first fire offset by index × idleLoopStaggerMs so the party doesn't swing in
  // unison. Resting members are skipped (they kneel).
  idleLoopCycleMs: 2200, // TUNABLE start — Battling ambient swing period
  idleLoopStaggerMs: 300, // TUNABLE start — per-member phase offset (staggered columns)
  windedCycleMult: 2.0, // TUNABLE start — Winded swings ~2× slower (visibly tired)
  overdriveCycleMult: 0.65, // TUNABLE start — your Overdrive speeds the loop up (~0.65× period)

  // Perf mitigation (plan §Perf risks): cap concurrently mounted projectiles.
  maxConcurrentShots: 8,
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

/**
 * Per-job render scale (STR-91 experiment): job-1 folders ("1_rookie", …)
 * draw at SCENE.job1Scale of the normal hero height; every other job at 1.
 * Anchors are fractions of the rendered frame, so shot geometry scales free.
 */
export function jobRenderScale(job: string): number {
  return job.startsWith("1_") ? SCENE.job1Scale : 1;
}
