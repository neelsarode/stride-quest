// =============================================================================
// JUICE stubs — the swap-in seam for real polish (LATER).
// =============================================================================
// These are no-ops today and gated by JUICE flags in assets.ts. When the polish
// phase lands, fill in the bodies (e.g. expo-haptics, screen shake, particles).
// Nothing in game logic, screens, or the event contract changes — only this file
// and the JUICE flags. The LEGIBLE feedback (numbers, bars, banners) lives in the
// components, NOT here, so disabling juice still leaves a fully judgeable game.
// =============================================================================
import { JUICE } from "../config/assets";

export function screenShake(_intensity: number = JUICE.shakeIntensity): void {
  if (!JUICE.screenShake) return;
  // later: drive an Animated transform on a root shake view
}

export function haptic(
  _kind: "light" | "medium" | "heavy" | "success" = "light",
): void {
  if (!JUICE.haptics) return;
  // later: import * as Haptics from "expo-haptics"; map _kind -> impact/notify
}

export function particles(_kind: string): void {
  if (!JUICE.particles) return;
  // later: spawn a particle burst at an anchor
}
