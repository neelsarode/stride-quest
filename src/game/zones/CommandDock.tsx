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
import React, { useEffect, useState } from "react";
import { Platform, View } from "react-native";
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
} from "../../ui";
import { UI_PALETTE } from "../../ui/theme";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

const RING_ART = 30; // steps_ring frame is 30×30 art px
const BAR_H = 26; // btn_super_gold 3-slice frame height (art px) — the tall SUPER button

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
  // First-deploy teaching pulse (STR-49): breathe while there is Energy to
  // deploy and this account has NEVER deployed — server truth, silences forever.
  const firstDeployHint = energy > 0 && !data.hasEverDeployed && canFight;
  // The recurring daily nudge (distinct from the once-ever hint above): the
  // FIRST deploy each day is a guaranteed crit (STREAK.firstDeployGuaranteedCrit),
  // so surface it whenever today's first strike is still pending.
  const firstStrikeCrit = canFight && energy > 0 && !streak.deployedToday;
  const goalHit = dailyGoal.hit;
  const ringFrac = dailyGoal.goal > 0 ? dailyGoal.steps / dailyGoal.goal : 0;

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
            {/* ---- SUPER ATTACK — the full-width gold action bar (left) ---- */}
            <DeployColumn
              s={s}
              barArtW={barArtW}
              energy={energy}
              streakMult={streak.multiplier}
              disabled={deployDisabled}
              firstDeployHint={firstDeployHint}
              firstStrikeCrit={firstStrikeCrit}
              onDeploy={onDeploy}
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
// SUPER ATTACK bar — the full-width gold action bar with the teaching pulse, the
// horizontal swords+word+cost content, the streak XN.NN chip riding the corner,
// and the first-strike-crit hint. (Internally still "DeployColumn" — the
// mutation keeps its name; only the user-facing word/shape changed, §5.3.)
// The button is a 3-slice btn_super_gold frame stretched to `barArtW`, 26 art
// px tall — a chunky rectangular button (not a thin bar) with centred content.
// -----------------------------------------------------------------------------
function DeployColumn({
  s,
  barArtW,
  energy,
  streakMult,
  disabled,
  firstDeployHint,
  firstStrikeCrit,
  onDeploy,
}: {
  s: number;
  barArtW: number;
  energy: number;
  streakMult: number;
  disabled: boolean;
  firstDeployHint: boolean;
  firstStrikeCrit: boolean;
  onDeploy: () => void;
}) {
  const pulse = usePulse(firstDeployHint, DOCK.deployPulseScale, DOCK.deployPulseMs);
  return (
    <Animated.View style={pulse}>
      {/* relative wrapper so the streak chip + crit hint can overflow the bar */}
      <View style={{ width: barArtW * s, height: BAR_H * s }}>
        <View style={{ opacity: disabled ? DOCK.disabledOpacity : 1 }}>
          <Button material="supergold" width={barArtW} disabled={disabled} onPress={onDeploy}>
            <DeployFace s={s} energy={energy} />
          </Button>
        </View>
        {/* streak power chip riding the top-right corner of the bar */}
        <Chip
          color="gold"
          label={`X${streakMult.toFixed(2)}`}
          style={{ position: "absolute", top: -5 * s, right: 2 * s }}
        />
        {/* first-strike-crit nudge, under the bar (mock #deploycrit) */}
        {firstStrikeCrit && (
          <Caption
            text="FIRST STRIKE TODAY CRITS"
            color={PALETTE.accent}
            s={s}
            top={(BAR_H + 3) * s}
          />
        )}
      </View>
    </Animated.View>
  );
}

// The SUPER ATTACK bar content, laid out HORIZONTALLY (Core Loop v2 dock): the
// crossed-swords emblem, the "SUPER" word next to it, then the blue energy gem +
// the live Energy cost next to that. The Button centres this row in the
// full-width gold frame. All children resolve the art scale from context.
function DeployFace({ s, energy }: { s: number; energy: number }) {
  const cost = energy.toLocaleString();
  return (
    // A tight horizontal group; the Button centres it in the full-width bar.
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <BakedImage name="icon_swords" />
      <PixelText
        text="SUPER"
        variant="engraved"
        color={UI_PALETTE.outline}
        rimColor={UI_PALETTE.gold_light}
        style={{ marginLeft: 5 * s }}
      />
      <BakedImage name="icon_gem" style={{ marginLeft: 8 * s }} />
      <PixelText text={cost} color={UI_PALETTE.outline} style={{ marginLeft: 3 * s }} />
    </View>
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
