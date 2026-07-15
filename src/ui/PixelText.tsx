// =============================================================================
// PixelText — the kit's bitmap font in RN (spec §4, D3). One clipped Image per
// glyph, the whole atlas translated left by −x so exactly that glyph shows
// through its window — the exact Sprite.tsx strip technique, but STATIC (no
// Reanimated: a label's glyph offsets never change), so a mounted label costs
// zero per-frame work and re-renders only when its own text/color/scale change.
//
// Atlases + metrics are GENERATED (theme.ts FONT_METRICS, uiMap font_white /
// font_white_outlined). The FONT has no lowercase — everything is toUpperCase'd,
// carrying the kit convention (assets/ui-kit.js drawText).
//
// Variants:
//   plain     — white atlas, `tintColor` colours it (spike-proven mask twin).
//   outlined  — the font_white_outlined atlas: glyph + baked 1px dark outline,
//               rendered AS-IS (two-tone, never tinted → readable on any fill).
//               The cell is inset by pad=1 and drawn at (cursor−pad) so the
//               outline overlaps the letter-spacing gap → identical advance.
//   engraved  — two stacked white-atlas copies (kit engrave()): rim-light copy
//               offset +1 art px DOWN (a lit ledge), the ink colour ON TOP.
// =============================================================================
import React, { useMemo } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { UI_ASSETS } from "./uiMap";
import { FONT_METRICS, UI_DIMS, UI_PALETTE, type FontAtlasMetrics } from "./theme";
import { PIXELATED } from "./Baked";
import { useResolvedScale } from "./scale";

export type PixelTextVariant = "plain" | "outlined" | "engraved";

// Which baked atlas each variant samples (engraved reuses the white atlas twice).
const ATLAS: Record<PixelTextVariant, "font_white" | "font_white_outlined"> = {
  plain: "font_white",
  outlined: "font_white_outlined",
  engraved: "font_white",
};

function metricsFor(variant: PixelTextVariant): FontAtlasMetrics {
  return variant === "outlined" ? FONT_METRICS.outlined : FONT_METRICS.white;
}

interface Glyph {
  atlasX: number; // left of the glyph cell within the atlas (art px)
  cellW: number; // cell width incl. any outline pad (art px)
  drawX: number; // where the cell's left sits along the baseline (art px)
}

interface Layout {
  glyphs: Glyph[];
  width: number; // advance width (art px), trailing letter-spacing dropped
  lineHeight: number; // atlas cell height (art px)
}

function layoutText(text: string, variant: PixelTextVariant): Layout {
  const m = metricsFor(variant);
  const glyphs: Glyph[] = [];
  let cursor = 0;
  for (const ch of text.toUpperCase()) {
    const g = m.glyphs[ch] ?? m.glyphs["?"] ?? m.glyphs["."];
    const inkW = g.w - 2 * m.pad; // visible ink width (== white-atlas width)
    glyphs.push({ atlasX: g.x, cellW: g.w, drawX: cursor - m.pad });
    cursor += inkW + m.letterSpacing;
  }
  return {
    glyphs,
    width: Math.max(0, cursor - m.letterSpacing),
    lineHeight: m.lineHeight,
  };
}

/** Advance width of `text` in ART px (callers ×scale for dp) — used to size
 *  3-slice chips/buttons/popovers and to centre labels. */
export function measurePixelText(
  text: string,
  variant: PixelTextVariant = "plain",
): number {
  return layoutText(text, variant).width;
}

// One horizontal run of clipped glyph windows, tinted a single colour.
function GlyphRow({
  glyphs,
  atlasKey,
  atlasW,
  lineHeight,
  scale,
  tint,
  top,
}: {
  glyphs: Glyph[];
  atlasKey: "font_white" | "font_white_outlined";
  atlasW: number;
  lineHeight: number;
  scale: number;
  tint?: string;
  top: number;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        top: top * scale,
        height: lineHeight * scale,
      }}
    >
      {glyphs.map((g, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: g.drawX * scale,
            top: 0,
            width: g.cellW * scale,
            height: lineHeight * scale,
            overflow: "hidden",
          }}
        >
          <Image
            source={UI_ASSETS[atlasKey]}
            style={[
              {
                width: atlasW * scale,
                height: lineHeight * scale,
                transform: [{ translateX: -g.atlasX * scale }],
              },
              tint != null ? { tintColor: tint } : null,
              PIXELATED,
            ]}
            resizeMode="stretch"
            fadeDuration={0}
          />
        </View>
      ))}
    </View>
  );
}

export interface PixelTextProps {
  text: string;
  /** Ink colour (plain: the tint; engraved: the top/dark colour). Ignored by
   *  `outlined` (that atlas is baked two-tone). Default = kit white. */
  color?: string;
  /** Engraved only: the lit ledge colour beneath the ink. Default silver rim. */
  rimColor?: string;
  variant?: PixelTextVariant;
  /** Override the context art scale. */
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

// Memoised on all props — a static label mounts once and never re-renders.
export const PixelText = React.memo(function PixelText({
  text,
  color,
  rimColor,
  variant = "plain",
  scale,
  style,
}: PixelTextProps) {
  const s = useResolvedScale(scale);
  const { glyphs, width, lineHeight } = useMemo(
    () => layoutText(text, variant),
    [text, variant],
  );
  const atlasKey = ATLAS[variant];
  const atlasW = UI_DIMS[atlasKey].w;
  const ink = color ?? UI_PALETTE.white;
  const totalH = variant === "engraved" ? lineHeight + 1 : lineHeight;

  return (
    <View style={[{ width: width * s, height: totalH * s }, style]}>
      {variant === "engraved" && (
        // rim-light ledge, one art px lower (kit engrave: drawText at y+scale).
        <GlyphRow
          glyphs={glyphs}
          atlasKey="font_white"
          atlasW={atlasW}
          lineHeight={lineHeight}
          scale={s}
          tint={rimColor ?? UI_PALETTE.silver_rim}
          top={1}
        />
      )}
      <GlyphRow
        glyphs={glyphs}
        atlasKey={atlasKey}
        atlasW={atlasW}
        lineHeight={lineHeight}
        scale={s}
        // outlined renders the two-tone atlas verbatim (no tint).
        tint={variant === "outlined" ? undefined : ink}
        top={0}
      />
    </View>
  );
});

export default PixelText;
