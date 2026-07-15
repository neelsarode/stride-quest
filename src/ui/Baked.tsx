// =============================================================================
// BakedImage — the one low-level primitive every piece of baked chrome renders
// through. Draws a single generated PNG (uiMap require) at its art dimensions
// (theme UI_DIMS) × the effective scale, nearest-neighbour crisp on web.
//
// Fixed-size chrome (buttons, badges, dots, portraits frames, icons, beacon
// rings, arrows) is exactly one BakedImage; 3-slice frames (Frame.tsx) compose
// three of them; PixelText composes one clipped Image per glyph. Same strip
// technique as src/battle/Sprite.tsx — RN passes unknown style keys through to
// CSS on web, so `imageRendering: pixelated` keeps upscaled art crisp there;
// native has no equivalent Image prop (slight smoothing, iOS polish note).
// =============================================================================
import { Image, Platform, type ImageStyle, type StyleProp } from "react-native";
import { UI_ASSETS, type UiAssetKey } from "./uiMap";
import { UI_DIMS } from "./theme";
import { useResolvedScale } from "./scale";

/** Crisp pixel-art upscaling on web (parity with Sprite.tsx PIXELATED). */
export const PIXELATED =
  Platform.OS === "web" ? ({ imageRendering: "pixelated" } as object) : null;

/** Art-pixel {w,h} of any baked key (keys of UI_DIMS ⊇ every UiAssetKey). */
export function artDims(name: UiAssetKey): { w: number; h: number } {
  return UI_DIMS[name as keyof typeof UI_DIMS];
}

export interface BakedImageProps {
  name: UiAssetKey;
  /** Override the context art scale (dp per art px). */
  scale?: number;
  /** Recolour a white/alpha atlas (font, tintable glyphs). */
  tintColor?: string;
  style?: StyleProp<ImageStyle>;
}

/** A generated PNG at its baked art size × scale. */
export function BakedImage({ name, scale, tintColor, style }: BakedImageProps) {
  const s = useResolvedScale(scale);
  const d = artDims(name);
  return (
    <Image
      source={UI_ASSETS[name]}
      style={[
        { width: d.w * s, height: d.h * s },
        tintColor != null ? { tintColor } : null,
        PIXELATED,
        style,
      ]}
      resizeMode="stretch"
      fadeDuration={0}
    />
  );
}

export default BakedImage;
