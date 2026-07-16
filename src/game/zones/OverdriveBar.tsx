// =============================================================================
// OverdriveBar — GameScreen overdrive zone (slim status strip above the dock).
// =============================================================================
// Core Loop v2 (spec §5.4/§9, STR-79) RETRIGGERED Overdrive: there is no charge
// meter, no ACTIVATE button, no activate-countdown — hitting the daily step goal
// AUTO-arms Overdrive X2 until the daily reset. This zone is now a purely PASSIVE
// status strip (non-interactive — no Pressable/activate path survives) with two
// states read off `data.overdrive` = {active, mult, endsAt, remainingSeconds,
// stepsToday, goal}:
//   • inactive → a CALM slim gauge filling toward the goal (stepsToday/goal, the
//     SAME fraction the dock's steps ring shows), captioned with the aspirational
//     "WALK TO YOUR GOAL FOR OVERDRIVE X2". Never red/punishing (guardrail §3).
//   • active → a CELEBRATORY full purple gauge "OVERDRIVE X2", glowing + breathing,
//     captioned "UNTIL RESET" (or a compact "NH TO RESET" from remainingSeconds).
//     The reset is framed as bonus time you HAVE, never a loss/countdown.
//
// The fill + glow ride Reanimated shared values (ODGauge) so the strip animates
// with ZERO per-frame React re-renders (spec §12) — it re-renders only when the
// reactive snapshot's frac/label/active actually change.
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

  const outer = [
    zoneStyles.zone,
    zoneStyles.centeredRow,
    { bottom: bottomPad + GAME_ZONES.overdriveBottom },
  ];
  if (!od) return <View testID="zone-overdrive" style={outer} />;

  const active = od.active;
  const mult = od.mult;
  // Fill mirrors the dock's steps ring: progress toward the goal that arms
  // Overdrive; full (celebratory) while armed.
  const frac = active
    ? 1
    : Math.max(0, Math.min(1, od.goal > 0 ? od.stepsToday / od.goal : 0));
  // On-bar label: the celebratory identity while armed; the numeric goal
  // progress (byte-identical to the dock ring's today/goal) while walking to it.
  const label = active
    ? `OVERDRIVE X${mult}`
    : `${od.stepsToday.toLocaleString()}/${od.goal.toLocaleString()}`;
  // Sub-caption. Active: "UNTIL RESET" — or a compact "NH TO RESET" when the
  // remaining window rounds to a clean hour (the font has no "×"/"·"; multipliers
  // are "X", so no dot separator). It's framed as bonus time you STILL HAVE, never
  // a loss/countdown (guardrail §3). Inactive: calm + aspirational.
  const hoursToReset =
    od.remainingSeconds != null
      ? Math.max(1, Math.ceil(od.remainingSeconds / 3600))
      : null;
  const hint = active
    ? hoursToReset != null
      ? `${hoursToReset}H TO RESET`
      : "UNTIL RESET"
    : `WALK TO YOUR GOAL FOR OVERDRIVE X${mult}`;

  const width = DOCK.overdriveBarWidth;

  return (
    <View testID="zone-overdrive" style={outer}>
      <UIScaleProvider value={s}>
        <View style={{ alignItems: "center" }}>
          <ODGauge s={s} width={width} frac={frac} label={label} muted={!active} glow={active} />
          <PixelText
            text={hint}
            color={active ? OD_LIGHT : PALETTE.textDim}
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
