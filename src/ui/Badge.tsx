// =============================================================================
// Badge — the silver job-level roundel (baked badge_silver 18×19; the extra art
// px is the kit's drop-shadow row) with an engraved number centred over the
// 18×18 face (kit hifiBadge engraves at y+7).
// =============================================================================
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { BakedImage, artDims } from "./Baked";
import { PixelText, measurePixelText } from "./PixelText";
import { UI_PALETTE } from "./theme";
import { useResolvedScale } from "./scale";

const ENGRAVE_TOP = 7; // kit hifiBadge label y-offset (art px)

export interface BadgeProps {
  label: string;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, scale, style }: BadgeProps) {
  const s = useResolvedScale(scale);
  const d = artDims("badge_silver");
  const textW = measurePixelText(label);

  return (
    <View style={[{ width: d.w * s, height: d.h * s }, style]}>
      <BakedImage name="badge_silver" scale={s} />
      <View
        style={{
          position: "absolute",
          left: Math.round((18 - textW) / 2) * s,
          top: ENGRAVE_TOP * s,
        }}
      >
        <PixelText
          text={label}
          variant="engraved"
          color={UI_PALETTE.outline}
          rimColor={UI_PALETTE.silver_rim}
          scale={s}
        />
      </View>
    </View>
  );
}

export default Badge;
