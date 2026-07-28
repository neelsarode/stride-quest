// =============================================================================
// src/ui barrel — the STR-64 runtime primitives. Screen-agnostic pixel HUD kit
// composited from the STR-63 baked chrome (uiMap/theme/assets, GENERATED). This
// module imports NOTHING from src/game (spec §11 — the onboarding re-skin and
// the game screen both build ON these).
// =============================================================================
export { UIScaleProvider, useUIScale, DEFAULT_ART_SCALE } from "./scale";
export {
  UIThemeProvider,
  useUITheme,
  themeForClass,
  DEFAULT_UI_THEME,
  THEME_CLASS_KEYS,
  setDevThemeOverride,
  useDevThemeOverride,
  type UITheme,
  type ThemeAccent,
} from "./theme-context";
export { BakedImage, PIXELATED, artDims } from "./Baked";
export { RevealGate, type RevealGateProps } from "./RevealGate";
export { prefetchUiChrome } from "./prefetch";
import { UI_ASSETS } from "./uiMap";
/** The shared bitmap-font atlases every label samples — the asset a RevealGate
 *  waits on so text reveals whole instead of typing in (class-invariant). */
export const UI_FONT_ATLASES = [UI_ASSETS.font_white, UI_ASSETS.font_white_outlined];
export {
  PixelText,
  measurePixelText,
  type PixelTextVariant,
} from "./PixelText";
export { Frame, type FrameSliceKey } from "./Frame";
export {
  Bar,
  type BarHandle,
  type BarVariant,
  type BarFill,
} from "./Bar";
export { Button, type ButtonMaterial } from "./Button";
export { Chip, type ChipColor } from "./Chip";
export { Badge } from "./Badge";
export { Portrait, type PortraitSize } from "./Portrait";
export { StatusDot, type HeroState } from "./StatusDot";
export { Ring } from "./Ring";
export { StepsBar } from "./StepsBar";
export { Beacon } from "./Beacon";
export { Sheet } from "./Sheet";
export {
  Popover,
  POPOVER_CONTENT_W,
  POPOVER_PAD,
  type PopoverSide,
} from "./Popover";
export { Modal } from "./Modal";
