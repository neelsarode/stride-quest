// =============================================================================
// useGameLayout — the game screen's scale + safe-area system (STR-66, spec §6).
//
// One hook that resolves the two device-dependent constants every HUD zone
// needs: the ART_SCALE (2 dp/art-px on phones, 3 on tablet/desktop web) and the
// safe-area-padded top/bottom insets. Zones position themselves against topPad
// / bottomPad + the GAME_ZONES offset table so nothing ever collides with the
// notch or home indicator.
//
// NATIVE NOTE: react-native-safe-area-context is a native module — iOS needs
// ONE native rebuild (`npx expo run:ios`, the STR-24 loop) before insets read
// true device values there. On web (our dev/verify loop) it works with no
// rebuild; desktop web reports zero insets, so topPad/bottomPad fall back to
// their max(14, …) / max(12, …) floors.
// =============================================================================
import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";
import { ART_SCALE_BREAKPOINT_DP } from "../config/assets";

export interface GameLayout {
  /** 1 art px = artScale dp (spec §6). 2 on phones, 3 at/above the breakpoint. */
  artScale: 2 | 3;
  /** Raw safe-area insets (0s on desktop web / before the iOS native rebuild). */
  insets: EdgeInsets;
  /** Top zone origin: never tighter than 14 dp even with no notch. */
  topPad: number;
  /** Bottom zone origin: never tighter than 12 dp even with no home indicator. */
  bottomPad: number;
  /** Current window size (dp) — the breakpoint input, handy for zone math. */
  width: number;
  height: number;
}

export function useGameLayout(): GameLayout {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo<GameLayout>(
    () => ({
      // 2× below the breakpoint (all iPhones, ≤440dp portrait), 3× at/above it
      // (tablets / wide desktop web). The boundary itself lands on 3×.
      artScale: width < ART_SCALE_BREAKPOINT_DP ? 2 : 3,
      insets,
      topPad: Math.max(14, insets.top),
      bottomPad: Math.max(12, insets.bottom),
      width,
      height,
    }),
    // useSafeAreaInsets returns a memoized, stable object (context value), so
    // depending on it directly is both correct and lint-clean.
    [width, height, insets],
  );
}
