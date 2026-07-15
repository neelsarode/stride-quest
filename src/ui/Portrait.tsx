// =============================================================================
// Portrait — baked slim frame (portrait_18/20/22/30) with a live character
// sprite cropped full-body into the well. Ports kit hifiPortrait 1:1: the well
// is the 3-art-px-inset interior (theme WELL_INSETS.slim), and the character is
// drawn from a SOURCE-pixel crop {x,y,s} (theme PORTRAIT_CROPS) scaled to fill
// the well. Character sprites carry large transparent padding, so the crop is
// measured from the alpha box — NEVER assume the character fills the file.
//
// RN version of ctx.drawImage(img, cx,cy,cs,cs, wx,wy,ww,wh): render the WHOLE
// source Image scaled by k = ww/cs (well art px per source px) inside an
// overflow-hidden well, offset by (−cx·k, −cy·k). We need the source's own
// pixel size for that; hifiPortrait read it off the loaded <img>, but RN-web has
// no Image.resolveAssetSource — so callers pass `sourceSize` (native still falls
// back to resolveAssetSource, and an object source's own width is used too).
// Screen-agnostic: imports nothing from src/game.
// =============================================================================
import React from "react";
import {
  Image,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BakedImage, PIXELATED } from "./Baked";
import { PixelText } from "./PixelText";
import { PORTRAIT_CROPS, UI_PALETTE, WELL_INSETS } from "./theme";
import { useResolvedScale } from "./scale";

export type PortraitSize = 18 | 20 | 22 | 30;

interface Crop {
  x: number;
  y: number;
  s: number;
}

/** Source sprite pixel size — number (square) or {w,h}. */
export type SourceSize = number | { w: number; h: number };

// Resolve the source's intrinsic pixel size across platforms.
function resolveSourceSize(
  source: ImageSourcePropType | undefined,
  explicit: SourceSize | undefined,
): { w: number; h: number } | null {
  if (explicit != null) {
    return typeof explicit === "number" ? { w: explicit, h: explicit } : explicit;
  }
  if (source == null) return null;
  // native RN: static asset registry.
  const RNImage = Image as unknown as {
    resolveAssetSource?: (s: ImageSourcePropType) => { width: number; height: number } | null;
  };
  if (typeof RNImage.resolveAssetSource === "function") {
    const r = RNImage.resolveAssetSource(source);
    if (r && r.width) return { w: r.width, h: r.height };
  }
  // some bundlers resolve an image require to an object carrying its dims.
  if (typeof source === "object" && source != null && "width" in source) {
    const o = source as { width?: number; height?: number };
    if (o.width) return { w: o.width, h: o.height ?? o.width };
  }
  return null;
}

export interface PortraitProps {
  size: PortraitSize;
  /** Character sprite (require(...) or {uri}); omit → empty '?' frame. */
  source?: ImageSourcePropType;
  /** Crop key into theme PORTRAIT_CROPS (e.g. "warrior", "warrior_j2"). */
  cropKey?: string;
  /** Explicit source-pixel crop (overrides cropKey). */
  crop?: Crop;
  /** Source sprite pixel size (required on web — resolveAssetSource is absent). */
  sourceSize?: SourceSize;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function Portrait({
  size,
  source,
  cropKey,
  crop,
  sourceSize,
  scale,
  style,
}: PortraitProps) {
  const s = useResolvedScale(scale);
  const inset = WELL_INSETS.slim; // portraits use the 3px slim frame (hifiPortrait)
  const wellW = size - inset.dw;
  const wellH = size - inset.dh;

  const resolvedCrop: Crop | undefined =
    crop ?? (cropKey ? PORTRAIT_CROPS[cropKey] : undefined);
  const srcSize = resolveSourceSize(source, sourceSize);

  let inner: React.ReactNode;
  if (source != null && srcSize) {
    const cp: Crop =
      resolvedCrop ?? {
        // hifiPortrait's fallback centre crop when no measured box exists.
        x: Math.round(srcSize.w * 0.4),
        y: Math.round(srcSize.h * 0.24),
        s: Math.round(srcSize.w * 0.24),
      };
    const k = wellW / cp.s; // well art px per source px
    inner = (
      <Image
        source={source}
        style={[
          {
            position: "absolute",
            width: srcSize.w * k * s,
            height: srcSize.h * k * s,
            left: -cp.x * k * s,
            top: -cp.y * k * s,
          },
          PIXELATED,
        ]}
        resizeMode="stretch"
        fadeDuration={0}
      />
    );
  } else {
    inner = (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <PixelText text="?" color={UI_PALETTE.silver_dark} scale={s} />
      </View>
    );
  }

  return (
    <View style={[{ width: size * s, height: size * s }, style]}>
      <BakedImage name={`portrait_${size}` as "portrait_18"} scale={s} />
      <View
        style={{
          position: "absolute",
          left: inset.x * s,
          top: inset.y * s,
          width: wellW * s,
          height: wellH * s,
          overflow: "hidden",
        }}
      >
        {inner}
      </View>
    </View>
  );
}

export default Portrait;
