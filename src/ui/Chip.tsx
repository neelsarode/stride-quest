// =============================================================================
// Chip — a small rounded pill (3-slice chip_green/chip_red/chip_gold, h=10) with
// centred PixelText. Kit hifiChip draws the label in the material outline colour
// (dark ink on the bright gradient face). Width fits the text + 5 art px pad
// each side (kit convention), floored to the min 3-slice span.
// =============================================================================
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Frame, type FrameSliceKey } from "./Frame";
import { PixelText, measurePixelText } from "./PixelText";
import { UI_PALETTE } from "./theme";
import { useResolvedScale } from "./scale";

export type ChipColor = "green" | "red" | "gold";

const SLICE: Record<ChipColor, FrameSliceKey> = {
  green: "chip_green",
  red: "chip_red",
  gold: "chip_gold",
};
const CHIP_H = 10;
const CAP_W = 7; // chip_* capW → min length = 2*capW + 1
const PAD = 5; // art px each side of the label (kit hifiChip)

export interface ChipProps {
  label: string;
  color?: ChipColor;
  /** Ink colour; default = kit dark outline. */
  textColor?: string;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  color = "green",
  textColor,
  scale,
  style,
}: ChipProps) {
  const s = useResolvedScale(scale);
  const textW = measurePixelText(label);
  const length = Math.max(2 * CAP_W + 1, textW + 2 * PAD);

  return (
    <View style={[{ width: length * s, height: CHIP_H * s }, style]}>
      <Frame slice={SLICE[color]} length={length} scale={s} />
      <View
        style={{
          position: "absolute",
          left: Math.round((length - textW) / 2) * s,
          top: Math.round((CHIP_H - 5) / 2) * s,
        }}
      >
        <PixelText
          text={label}
          color={textColor ?? UI_PALETTE.outline}
          scale={s}
        />
      </View>
    </View>
  );
}

export default Chip;
