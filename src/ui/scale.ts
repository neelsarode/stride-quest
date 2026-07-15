// =============================================================================
// UI scale seam (STR-64). 1 art px = ART_SCALE dp. Every src/ui primitive sizes
// itself in ART px and multiplies by this scale to get dp; RN's asset resolver
// then picks the @1x/@2x/@3x baked sibling by device density, so the on-screen
// pixels land integer-exact with no runtime smoothing (spec §3/§5).
//
// The screen (STR-66) wraps its tree in <UIScaleProvider value={2|3}> per the
// 430dp rule; every primitive reads it via useUIScale(), and each primitive also
// takes an optional `scale` prop that overrides the context (the dev gallery
// renders the same primitives at 2x AND 3x side-by-side that way).
//
// This module imports NOTHING from src/game (primitives stay screen-agnostic —
// the onboarding re-skin depends on it, spec §11).
// =============================================================================
import { createContext, useContext } from "react";

/** Default art→dp scale (phone). 2 below 430dp, 3 at/above — set by the screen. */
export const DEFAULT_ART_SCALE = 2;

const UIScaleContext = createContext<number>(DEFAULT_ART_SCALE);

export const UIScaleProvider = UIScaleContext.Provider;

/** Current art→dp scale from context. */
export function useUIScale(): number {
  return useContext(UIScaleContext);
}

/** Resolve an optional per-component scale override against the context value.
 *  Call unconditionally (hook rule) — pass the prop, get the effective scale. */
export function useResolvedScale(override?: number): number {
  const ctx = useUIScale();
  return override ?? ctx;
}
