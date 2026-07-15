// =============================================================================
// OverdriveBar — GameScreen overdrive zone (slim status strip above the dock).
// =============================================================================
// Core Loop v2 (spec §5.4, STR-74) RETRIGGERED Overdrive: no more charge meter
// or ACTIVATE button — hitting the daily step goal auto-arms Overdrive ×2 until
// the daily reset. This is a MINIMAL, valid strip only: active → "×2 OVERDRIVE"
// with a filled bar; inactive → stepsToday/goal progress toward the goal that
// arms it.
//
// STR-79 will redesign this into the polished status strip (the goal-progress
// gauge + the "OVERDRIVE ×2 · UNTIL RESET" celebratory state). Do NOT invest in
// polish here — just keep it compiling on the new dashboard payload shape.
// =============================================================================
import React, { useEffect } from "react";
import { Platform, View } from "react-native";
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
import { DOCK, GAME_ZONES, PALETTE } from "../../config/assets";
import { Frame, PixelText, UIScaleProvider, measurePixelText } from "../../ui";
import { WELL_INSETS } from "../../ui/theme";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

const BAR_H = 14; // bar_slim frame height (art px)
const OD_MID = PALETTE.overdrive; // loud purple
const OD_LIGHT = "#e6c9ff"; // lit top row
const OD_DIM = "#5a4a72"; // charging/resting muted purple

export function OverdriveBar() {
  const { bottomPad, artScale: s } = useGameLayout();
  const data = useQuery(api.game.dashboard, {});

  const od = data?.overdrive;
  const active = od?.active ?? false;

  const outer = [
    zoneStyles.zone,
    zoneStyles.centeredRow,
    { bottom: bottomPad + GAME_ZONES.overdriveBottom },
  ];
  if (!od) return <View testID="zone-overdrive" style={outer} />;

  // New goal-driven read model (Core Loop v2): fill toward the goal, or full
  // while armed. STR-79 owns the real visual design.
  const mult = od.mult;
  const frac = active
    ? 1
    : Math.max(0, Math.min(1, od.goal > 0 ? od.stepsToday / od.goal : 0));
  const label = active
    ? `X${mult} OVERDRIVE`
    : `${od.stepsToday.toLocaleString()}/${od.goal.toLocaleString()}`;
  const hint = active
    ? `X${mult} DAMAGE UNTIL RESET`
    : `WALK TO YOUR GOAL FOR OVERDRIVE X${mult}`;

  const width = DOCK.overdriveBarWidth;

  return (
    <View testID="zone-overdrive" style={outer}>
      <UIScaleProvider value={s}>
        <View style={{ alignItems: "center" }}>
          <ODGauge s={s} width={width} frac={frac} label={label} muted={!active} glow={active} />
          <PixelText
            text={hint}
            color={PALETTE.textDim}
            scale={s}
            style={{ marginTop: 3 * s }}
          />
        </View>
      </UIScaleProvider>
    </View>
  );
}

// The slim purple gauge: baked bar_slim frame + a Reanimated fill inset in the
// well (spec §5 well math, WELL_INSETS.slim) + an outlined centred label. When
// `glow`, a soft purple bloom (web box-shadow / iOS shadow) + a breathe pulse
// makes the active state alive without any per-frame re-render.
function ODGauge({
  s,
  width,
  frac,
  label,
  muted,
  glow,
}: {
  s: number;
  width: number;
  frac: number;
  label: string;
  muted: boolean;
  glow: boolean;
}) {
  const inset = WELL_INSETS.slim;
  const wellW = width - inset.dw;
  const wellH = BAR_H - inset.dh;

  const fill = useSharedValue(frac);
  useEffect(() => {
    fill.value = withTiming(frac, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [frac, fill]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }), [fill]);

  const pulse = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(pulse);
    if (!glow) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(DOCK.activatePulseScale, {
        duration: DOCK.activatePulseMs,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [glow, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }), [pulse]);

  const labelW = measurePixelText(label, "outlined");
  const shadow =
    glow && Platform.OS === "web"
      ? ({ boxShadow: `0 0 10px ${OD_MID}, 0 0 20px ${OD_MID}` } as object)
      : glow
        ? { shadowColor: OD_MID, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }
        : null;

  return (
    <Animated.View style={[{ width: width * s, height: BAR_H * s }, shadow, pulseStyle]}>
      <Frame slice="bar_slim" length={width} scale={s} />
      <View
        style={{
          position: "absolute",
          left: inset.x * s,
          top: inset.y * s,
          width: wellW * s,
          height: wellH * s,
          borderRadius: inset.radius * s,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            { position: "absolute", left: 0, top: 0, width: wellW * s, height: wellH * s, transformOrigin: "left" },
            fillStyle,
          ]}
        >
          <View
            style={{ position: "absolute", left: 0, right: 0, top: 0, height: s, backgroundColor: OD_LIGHT }}
          />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: s,
              bottom: 0,
              backgroundColor: muted ? OD_DIM : OD_MID,
            }}
          />
        </Animated.View>
      </View>
      <View
        style={{
          position: "absolute",
          left: Math.round((width - labelW) / 2) * s,
          top: (inset.y + Math.round((wellH - 7) / 2)) * s,
        }}
      >
        <PixelText text={label} variant="outlined" scale={s} />
      </View>
    </Animated.View>
  );
}
