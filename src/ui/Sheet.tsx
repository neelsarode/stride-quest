// =============================================================================
// Sheet — a slide-up detail panel (guild board, stats). Plain RN animated View:
// a scrim (tap-to-close) + a bottom panel that springs up on translateY (spec
// §7 — no navigation library, there is one screen). Screen-agnostic chrome: a
// midnight well with a silver top edge + grabber; content is the caller's.
//
// Renders an absolute-fill overlay over the nearest positioned ancestor (root
// on the real screen; a demo stage in the gallery). Parent owns `visible`;
// entrance is animated, close is immediate on scrim/handle tap.
// =============================================================================
import React, { useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SCRIM, UI_PALETTE } from "./theme";
import { useResolvedScale } from "./scale";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  /** Panel height in dp (default 42% of the window). */
  height?: number;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function Sheet({
  visible,
  onClose,
  children,
  height,
  scale,
  style,
}: SheetProps) {
  const s = useResolvedScale(scale);
  const win = useWindowDimensions();
  const panelH = height ?? Math.round(win.height * 0.42);
  const ty = useSharedValue(panelH);
  const scrimO = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Near-critical spring — a gentle settle with almost no overshoot (the
      // old damping:18 overshot hard on a full-panel slide; toned down ~90%).
      ty.value = withSpring(0, { damping: 26, stiffness: 200 });
      scrimO.value = withTiming(1, { duration: 180 });
    }
  }, [visible, ty, scrimO, panelH]);

  const panelStyle = useAnimatedStyle(
    () => ({ transform: [{ translateY: ty.value }] }),
    [ty],
  );
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimO.value }), [scrimO]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: SCRIM.modal },
          scrimStyle,
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: panelH,
            backgroundColor: UI_PALETTE.night_w,
            borderTopLeftRadius: 4 * s,
            borderTopRightRadius: 4 * s,
            borderTopWidth: s,
            borderColor: UI_PALETTE.silver_rim,
            paddingTop: 6 * s,
            paddingHorizontal: 6 * s,
          },
          panelStyle,
          style,
        ]}
      >
        {/* grabber */}
        <Pressable onPress={onClose} style={{ alignItems: "center", paddingBottom: 5 * s }}>
          <View
            style={{
              width: 24 * s,
              height: 2 * s,
              borderRadius: s,
              backgroundColor: UI_PALETTE.silver_dark,
            }}
          />
        </Pressable>
        {children}
      </Animated.View>
    </View>
  );
}

export default Sheet;
