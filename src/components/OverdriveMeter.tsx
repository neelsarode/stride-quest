// =============================================================================
// OverdriveMeter (STR-14) — the charge meter + the big ACTIVATE button.
// =============================================================================
// Overdrive is the player-ACTIVATED fever mode (spec §4, decision #3: agency
// makes it feel earned): steps past the daily goal charge the meter; at 100%
// the button lights up and pulses; popping it buys 4 hours of ×3 idle damage.
// Pure reward — normal fuel burn, and an unspent charge holds at 100% forever,
// so there is never a wrong moment to press it.
//
// States:
//   charging  → dim button, "CHARGING · 62%", hint explains how to fill it
//   ready     → glowing pulsing gold-on-purple ACTIVATE (unless Resting)
//   resting   → charged but disabled: wake the hero first (calm copy, no red)
//   active    → ×3 indicator + live countdown (client-side tick anchored to
//               the server's remainingSeconds snapshot; server stays truth)
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { PALETTE, SIZES, TEACHING } from "../config/assets";
import { AnimatedMeter } from "./AnimatedMeter";

export function OverdriveMeter({
  chargePct,
  ready,
  active,
  remainingSeconds,
  idleDamageMult,
  durationHours,
  resting,
  busy,
  onActivate,
}: {
  chargePct: number; // 0..100
  ready: boolean;
  active: boolean;
  remainingSeconds: number; // server snapshot; ticked down locally for display
  idleDamageMult: number;
  durationHours: number;
  resting: boolean;
  busy?: boolean;
  onActivate: () => void;
}) {
  // Live countdown: anchor the server's remainingSeconds to its arrival time
  // and tick locally — display-only, the server recomputes on every snapshot.
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

  // READY glow: the same gentle breathing loop the first-deploy hint uses.
  const canActivate = ready && !active && !resting;
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!canActivate) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: TEACHING.deployHintPulseScale,
          duration: TEACHING.deployHintPulseMs,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: TEACHING.deployHintPulseMs,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [canActivate, pulse]);

  return (
    <View style={styles.wrap}>
      <AnimatedMeter
        label="CHARGE"
        value={active ? 100 : chargePct}
        max={100}
        color={PALETTE.overdrive}
        valueText={active ? `×${idleDamageMult} ACTIVE` : `${chargePct}%`}
      />
      {active ? (
        <View style={styles.activeRow}>
          <Text style={styles.activeMult}>×{idleDamageMult} DAMAGE</Text>
          <Text style={styles.activeLeft}>{fmtCountdown(left)} left</Text>
        </View>
      ) : (
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Pressable
            onPress={onActivate}
            disabled={busy || !canActivate}
            style={[styles.btn, canActivate ? styles.btnReady : styles.btnDim]}
          >
            <Text style={canActivate ? styles.btnTextReady : styles.btnTextDim}>
              {ready ? "⚡ ACTIVATE OVERDRIVE" : `CHARGING · ${chargePct}%`}
            </Text>
          </Pressable>
        </Animated.View>
      )}
      <Text style={styles.hint}>
        {active
          ? `Your hero chains special attacks — every idle hit lands ×${idleDamageMult}.`
          : ready && resting
            ? "Charged — but your hero is resting. Walk some fuel into the tank, then unleash it."
            : ready
              ? `Charged and waiting. Pop it whenever you choose: ×${idleDamageMult} damage for ${durationHours} hours.`
              : "Every step past your daily goal charges it. The charge keeps until you use it."}
      </Text>
    </View>
  );
}

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  btn: {
    borderRadius: SIZES.radius,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  // READY: loud purple — the one moment this component shouts.
  btnReady: {
    backgroundColor: PALETTE.overdrive,
    borderColor: "#e6c9ff",
    shadowColor: PALETTE.overdrive,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  btnDim: { backgroundColor: "#221a2e", borderColor: "#3a2b52", opacity: 0.75 },
  btnTextReady: {
    color: "#1c0a2e",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  btnTextDim: {
    color: "#8a7aa6",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#2a1140",
    borderColor: PALETTE.overdrive,
    borderWidth: 1,
    borderRadius: SIZES.radius,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  activeMult: {
    color: PALETTE.overdrive,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  activeLeft: { color: "#e6c9ff", fontSize: 15, fontWeight: "700" },
  hint: { color: PALETTE.textDim, fontSize: 12, lineHeight: 18 },
});
