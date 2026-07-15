// =============================================================================
// OverdriveBar — GameScreen overdrive zone (slim charge bar above the dock).
// STR-68. Re-skins OverdriveMeter onto baked chrome: the charge bar fills from
// steps past the daily goal, glows into an ACTIVATE at 100%, then shows a live
// countdown while active. Gating is reused verbatim — a charged bar is disabled
// (calm copy, never red) while the hero is Resting, and a server rejection
// surfaces as a friendly toast (the exact useGameEngine.onActivateOverdrive
// behaviour).
//
// The slim bar is built by hand rather than via the <Bar> primitive because the
// baked UI_FILLS palette has no purple family (S8 CELESTIAL SILVER bakes
// gold/sky/green/yellow/red) — overdrive is the one loud-purple beat (PALETTE.
// overdrive). The fill still rides a Reanimated shared value so it moves with
// ZERO per-frame React re-renders (spec §12); only the well chrome differs from
// <Bar>. Data/actions mirror the effect-free parts of useGameEngine (see
// CommandDock's note on why zones don't call the hook itself).
// =============================================================================
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { DOCK, GAME_ZONES, PALETTE } from "../../config/assets";
import { friendlyError } from "../../feedback/errors";
import { useFeedback } from "../../feedback/FeedbackProvider";
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
  const { emit } = useFeedback();
  const activateMut = useMutation(api.overdrive.activateOverdrive);
  const [busy, setBusy] = useState(false);

  const od = data?.overdrive;
  const active = od?.active ?? false;
  const remainingSeconds = od?.remainingSeconds ?? 0;

  // Live countdown: anchor the server's remainingSeconds to arrival, tick down
  // locally for display (the server recomputes on every snapshot) — the exact
  // OverdriveMeter mechanism.
  const anchor = useRef({ secs: remainingSeconds, at: Date.now() });
  const [left, setLeft] = useState(remainingSeconds);
  useEffect(() => {
    anchor.current = { secs: remainingSeconds, at: Date.now() };
    setLeft(remainingSeconds);
  }, [remainingSeconds]);
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => {
      const a = anchor.current;
      setLeft(Math.max(0, a.secs - Math.round((Date.now() - a.at) / 1000)));
    }, 1000);
    return () => clearInterval(h);
  }, [active]);

  // Mirrors useGameEngine.onActivateOverdrive — success banner fires from the
  // reactive diff (useGameEvents on GameScreen), so only rejections emit here.
  async function onActivate() {
    setBusy(true);
    try {
      await activateMut({});
    } catch (e) {
      emit({ type: "actionRejected", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  const outer = [
    zoneStyles.zone,
    zoneStyles.centeredRow,
    { bottom: bottomPad + GAME_ZONES.overdriveBottom },
  ];
  if (!od) return <View testID="zone-overdrive" style={outer} />;

  const resting = data.fuel.state === "resting";
  const chargePct = od.chargePct;
  const ready = od.ready;
  const mult = od.idleDamageMult;
  const canActivate = ready && !active && !resting && !busy;
  const frac = active ? 1 : Math.max(0, Math.min(1, chargePct / 100));

  const label = active
    ? `X${mult} ${fmtCountdown(left)}`
    : ready
      ? "ACTIVATE"
      : `OVERDRIVE ${chargePct}%`;

  const hint = active
    ? `X${mult} DAMAGE FOR ${od.durationHours}H`
    : ready && resting
      ? "HERO RESTING - WALK FIRST"
      : ready
        ? null
        : "WALK PAST YOUR GOAL TO CHARGE";

  const width = DOCK.overdriveBarWidth;
  const glow = ready && !active; // the charged bar is the one that shouts

  const gauge = (
    <ODGauge s={s} width={width} frac={frac} label={label} muted={!ready && !active} glow={glow} />
  );

  return (
    <View testID="zone-overdrive" style={outer}>
      <UIScaleProvider value={s}>
        <View style={{ alignItems: "center" }}>
          {canActivate ? (
            <Pressable onPress={onActivate}>{({ pressed }) => (
              <View style={{ opacity: pressed ? 0.85 : 1 }}>{gauge}</View>
            )}</Pressable>
          ) : (
            <View style={{ opacity: ready && resting ? DOCK.disabledOpacity : 1 }}>{gauge}</View>
          )}
          {hint != null && (
            <PixelText
              text={hint}
              color={PALETTE.textDim}
              scale={s}
              style={{ marginTop: 3 * s }}
            />
          )}
        </View>
      </UIScaleProvider>
    </View>
  );
}

// The slim purple gauge: baked bar_slim frame + a Reanimated fill inset in the
// well (spec §5 well math, WELL_INSETS.slim) + an outlined centred label. When
// `glow`, a soft purple bloom (web box-shadow / iOS shadow) + a breathe pulse
// makes the charged ACTIVATE state alive without any per-frame re-render.
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

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const sc = secs % 60;
  if (h > 0) return `${h}H ${String(m).padStart(2, "0")}M`;
  return `${m}:${String(sc).padStart(2, "0")}`;
}
