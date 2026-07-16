// =============================================================================
// CommandDock — GameScreen bottom action zone (SUPER ATTACK + steps ring).
// STR-68; Core Loop v2 re-skin STR-78 (spec §5.2/§5.3/§9). The centrepiece of the
// screen: SUPER ATTACK is the gold HERO button, biggest thing on the stage (56
// art px vs 18 for nav — hierarchy from ART size, not a bumped scale, spec §6).
// Re-skins DeployButton onto the baked kit chrome; the reactive LOGIC is reused
// verbatim, only the render + word swap.
//
// Core Loop v2 (STR-78): the manual COLLECT column is GONE — idle damage now
// auto-applies on open (no tap; the settle lives in useGameEngine's once-per-open
// effect). DEPLOY is renamed SUPER ATTACK (same whole-bank spend + crit/streak/
// boost math). Its handler emits the deploy event with `spent` (the Energy bank)
// so the battle scene can size the STR-77 combo/flurry off how much you walked.
//
// DATA/ACTIONS: this zone reads the SAME reactive dashboard query and calls the
// SAME deploy mutation the shared useGameEngine uses — but it does NOT call
// useGameEngine itself, because that hook also owns the screen's once-only side
// effects (auto-apply-on-open idle, rally/boost/bossAppears banners). Those run
// exactly once from GameScreen's single useGameEngine() call; re-invoking it
// per-zone would fire duplicate banners. So we mirror only the effect-free bits:
// useQuery (Convex dedupes identical subscriptions across zones) and the deploy
// handler body (setBusy → mutate → emit) copied from useGameEngine's onDeploy.
//
// GOAL-HIT GLOW (owner decision, spec §10-Q5 + STR-68 comment): when today's
// steps ≥ the daily goal, the ring gets a celebratory bloom — Reanimated-driven
// opacity+scale on the UI thread, ZERO per-frame React re-renders (spec §12).
// Timings/colours live in src/config/assets.ts GOAL_GLOW (one-place tune).
// =============================================================================
import React, { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { DOCK, GAME_ZONES, GOAL_GLOW, PALETTE } from "../../config/assets";
import { friendlyError } from "../../feedback/errors";
import { useFeedback } from "../../feedback/FeedbackProvider";
import {
  BakedImage,
  Button,
  Chip,
  PixelText,
  Ring,
  UIScaleProvider,
  measurePixelText,
} from "../../ui";
import { UI_PALETTE } from "../../ui/theme";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

const RING_ART = 30; // steps_ring frame is 30×30 art px
const BAR_H = 35; // btn_super_gold/amethyst 3-slice height (art px, face 34 + shadow row)
const FACE_H = 34; // the visible plate face the two rows lay out against
// Approved variant A (od-super-lab.html, 2026-07-16): row 1 = swords + a BIG
// scale-2 SUPER ATTACK word (FLAT color — the engrave/drop shadow doubled the
// letterforms at scale 2 and muddied it); row 2, low in the plate = the
// embedded OVERDRIVE meter (label + purple fill + energy gem/cost) while
// charging, or "X{mult} UNTIL RESET" + gem/cost in white while Overdrive is
// armed — when the ENTIRE plate flips to the amethyst twin. This replaces the
// old floating OverdriveBar strip (it covered the bottom party member).
const WORD = "SUPER ATTACK";
const OD_LABEL_DIM = "#6f4d1d"; // kit gold_deep — dim label on the gold face
const OD_WELL = "#241329"; // dark purple meter well (kit amethyst-family)
const OD_LIGHT = "#e6c9ff"; // lit top row of the fill (matches old ODGauge)
// DISABLED = the EMPTY-SOCKET twins (approved super-disabled-lab.html K,
// 2026-07-16 — flat transparency reads wrong on pixel art): the plate becomes
// a dark recessed well with only the gold/purple rim glowing; content dims to
// stone; the meter stays visible (steps still count at 0 energy). A tap on the
// socket plays a DENIED beat — head-shake + a dying-spark flicker + the warm
// toast — instead of silently doing nothing.
const SOCKET_WORD = "#5f6875"; // kit stone_mid — the dim word on the socket
const SOCKET_DIM = "#3b414c"; // kit stone_dark — labels/gem tint on the socket
const OD_FILL_DIM = "#66339c"; // kit amethyst4 — the meter fill while drained

export function CommandDock() {
  const { bottomPad, artScale: s, width } = useGameLayout();
  const data = useQuery(api.game.dashboard, {});
  const { emit } = useFeedback();
  const deployMut = useMutation(api.combat.deploy);
  const [busy, setBusy] = useState(false);

  // Mirrors useGameEngine.onDeploy — the SUPER ATTACK: spend the whole Energy
  // bank, animate the resulting crit/streak damage. Emits the deploy event with
  // `spent` (= the Energy bank) so the battle scene sizes the STR-77 combo/flurry
  // off how much you walked (not the crit-rolled damage). This IS the live path —
  // the game screen is the default home and Super Attack fires from here, not
  // useGameEngine. A friendly toast on server rejection (the dashboard sets a note
  // string; the game screen has no note surface).
  async function onDeploy() {
    setBusy(true);
    try {
      const r = await deployMut({});
      if (r)
        emit({
          type: "damageDealt",
          amount: r.damage,
          source: "deploy",
          crit: r.crit,
          spent: r.spent,
        });
    } catch (e) {
      emit({ type: "actionRejected", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  const outer = [
    zoneStyles.zone,
    zoneStyles.fullWidth,
    { bottom: bottomPad + GAME_ZONES.dockBottom },
  ];

  // Keep the positioned container stable while the first snapshot loads.
  if (!data) return <View testID="zone-command-dock" style={outer} />;

  const m = data.meters;
  const bossActive = !!data.boss && !data.boss.defeated;
  const canFight = bossActive || data.bonus != null;
  const energy = m.energy;
  const streak = data.streak;
  const dailyGoal = data.dailyGoal;

  const deployDisabled = busy || energy <= 0 || !canFight;
  // Warm copy for a tap on the drained socket (client-side self-gate — mirrors
  // the server's no_energy ConvexError copy so the wording never forks).
  const deniedMessage = !canFight
    ? "The next boss is on its way — hold your Super."
    : "Nothing banked yet — walk a little first.";
  // First-deploy teaching pulse (STR-49): breathe while there is Energy to
  // deploy and this account has NEVER deployed — server truth, silences forever.
  const firstDeployHint = energy > 0 && !data.hasEverDeployed && canFight;
  // The recurring daily nudge (distinct from the once-ever hint above): the
  // FIRST deploy each day is a guaranteed crit (STREAK.firstDeployGuaranteedCrit),
  // so surface it whenever today's first strike is still pending.
  const firstStrikeCrit = canFight && energy > 0 && !streak.deployedToday;
  const goalHit = dailyGoal.hit;
  const ringFrac = dailyGoal.goal > 0 ? dailyGoal.steps / dailyGoal.goal : 0;
  // Overdrive rides INSIDE the SUPER plate now (approved variant A) — the same
  // goal fraction the ring shows fills the embedded meter; `active` flips the
  // whole plate to the amethyst twin.
  const od = data.overdrive;
  const odFrac = od.active
    ? 1
    : Math.max(0, Math.min(1, od.goal > 0 ? od.stepsToday / od.goal : 0));

  // Core Loop v2 dock geometry: the SUPER ATTACK button is now a full-width gold
  // action BAR pinned to the left that stretches to fill the row up to the steps
  // ring on the right (a wide bar + a circular gauge). Cap the content width on
  // desktop so the bar doesn't sprawl (phones fill edge-to-edge). Width is
  // computed in art px because the 3-slice frame needs an explicit length.
  const contentDp = Math.min(width, DOCK.superBarMaxDp);
  const contentArt = Math.floor(contentDp / s);
  const barArtW = Math.max(
    64,
    contentArt - DOCK.sidePad * 2 - RING_ART - DOCK.superBarGap,
  );

  return (
    <View testID="zone-command-dock" style={outer}>
      <UIScaleProvider value={s}>
        {/* centre the (capped) dock content in the full-width zone */}
        <View style={{ width: "100%", alignItems: "center" }}>
          <View
            style={{
              width: contentDp,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: DOCK.sidePad * s,
            }}
          >
            {/* ---- SUPER ATTACK — the two-row plate w/ embedded OVERDRIVE ---- */}
            <DeployColumn
              s={s}
              barArtW={barArtW}
              energy={energy}
              streakMult={streak.multiplier}
              disabled={deployDisabled}
              busy={busy}
              firstDeployHint={firstDeployHint}
              firstStrikeCrit={firstStrikeCrit}
              odActive={od.active}
              odMult={od.mult}
              odFrac={odFrac}
              onDeploy={onDeploy}
              onDenied={() => emit({ type: "actionRejected", message: deniedMessage })}
            />

            {/* ---- steps RING (30-frame) + inside numbers + GOAL glow/chip ---- */}
            <View style={{ alignItems: "center" }}>
            <View style={{ width: RING_ART * s, height: RING_ART * s, overflow: "visible" }}>
              {goalHit && <GoalGlow s={s} />}
              <Ring value={ringFrac} style={{ position: "absolute", left: 0, top: 0 }} />
              {/* today/goal centred over the ring. The box is wider than the ring
                  and never clips, so a big step count overhangs the thin ring
                  onto the dark scene (still legible) instead of being cut. */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: -RING_ART * s,
                  right: -RING_ART * s,
                  top: 0,
                  bottom: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "visible",
                }}
              >
                <PixelText text={data.steps.today.toLocaleString()} color={UI_PALETTE.white} />
                <PixelText
                  text={`/${dailyGoal.goal.toLocaleString()}`}
                  color={UI_PALETTE.silver_dark}
                  style={{ marginTop: 1 * s }}
                />
              </View>
              {goalHit && (
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: (RING_ART + 2) * s,
                    alignItems: "center",
                  }}
                >
                  <Chip color="green" label="GOAL!" />
                </View>
              )}
            </View>
            </View>
          </View>
        </View>
      </UIScaleProvider>
    </View>
  );
}

// -----------------------------------------------------------------------------
// SUPER ATTACK plate — the two-row hero button (approved variant A) with the
// teaching pulse, the streak XN.NN chip riding the corner, the first-strike-crit
// hint, and the EMBEDDED Overdrive meter. While Overdrive is armed the whole
// plate swaps to the baked amethyst twin + a breathing purple bloom.
// (Internally still "DeployColumn" — the mutation keeps its name, §5.3.)
// -----------------------------------------------------------------------------
function DeployColumn({
  s,
  barArtW,
  energy,
  streakMult,
  disabled,
  busy,
  firstDeployHint,
  firstStrikeCrit,
  odActive,
  odMult,
  odFrac,
  onDeploy,
  onDenied,
}: {
  s: number;
  barArtW: number;
  energy: number;
  streakMult: number;
  disabled: boolean;
  busy: boolean;
  firstDeployHint: boolean;
  firstStrikeCrit: boolean;
  odActive: boolean;
  odMult: number;
  odFrac: number;
  onDeploy: () => void;
  onDenied: () => void;
}) {
  const pulse = usePulse(firstDeployHint, DOCK.deployPulseScale, DOCK.deployPulseMs);

  // DENIED beat — a tap on the drained socket answers with a quick head-shake
  // (the universal pixel-game "nope"), a dying-spark flicker inside the socket
  // (tapping a dead socket sputters), and the warm toast (via onDenied). The
  // Pressable stays ENABLED so the press-shift still gives a physical "thunk";
  // it just doesn't fire. Re-entry guarded so tap-spam can't stack shakes.
  const shakeX = useSharedValue(0);
  const spark = useSharedValue(0);
  const deniedBusy = useRef(false);
  function playDenied() {
    if (deniedBusy.current) return;
    deniedBusy.current = true;
    setTimeout(() => (deniedBusy.current = false), 500);
    shakeX.value = withSequence(
      withTiming(-2 * s, { duration: 50 }),
      withTiming(2 * s, { duration: 50 }),
      withTiming(-1.5 * s, { duration: 50 }),
      withTiming(1.5 * s, { duration: 50 }),
      withTiming(0, { duration: 60 }),
    );
    spark.value = withSequence(
      withTiming(0.35, { duration: 70 }),
      withTiming(0.08, { duration: 60 }),
      withTiming(0.28, { duration: 70 }),
      withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) }),
    );
    onDenied();
  }
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }), [shakeX]);
  const sparkStyle = useAnimatedStyle(() => ({ opacity: spark.value }), [spark]);

  function onPress() {
    if (busy) return; // in-flight — inert, no denied beat
    if (disabled) playDenied();
    else onDeploy();
  }

  return (
    <Animated.View style={[pulse, shakeStyle]}>
      {/* relative wrapper so the streak chip + crit hint can overflow the plate */}
      <View style={{ width: barArtW * s, height: BAR_H * s }}>
        {odActive && !disabled && <ActiveGlow s={s} w={barArtW} h={FACE_H} />}
        <Button
          material={
            disabled
              ? odActive
                ? "socketamethyst"
                : "socketgold"
              : odActive
                ? "superamethyst"
                : "supergold"
          }
          width={barArtW}
          onPress={onPress}
        >
          <DeployFace
            s={s}
            barArtW={barArtW}
            energy={energy}
            odActive={odActive}
            odMult={odMult}
            odFrac={odFrac}
            socket={disabled}
          />
        </Button>
        {/* the dying-spark flicker over the socket (rim-coloured, denied taps) */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              width: barArtW * s,
              height: FACE_H * s,
              borderRadius: 6 * s,
              backgroundColor: odActive ? "#dfb8ff" : UI_PALETTE.gold_light,
            },
            sparkStyle,
          ]}
        />
        {/* streak power chip riding the top-right corner of the plate */}
        <Chip
          color="gold"
          label={`X${streakMult.toFixed(2)}`}
          style={{ position: "absolute", top: -5 * s, right: 2 * s }}
        />
        {/* first-strike-crit nudge, under the plate (mock #deploycrit) */}
        {firstStrikeCrit && (
          <Caption
            text="FIRST STRIKE TODAY CRITS"
            color={PALETTE.accent}
            s={s}
            top={(BAR_H + 2) * s}
          />
        )}
      </View>
    </Animated.View>
  );
}

// The plate face (variant A): two absolutely-positioned rows against the 34-px
// face. Row 1 (y≈7): swords + BIG flat scale-2 SUPER ATTACK. Row 2 (y=21, low
// in the plate): OVERDRIVE label + purple fill + energy gem/cost while
// charging; "X{mult} UNTIL RESET" + gem/cost in WHITE while armed. Sized
// explicitly (the Button centres it, same size = fills), so the press shift
// moves both rows together.
function DeployFace({
  s,
  barArtW,
  energy,
  odActive,
  odMult,
  odFrac,
  socket,
}: {
  s: number;
  barArtW: number;
  energy: number;
  odActive: boolean;
  odMult: number;
  odFrac: number;
  socket: boolean;
}) {
  const cost = energy.toLocaleString();
  const wordW = measurePixelText(WORD) * 2; // scale-2 glyphs
  const rowW = 11 + 5 + wordW; // swords + gap + word
  const wordX = Math.round((barArtW - rowW) / 2);
  // Socket (disabled) content dims to stone — word, labels, gem all cold; the
  // meter stays visible with a drained fill (walking still counts at 0 energy).
  const wordColor = socket
    ? SOCKET_WORD
    : odActive
      ? UI_PALETTE.white
      : UI_PALETTE.outline;
  const costColor = socket ? SOCKET_WORD : odActive ? UI_PALETTE.white : UI_PALETTE.outline;
  const gemTint = socket ? SOCKET_DIM : undefined;
  return (
    <View style={{ width: barArtW * s, height: FACE_H * s }}>
      {/* ---- row 1: swords + the big word (FLAT color — no shadow layer) ---- */}
      <View
        style={{
          position: "absolute",
          left: wordX * s,
          top: 6 * s,
          flexDirection: "row",
          alignItems: "flex-start",
        }}
      >
        <BakedImage name="icon_swords" tintColor={gemTint} />
        <PixelText
          text={WORD}
          color={wordColor}
          scale={s * 2}
          style={{ marginLeft: 5 * s, marginTop: 1 * s }}
        />
      </View>
      {/* ---- row 2: the embedded OVERDRIVE meter, low in the plate ---- */}
      {odActive ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 21 * s,
            width: barArtW * s,
            height: 7 * s,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PixelText text={`X${odMult} UNTIL RESET`} color={socket ? SOCKET_WORD : UI_PALETTE.white} />
          <BakedImage name="icon_gem" tintColor={gemTint} style={{ marginLeft: 8 * s, marginRight: 3 * s }} />
          <PixelText text={cost} color={costColor} />
        </View>
      ) : (
        <View
          style={{
            position: "absolute",
            left: 7 * s,
            top: 21 * s,
            width: (barArtW - 14) * s,
            height: 7 * s,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <PixelText text="OVERDRIVE" color={socket ? SOCKET_DIM : OD_LABEL_DIM} />
          <ODFill s={s} frac={odFrac} dim={socket} />
          <BakedImage name="icon_gem" tintColor={gemTint} style={{ marginRight: 3 * s }} />
          <PixelText text={cost} color={costColor} />
        </View>
      )}
    </View>
  );
}

// The embedded meter fill: a dark purple well + a Reanimated scaleX fill with a
// lit top row — the exact ODGauge technique from the retired OverdriveBar strip
// (zero per-frame re-renders; re-renders only when the snapshot's frac changes).
function ODFill({ s, frac, dim }: { s: number; frac: number; dim?: boolean }) {
  const fill = useSharedValue(frac);
  useEffect(() => {
    fill.value = withTiming(frac, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [frac, fill]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }), [fill]);
  return (
    <View
      style={{
        flex: 1,
        height: 7 * s,
        marginHorizontal: 4 * s,
        borderRadius: 3 * s,
        backgroundColor: OD_WELL,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, transformOrigin: "left" },
          fillStyle,
        ]}
      >
        {!dim && (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: s, backgroundColor: OD_LIGHT }} />
        )}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: dim ? 0 : s,
            bottom: 0,
            backgroundColor: dim ? OD_FILL_DIM : PALETTE.overdrive,
          }}
        />
      </Animated.View>
    </View>
  );
}

// A breathing purple bloom behind the armed plate (the GoalGlow technique —
// transparent rounded rect whose soft shadow pulses on a shared value; React
// never re-renders while it breathes).
function ActiveGlow({ s, w, h }: { s: number; w: number; h: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: DOCK.activatePulseMs, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + 0.35 * t.value }), [t]);
  const shadow =
    Platform.OS === "web"
      ? ({ boxShadow: `0 0 10px ${PALETTE.overdrive}, 0 0 20px ${PALETTE.overdrive}` } as object)
      : {
          shadowColor: PALETTE.overdrive,
          shadowOpacity: 1,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
        };
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          top: 0,
          width: w * s,
          height: h * s,
          borderRadius: 6 * s,
        },
        shadow,
        style,
      ]}
    />
  );
}

// A centred caption absolutely positioned below an icon/button (so it never
// shifts the flex baseline the row aligns the three items on).
function Caption({ text, color, s, top }: { text: string; color: string; s: number; top: number }) {
  return (
    <View style={{ position: "absolute", left: 0, right: 0, top, alignItems: "center" }}>
      <PixelText text={text} color={color} scale={s} />
    </View>
  );
}

// -----------------------------------------------------------------------------
// GoalGlow — the celebratory bloom around the steps ring on goal-hit. A single
// transparent circle whose soft shadow (web box-shadow / iOS shadow*) blooms
// outward; a Reanimated shared value breathes its opacity + scale on the UI
// thread, so React never re-renders while it pulses (spec §12). The element is
// transparent (no fill) so the ring's inner numbers stay crisp on top.
// -----------------------------------------------------------------------------
function GoalGlow({ s }: { s: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: GOAL_GLOW.pulseMs, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t]);
  const style = useAnimatedStyle(() => {
    const k = t.value;
    return {
      opacity: GOAL_GLOW.minOpacity + (GOAL_GLOW.maxOpacity - GOAL_GLOW.minOpacity) * k,
      transform: [{ scale: GOAL_GLOW.minScale + (GOAL_GLOW.maxScale - GOAL_GLOW.minScale) * k }],
    };
  }, [t]);
  const size = RING_ART * s;
  const shadow =
    Platform.OS === "web"
      ? ({
          boxShadow: `0 0 ${GOAL_GLOW.webBlurPx}px ${GOAL_GLOW.color}, 0 0 ${
            GOAL_GLOW.webBlurPx * 2
          }px ${GOAL_GLOW.color}`,
        } as object)
      : {
          shadowColor: GOAL_GLOW.color,
          shadowOpacity: 1,
          shadowRadius: GOAL_GLOW.webBlurPx,
          shadowOffset: { width: 0, height: 0 },
        };
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        shadow,
        style,
      ]}
    />
  );
}

// A gentle infinite breathe (scale 1 ↔ peak) on the UI thread. Used for the
// first-deploy teaching pulse; off when `active` is false (resets to rest).
function usePulse(active: boolean, peak: number, ms: number) {
  const v = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(v);
    if (!active) {
      v.value = 1;
      return;
    }
    v.value = withRepeat(withTiming(peak, { duration: ms, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(v);
  }, [active, peak, ms, v]);
  return useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }), [v]);
}
