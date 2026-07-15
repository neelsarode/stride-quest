// =============================================================================
// Beacon — the rally ring that pulses on a resting teammate (spec §5). Three
// baked brightness rings (beacon_dim/mid/bright, gold4/gold2/gold1) cycled by
// the kit's BEACON_SEQ on a Reanimated frame clock: the beat index advances on
// a shared value and each ring's opacity is derived from it, so the pulse runs
// with ZERO React re-renders. Ported 1:1 from battlefield-ui.html:613.
// =============================================================================
import React, { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { UI_ASSETS } from "./uiMap";
import { PIXELATED } from "./Baked";
import { useResolvedScale } from "./scale";

// 16 beats @ 10fps (100ms/beat): rest → swell → 500ms hold → fade → rest.
// 0 hidden · 1 dim (gold4) · 2 mid (gold2) · 3 bright (gold1).
const BEACON_SEQ = [0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 2, 1, 0] as const;
const BEATS = BEACON_SEQ.length;
const BEAT_MS = 100;
const SIZE = 20; // beacon art px

export interface BeaconProps {
  /** Only resting mates rally — false hides the ring and stops the clock. */
  active?: boolean;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function Beacon({ active = true, scale, style }: BeaconProps) {
  const s = useResolvedScale(scale);
  const beat = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(beat);
      beat.value = 0;
      return;
    }
    beat.value = 0;
    beat.value = withRepeat(
      withTiming(BEATS, { duration: BEATS * BEAT_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(beat);
  }, [active, beat]);

  const dim = useAnimatedStyle(() => {
    const i = Math.floor(beat.value) % BEATS;
    return { opacity: BEACON_SEQ[i] === 1 ? 1 : 0 };
  }, [beat]);
  const mid = useAnimatedStyle(() => {
    const i = Math.floor(beat.value) % BEATS;
    return { opacity: BEACON_SEQ[i] === 2 ? 1 : 0 };
  }, [beat]);
  const bright = useAnimatedStyle(() => {
    const i = Math.floor(beat.value) % BEATS;
    return { opacity: BEACON_SEQ[i] === 3 ? 1 : 0 };
  }, [beat]);

  if (!active) return null;

  const ring = { position: "absolute" as const, width: SIZE * s, height: SIZE * s };
  return (
    <View style={[{ width: SIZE * s, height: SIZE * s }, style]}>
      <Animated.Image
        source={UI_ASSETS.beacon_dim}
        style={[ring, PIXELATED, dim]}
        resizeMode="stretch"
        fadeDuration={0}
      />
      <Animated.Image
        source={UI_ASSETS.beacon_mid}
        style={[ring, PIXELATED, mid]}
        resizeMode="stretch"
        fadeDuration={0}
      />
      <Animated.Image
        source={UI_ASSETS.beacon_bright}
        style={[ring, PIXELATED, bright]}
        resizeMode="stretch"
        fadeDuration={0}
      />
    </View>
  );
}

export default Beacon;
