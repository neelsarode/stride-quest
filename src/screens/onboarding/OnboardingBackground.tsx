// =============================================================================
// OnboardingBackground — the shared battlefield backdrop for the pixel-skinned
// onboarding beats (the comp's battlefield_beach + a dark scrim). RN has no CSS
// gradient, so the scrim is a stack of translucent bands darkening toward the
// bottom (same cheap trick as the game screen's TopBar Scrim): the sky/castle
// reads up top, pixel text stays legible in the middle, and the footer grounds
// in the dark below. Every beat wraps its content in this so the flow is one
// coherent scene.
// =============================================================================
import React from "react";
import {
  ImageBackground,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";
import { ART_SCALE_BREAKPOINT_DP } from "../../config/assets";

const BG = require("../../../assets/backgrounds/battlefield_beach.png");
const BANDS = 10;

/** Shared onboarding layout: the art→dp scale (2 phone / 3 tablet-desktop, the
 *  same 430dp rule the game screen uses) + safe-area insets. */
export function useOnbLayout(): {
  artScale: 2 | 3;
  insets: EdgeInsets;
  width: number;
} {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return { artScale: width < ART_SCALE_BREAKPOINT_DP ? 2 : 3, insets, width };
}

export function OnboardingBackground({
  children,
  /** Base darkening at the very top (bottom always reaches ~0.9). Beats with a
   *  lot of chrome (panels, grids) pass a higher floor for legibility. */
  topDim = 0.36,
}: {
  children: React.ReactNode;
  topDim?: number;
}) {
  return (
    <View style={styles.root}>
      <ImageBackground source={BG} resizeMode="cover" style={styles.bg}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {Array.from({ length: BANDS }).map((_, i) => {
            const t = i / (BANDS - 1); // 0 (top) → 1 (bottom)
            const a = (topDim + (0.92 - topDim) * t).toFixed(3);
            return (
              <View key={i} style={{ flex: 1, backgroundColor: `rgba(7,9,14,${a})` }} />
            );
          })}
        </View>
        <View style={styles.content}>{children}</View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0d13" },
  bg: { flex: 1 },
  content: { flex: 1 },
});

export default OnboardingBackground;
