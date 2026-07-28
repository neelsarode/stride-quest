// =============================================================================
// Ring — the daily steps ring (spec §5). The kit's drawPixelRing is baked as a
// 33-frame strip (0/32 … 32/32); we pick a cell exactly like Sprite.tsx (a
// fixed frame window + the whole strip translated left by −frameIndex·frameW),
// with frameIndex derived on the UI thread from a shared value → the ring sweeps
// with ZERO React re-renders. The 33-state stair-stepping IS the aesthetic.
//
// Drive: pass `value` (0..1) and it eases to it; OR pass an external `progress`
// SharedValue to drive it directly (gallery flat-render proof).
// =============================================================================
import React, { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { uiAsset } from "./uiMap";
import { UI_SLICES } from "./theme";
import { PIXELATED } from "./Baked";
import { useResolvedScale } from "./scale";
import { useUITheme } from "./theme-context";

const RING = UI_SLICES.steps_ring; // { frames:33, frameW:30, frameH:30 }
const SWEEP_MS = 420;

export interface RingProps {
  /** Fill fraction 0..1 (ignored when `progress` supplied). */
  value?: number;
  progress?: SharedValue<number>;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function Ring({ value = 0, progress, scale, style }: RingProps) {
  const s = useResolvedScale(scale);
  const { classKey } = useUITheme(); // ring track = the class well (varies per kit)
  const own = useSharedValue(Math.max(0, Math.min(1, value)));
  const frac = progress ?? own;
  const { frames, frameW, frameH } = RING;

  useEffect(() => {
    if (progress) return;
    own.value = withTiming(Math.max(0, Math.min(1, value)), {
      duration: SWEEP_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, progress, own]);

  const stripStyle = useAnimatedStyle(() => {
    const f = frac.value < 0 ? 0 : frac.value > 1 ? 1 : frac.value;
    const idx = Math.round(f * (frames - 1));
    return { transform: [{ translateX: -idx * frameW * s }] };
  }, [frac, frames, frameW, s]);

  return (
    <View
      style={[
        { width: frameW * s, height: frameH * s, overflow: "hidden" },
        style,
      ]}
    >
      <Animated.Image
        source={uiAsset(classKey, "steps_ring")}
        style={[
          { width: frames * frameW * s, height: frameH * s },
          PIXELATED,
          stripStyle,
        ]}
        resizeMode="stretch"
        fadeDuration={0}
      />
    </View>
  );
}

export default Ring;
