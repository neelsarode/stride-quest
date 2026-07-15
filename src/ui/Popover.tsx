// =============================================================================
// Popover — the small attached panel (party-member stats + SEND RALLY, invite
// code). Baked popover_silver vertical 3-slice (fixed 132 art px wide, any
// height) + a pointer arrow toward its anchor (spec §5, kit hifiPopover). The
// caller positions the whole thing next to its anchor; content lives in the
// 3-art-px-inset well. Optional `onClose` adds a tap-outside scrim.
// =============================================================================
import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Frame } from "./Frame";
import { BakedImage, artDims } from "./Baked";
import { WELL_INSETS } from "./theme";
import { useResolvedScale } from "./scale";

const WIDTH = 132; // popover_silver fixed width (art px)
const INSET = WELL_INSETS.slim; // hifiFrameSlim 3px frame → well inset

export type PopoverSide = "top" | "left";

export interface PopoverProps {
  /** Panel height in ART px. */
  height: number;
  side?: PopoverSide;
  /** Arrow centre offset along the anchored edge (art px from the corner). */
  arrowOffset?: number;
  children?: React.ReactNode;
  /** Adds a full-screen tap-to-close scrim behind the panel. */
  onClose?: () => void;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function Popover({
  height,
  side = "top",
  arrowOffset = 15,
  children,
  onClose,
  scale,
  style,
}: PopoverProps) {
  const s = useResolvedScale(scale);
  const arrowName = side === "top" ? "popover_arrow_top" : "popover_arrow_left";
  const arrow = artDims(arrowName);

  const arrowStyle: ViewStyle =
    side === "top"
      ? {
          position: "absolute",
          top: -arrow.h * s,
          left: (arrowOffset - Math.floor(arrow.w / 2)) * s,
        }
      : {
          position: "absolute",
          left: -arrow.w * s,
          top: (arrowOffset - Math.floor(arrow.h / 2)) * s,
        };

  const panel = (
    <View style={[{ width: WIDTH * s, height: height * s }, style]}>
      <Frame slice="popover_silver" length={height} scale={s} />
      <View style={arrowStyle}>
        <BakedImage name={arrowName} scale={s} />
      </View>
      <View
        style={{
          position: "absolute",
          left: INSET.x * s,
          top: INSET.y * s,
          width: (WIDTH - INSET.dw) * s,
          height: (height - INSET.dh) * s,
        }}
      >
        {children}
      </View>
    </View>
  );

  if (onClose) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {panel}
      </View>
    );
  }
  return panel;
}

export default Popover;
