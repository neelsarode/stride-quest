// =============================================================================
// UI theme context (Approach 2: per-class CHROME + accent).
//
// The whole HUD is baked once per class (frames, wells, faces, portraits) into a
// content-deduped pool (src/ui/uiMap.ts UI_POOL/UI_MAPS) with a matching per-
// class colour set (src/ui/theme.ts UI_THEMES). This context carries the current
// `classKey`, which the two chrome primitives (Baked, Frame) read to resolve
// their PNG via uiAsset(classKey, name) — so a mage renders amethyst frames on
// glass wells, an assassin blackened iron on blood, etc., all from the same
// component tree. It also exposes the class ACCENT (the fuel/xp fill + secondary
// label colour) for the View-level reads that were themed in Approach 1.
//
// Mirrors UIScaleProvider (src/ui/scale.ts): a small Context with a DEFAULT so
// any out-of-provider read (the classic DashboardScreen, onboarding) gets the
// shipped warrior kit unchanged. Colours are derived from UI_THEMES — one source
// of truth, the baked kit — never hand-duplicated.
// =============================================================================
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { UI_THEMES } from "./theme";
import type { ClassKey } from "./uiMap";

export type ThemeAccent = { light: string; mid: string; dark: string };
/** The runtime theme context value: which class's chrome to render + its accent. */
export type UITheme = { classKey: ClassKey; accent: ThemeAccent };

const DEFAULT_CLASS: ClassKey = "warrior";

/** Resolve a class key to its theme (falls back to the warrior default). The
 *  accent is the class "sky" role (fuel/xp fills, secondary labels, tier ticks). */
export function themeForClass(classKey: string | undefined | null): UITheme {
  const cls: ClassKey =
    classKey && classKey in UI_THEMES ? (classKey as ClassKey) : DEFAULT_CLASS;
  const p = UI_THEMES[cls].palette;
  return {
    classKey: cls,
    accent: { light: p.sky_light, mid: p.sky_mid, dark: p.sky_dark },
  };
}

/** The shipped warrior kit — the baked default for out-of-provider reads. */
export const DEFAULT_UI_THEME: UITheme = themeForClass(DEFAULT_CLASS);

/** Ordered themeable class keys — the dev cycler steps through these. */
export const THEME_CLASS_KEYS = Object.keys(UI_THEMES) as ClassKey[];

// --- Dev-only theme override (DevPanel theme cycler) ------------------------
// A module-level store (same shape as the Overlays host store) so the DevPanel
// can force the whole HUD to a class WITHOUT changing the account's class. Now
// that Baked/Frame resolve chrome from classKey, cycling this live re-tints the
// entire interface. `null` = honour the player's real class.
let devThemeOverride: string | null = null;
const devThemeListeners = new Set<() => void>();

export function setDevThemeOverride(classKey: string | null): void {
  devThemeOverride = classKey;
  devThemeListeners.forEach((l) => l());
}

export function useDevThemeOverride(): string | null {
  return useSyncExternalStore(
    (cb) => {
      devThemeListeners.add(cb);
      return () => devThemeListeners.delete(cb);
    },
    () => devThemeOverride,
    () => devThemeOverride,
  );
}

const UIThemeContext = createContext<UITheme>(DEFAULT_UI_THEME);

export const useUITheme = () => useContext(UIThemeContext);

export function UIThemeProvider({
  theme,
  children,
}: {
  theme: UITheme;
  children: ReactNode;
}) {
  return <UIThemeContext.Provider value={theme}>{children}</UIThemeContext.Provider>;
}
