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
  fuel: "#7fe3d2", // fuel gauge teal (dashboard-ui.html mock)
  overdrive: "#c77dff", // overdrive purple (dashboard-ui.html mock gradient)
} as const;

/** Hero fuel-state presentation (STR-13) — chip label + colors per state,
 *  transcribed from the dashboard-ui.html mock. Tone guardrail (spec §3):
 *  Resting is DIGNIFIED — calm neutral, NEVER red, no shame styling, ever. */
export const HERO_STATE_STYLE = {
  battling: { label: "BATTLING", color: "#7fe3d2", bg: "#0a2c28" },
  winded: { label: "WINDED", color: "#ffc46b", bg: "#342208" }, // warm amber — a nudge, not a warning
  resting: { label: "RESTING", color: "#b9c0cf", bg: "#1c1c22" }, // calm neutral — recoverable, never shameful
} as const;
export type HeroStateKey = keyof typeof HERO_STATE_STYLE;

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
  // M2.5 teaching layer (STR-49): the week-framing arrival banner and the
  // joiner's welcome. Cozy, never punitive — no red (binding guardrail).
  bossAppears: { bg: "#241f33", fg: PALETTE.accent, icon: "⚔" },
  guildJoined: { bg: "#13293a", fg: PALETTE.energy, icon: "🤝" },
  // Fuel-state transitions (STR-13). Resting = the dignified kneel — calm
  // neutrals, NEVER red (spec §3 tone guardrail); recovery = a small celebration.
  heroResting: { bg: "#1c1f28", fg: "#b9c0cf", icon: "🧎" },
  backInFight: { bg: "#12331f", fg: PALETTE.good, icon: "⚔" },
  // Overdrive pop (STR-14): the player-chosen fever moment — loud and purple.
  overdrive: { bg: "#2a1140", fg: PALETTE.overdrive, icon: "⚡" },
  // A friend's rally arrived (STR-15): the welcome-back celebration — warm
  // energy cyan, named after the SENDER (peer nudge > app nudge, spec §5).
  rallyReceived: { bg: "#0a2c38", fg: PALETTE.energy, icon: "📣" },
} as const;

/** Teaching-layer tuning (STR-49). Contextual first-session moments — all
 *  keyed by SERVER state (never localStorage), so they fire once per account
 *  across devices. */
export const TEACHING = {
  /** bossAppears fires when the dashboard renders within this window after
   *  the completeOnboarding stamp — "the first post-onboarding render",
   *  generous enough for a slow first load, tight enough that tomorrow's
   *  app-open stays quiet. */
  bossAppearsFreshMs: 2 * 60_000,
  /** First-deploy hint pulse (gentle: small scale swell, slow). */
  deployHintPulseScale: 1.04,
  deployHintPulseMs: 700,
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

/** Per-class accent colors (STR-46; comp beat HERO — the stage plate shifts
 *  with each pick). Hexes transcribed from the approved onboarding comp's
 *  ui-kit ramps (amethyst1/green_light/elder1/ember1/gold1/ghoul_light/
 *  yellow_light), EXCEPT warrior: the comp's sky_light (#e9f4ff) reads as
 *  plain white on the app's dark bg, so warrior keeps the established steel
 *  blue (PALETTE.warrior). Partial so a 9th registry class renders with the
 *  gold fallback before its accent is chosen. */
export const CLASS_ACCENTS: Partial<Record<ClassKey, string>> = {
  warrior: PALETTE.warrior,
  mage: "#dfb8ff", // amethyst
  medic: "#9ae06b", // healing green
  archer: "#c4e07e", // elder leaf
  assassin: "#ffb15c", // ember
  paladin: "#ffe9a0", // radiant gold
  warlock: "#a9f4c9", // ghoul glow
  bard: "#ffe08a", // limelight yellow
};

/** Class accent color (gold fallback for classes without one yet). */
export function classAccent(classKey: ClassKey): string {
  return CLASS_ACCENTS[classKey] ?? PALETTE.accent;
}
