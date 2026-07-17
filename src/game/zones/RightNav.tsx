// =============================================================================
// RightNav — GameScreen right nav column (STR-69). Three silver 18-art nav
// buttons (emblems baked / drawn on the face) that open the slide-up sheets and
// the help modal via the ../Overlays store: guild banner → GuildSheet, bar chart
// → StatsSheet, "?" → help modal. Ported from battlefield-ui's right-nav column.
// =============================================================================
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button, UIScaleProvider } from "../../ui";
import { BakedImage } from "../../ui/Baked";
import { UI_PALETTE } from "../../ui/theme";
import { GAME_ZONES } from "../../config/assets";
import { DEV_FLAGS } from "../../devConfig";
import { isAvailable as healthKitAvailable } from "../../health/healthkit";
import { useGameLayout } from "../useGameLayout";
import { openGuild, openHealth, openHelp, openStats } from "../Overlays";
import { zoneStyles } from "./zoneStyle";

export function RightNav() {
  const { topPad, artScale } = useGameLayout();
  const data = useQuery(api.game.dashboard, {});
  // CONNECT HEALTH rides here as a 4th button — ONLY while HealthKit is capable
  // (or the dev preview flag) AND the user hasn't connected yet. Same gate the
  // TopBar chip used before it moved here; the red dot + pulse make it a gentle
  // "one thing left to set up" nudge.
  const showHealth =
    (healthKitAvailable() || DEV_FLAGS.forceHealthBeat) &&
    data != null &&
    !data.health.connected;

  return (
    <View
      testID="zone-right-nav"
      style={[
        zoneStyles.zone,
        { top: topPad + GAME_ZONES.rightNavTop, right: GAME_ZONES.rightNavRight },
      ]}
    >
      <UIScaleProvider value={artScale}>
        <View style={{ gap: Math.round(4.5 * artScale) }}>
          <Button asset="btn_nav_silver" onPress={openGuild} scale={artScale}>
            <BakedImage name="icon_banner" scale={artScale} />
          </Button>
          <Button asset="btn_nav_silver" onPress={openStats} scale={artScale}>
            <ChartGlyph scale={artScale} />
          </Button>
          <Button
            asset="btn_nav_silver"
            label="?"
            labelScale={2}
            onPress={openHelp}
            scale={artScale}
          />
          {showHealth && <HealthNavButton scale={artScale} />}
        </View>
      </UIScaleProvider>
    </View>
  );
}

// -----------------------------------------------------------------------------
// HealthNavButton — the 4th nav button, shown only while health is unconnected.
// A heart on the silver nav face with a red notification dot, wrapped in a slow
// fading opacity pulse (Reanimated on the UI thread → no per-frame re-render) so
// the eye is drawn to the one remaining setup step. Tapping opens the (Overlays-
// hosted) HealthPermissionScreen; connecting removes the button (the gate flips).
// -----------------------------------------------------------------------------
function HealthNavButton({ scale }: { scale: number }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }), [pulse]);

  const dot = Math.max(6, 5 * scale);
  return (
    <View>
      <Animated.View style={pulseStyle}>
        <Button asset="btn_nav_silver" onPress={openHealth} scale={scale}>
          <BakedImage name="icon_heart" scale={scale} />
        </Button>
      </Animated.View>
      {/* Solid red notification dot (does NOT fade with the pulse, so it always
          reads as an unresolved alert) riding the top-right corner. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -2,
          right: -2,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: "#ff4d4d",
          borderWidth: 1,
          borderColor: UI_PALETTE.outline,
        }}
      />
    </View>
  );
}

// A 3-bar chart emblem (stats) — battlefield-ui's chartDraw: three outlined
// bars of heights 5 / 10 / 7 art px, the middle one gold, bottoms aligned.
function ChartGlyph({ scale }: { scale: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 10 * scale }}>
      <ChartBar h={5} color={UI_PALETTE.silver_rim} scale={scale} />
      <ChartBar h={10} color={UI_PALETTE.gold_mid} scale={scale} />
      <ChartBar h={7} color={UI_PALETTE.silver_rim} scale={scale} />
    </View>
  );
}

function ChartBar({ h, color, scale }: { h: number; color: string; scale: number }) {
  return (
    <View
      style={{
        width: 4 * scale,
        height: h * scale,
        backgroundColor: UI_PALETTE.outline,
        justifyContent: "flex-start",
        alignItems: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          left: 1 * scale,
          top: 1 * scale,
          width: 2 * scale,
          height: (h - 2) * scale,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
