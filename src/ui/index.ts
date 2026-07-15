// =============================================================================
// src/ui barrel — the STR-64 runtime primitives. Screen-agnostic pixel HUD kit
// composited from the STR-63 baked chrome (uiMap/theme/assets, GENERATED). This
// module imports NOTHING from src/game (spec §11 — the onboarding re-skin and
// the game screen both build ON these).
// =============================================================================
export { UIScaleProvider, useUIScale, DEFAULT_ART_SCALE } from "./scale";
export { BakedImage, PIXELATED, artDims } from "./Baked";
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
export { Beacon } from "./Beacon";
export { Sheet } from "./Sheet";
export { Popover, type PopoverSide } from "./Popover";
export { Modal } from "./Modal";
