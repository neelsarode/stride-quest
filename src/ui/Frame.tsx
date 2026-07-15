// =============================================================================
// Frame — 3-slice baked chrome for anything whose length is dynamic (spec §5).
// Horizontal ('h'): left cap Image + a 1-art-px middle Image stretched across
// the span + right cap Image (bars, buttons, chips, plates, toasts, tooltips).
// Vertical ('v'): top cap + 1-art-px middle stretched + bottom cap at a fixed
// width (popover, modal). Speckles/glint live on the caps only — the stretch
// mid is horizontally/vertically uniform, so stretching a 1px strip is exact
// (theme UI_SLICES documents this fidelity contract).
//
// `children` overlay the frame (absolute fill) — Bar insets its fill Views this
// way, Button its engraved label, Popover/Modal their content.
// =============================================================================
import React from "react";
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { UI_ASSETS, type UiAssetKey } from "./uiMap";
import { UI_SLICES } from "./theme";
import { PIXELATED } from "./Baked";
import { useResolvedScale } from "./scale";

type HSliceKey =
  | "bar_full"
  | "bar_slim"
  | "btn_gold"
  | "btn_silver"
  | "plate_silver"
  | "banner_gold"
  | "chip_green"
  | "chip_red"
  | "chip_gold"
  | "toast_silver"
  | "tooltip_silver";
type VSliceKey = "popover_silver" | "modal_silver";

export type FrameSliceKey = HSliceKey | VSliceKey;

interface SliceDef {
  axis: "h" | "v";
  h?: number;
  w?: number;
  capW?: number;
  capH?: number;
  parts: readonly string[];
}

export interface FrameProps {
  slice: FrameSliceKey;
  /** Total length along the stretch axis (art px): width for 'h', height for 'v'. */
  length: number;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

function sliceImage(
  key: string,
  w: number,
  h: number,
  s: number,
): React.ReactNode {
  return (
    <Image
      source={UI_ASSETS[key as UiAssetKey]}
      style={[{ width: w * s, height: h * s }, PIXELATED]}
      resizeMode="stretch"
      fadeDuration={0}
    />
  );
}

export function Frame({ slice, length, scale, style, children }: FrameProps) {
  const s = useResolvedScale(scale);
  const def = UI_SLICES[slice] as unknown as SliceDef;
  const [a, b, c] = def.parts;

  if (def.axis === "h") {
    const h = def.h!;
    const capW = def.capW!;
    const midLen = Math.max(0, length - 2 * capW);
    return (
      <View
        style={[{ width: length * s, height: h * s, flexDirection: "row" }, style]}
      >
        {sliceImage(a, capW, h, s)}
        {sliceImage(b, midLen, h, s)}
        {sliceImage(c, capW, h, s)}
        {children != null && (
          <View style={StyleSheet.absoluteFill}>{children}</View>
        )}
      </View>
    );
  }

  // vertical
  const w = def.w!;
  const capH = def.capH!;
  const midLen = Math.max(0, length - 2 * capH);
  return (
    <View style={[{ width: w * s, height: length * s }, style]}>
      {sliceImage(a, w, capH, s)}
      {sliceImage(b, w, midLen, s)}
      {sliceImage(c, w, capH, s)}
      {children != null && (
        <View style={StyleSheet.absoluteFill}>{children}</View>
      )}
    </View>
  );
}

export default Frame;
