// =============================================================================
// VISUAL CONFIG — the ONE place all visuals live.
// =============================================================================
// Per the brief: centralize sprite references, colors, and sizes behind a single
// module so swapping placeholder rectangles for the real pixel art is a one-place
// change. Phase 1 ships placeholders (labeled colored boxes). The real sprites
// already exist under /characters — see spriteRelPath() for the mapping.
// =============================================================================

import { CLASSES, type ClassKey } from "../../convex/gameConfig";

/** Colors. Dark, pixel-art-friendly placeholder palette. */
export const PALETTE = {
  bg: "#11131a",
  panel: "#1b1f2a",
  panelBorder: "#2b3142",
  text: "#e8ecf4",
  textDim: "#8a93a6",
  accent: "#ffd166", // gold
  hp: "#e5484d", // boss HP red
  hpTrack: "#3a1d20",
  good: "#3fb950", // success / goal-hit green
  warrior: "#5b8cff", // steel/blue-gold class accent
  energy: "#4fd1ff", // energy meter cyan
  xp: "#ffd166", // job XP meter gold
  dev: "#c026d3", // dev panel magenta — unmistakably not real UI
  crit: "#ff7b39", // crit orange
} as const;

/** Spacing / sizing scale. */
export const SIZES = {
  screenPad: 20,
  gap: 14,
  radius: 14,
  spriteBox: 96, // placeholder sprite square
  barHeight: 22,
} as const;

// ============================================================================
// FEEL LAYER config — animation timings, feedback colors, banners, juice flags.
// Centralized so the legible placeholder feedback ships now and real juice
// (particles, screen shake, haptics) drops in later by editing only this block
// + src/feedback/juice.ts. Keep this file pure config (no React/runtime imports).
// ============================================================================

/** Animation timings (ms) + magnitudes. */
export const ANIM = {
  hpTweenMs: 550, // HP bar slide
  meterFillMs: 450, // meter fill slide
  floatRiseMs: 1100, // floating damage number rise+fade
  floatRiseDist: 90, // px a floating number rises
  bannerInMs: 260,
  bannerHoldMs: 1500,
  bannerOutMs: 320,
  toastHoldMs: 2600,
  pressScaleMs: 90, // button press punch
  flashMs: 320, // bar damage flash
  critScale: 1.5, // crit number size multiplier
} as const;

/** Feedback colors + sizes (reuse PALETTE where sensible). */
export const FEEDBACK = {
  damageFlash: "#ffffff",
  critColor: PALETTE.crit,
  damageColor: PALETTE.text,
  idleColor: PALETTE.good,
  goalColor: PALETTE.good,
  streakColor: PALETTE.crit,
  floatNumberSize: 26,
  critNumberSize: 40,
} as const;

/** Per-variant banner presets. `icon` is a placeholder glyph today, a sprite later. */
export const BANNER = {
  jobUp: { bg: "#2b2140", fg: PALETTE.accent, icon: "⬆" },
  goalHit: { bg: "#12331f", fg: PALETTE.good, icon: "✔" },
  bossDefeated: { bg: "#3a1d20", fg: PALETTE.hp, icon: "☠" },
} as const;

/** Swap-in switches for real juice. All OFF now (placeholder feedback only).
 *  Turning these on (later) activates the bodies in src/feedback/juice.ts —
 *  no game-logic changes. */
export const JUICE = {
  screenShake: false,
  haptics: false,
  particles: false,
  shakeIntensity: 8,
} as const;

export type BannerVariant = keyof typeof BANNER;

// ============================================================================
// HUD pixel-art chrome — PixelLab `create_ui_asset`, stone base + gold for
// high-hierarchy, iconography BAKED IN (never overlay emoji/icons on top).
// Generated 2026-07-12 for the fuel-hybrid HUD (STR-39). Repo-relative paths,
// same convention as spriteRelPath(): RN rendering adds a static require()
// map later — the M1 frontend tickets consume these.
// ============================================================================
export const HUD_ASSETS = {
  /** Fuel gauge frame — PRIMARY readout (gold tier), hourglass emblem baked
   *  into the left cap. Display ~308px wide, like the boss HP bar. */
  fuelGauge: "assets/ui/prod/fuel_gauge.png",
  /** Overdrive charge meter — stone bezel, violet crystal shards on the left
   *  cap (Overdrive's signature color). */
  overdriveMeter: "assets/ui/prod/overdrive_meter.png",
  /** Overdrive ACTIVATE — big gold button (visual weight rivals the DEPLOY
   *  button attack_gold2), violet lightning-bolt emblem baked in. */
  overdriveActivate: "assets/ui/prod/overdrive_activate.png",
  /** Rally — guild-board action button (golden war horn baked in), nav-button
   *  scale (~50px). */
  rallyHorn: "assets/ui/prod/rally_horn.png",
  /** Streak Shield — small badge (gold-trimmed shield + flame emblem). */
  shieldBadge: "assets/ui/prod/shield_badge.png",
  /** Roster-size hero-state badges (round stone tokens). Resting must read
   *  COZY (pale moon) — never red, never shameful. */
  stateBattling: "assets/ui/prod/state_battling.png",
  stateWinded: "assets/ui/prod/state_winded.png",
  stateResting: "assets/ui/prod/state_resting.png",
} as const;

/** Directions available for each sprite (matches the art folders). */
export type Direction =
  | "south"
  | "north"
  | "east"
  | "west"
  | "south-east"
  | "south-west"
  | "north-east"
  | "north-west";

/** Animation types available (matches the art folders). */
export type AnimationType = "idle" | "attack" | "evolution" | "special";

/**
 * Relative path to a static sprite in the art library, e.g.
 *   spriteRelPath("warrior", 1, "south") -> "characters/warrior/1_rookie/south.png"
 * NOTE: React Native bundles images via static require(), so actually RENDERING
 * these (Phase 2 / Visuals) means adding a small require() map. This helper keeps
 * the path convention in ONE place so that map is trivial to generate.
 */
export function spriteRelPath(
  classKey: ClassKey,
  jobLevel: number, // 1..5
  direction: Direction = "south",
): string {
  const folder = CLASSES[classKey].jobFolders[jobLevel - 1];
  return `characters/${classKey}/${folder}/${direction}.png`;
}

/** Relative path to an animation frame folder, e.g.
 *   animationDirRelPath("warrior", 5, "attack")
 *     -> "characters/warrior/5_warlord/animations/attack" */
export function animationDirRelPath(
  classKey: ClassKey,
  jobLevel: number,
  type: AnimationType,
): string {
  const folder = CLASSES[classKey].jobFolders[jobLevel - 1];
  return `characters/${classKey}/${folder}/animations/${type}`;
}

/** Class accent color (defaults to warrior for the MVP). */
export function classAccent(_classKey: ClassKey): string {
  return PALETTE.warrior;
}
