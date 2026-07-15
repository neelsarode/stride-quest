// =============================================================================
// BonusMeter (STR-57) — the Bonus Boss's ACCUMULATING damage meter.
// =============================================================================
// Replaces the HP bar while the weekly boss is won (the crowned victory week,
// M1.5 spec §6). It only ever counts UP — pure bonus framing: no HP to finish,
// no decay, nothing to fail. Gold/celebration treatment (stone base + gold =
// high-hierarchy per the UI art direction), deliberately distinct from the red
// depleting HP bar. Tier markers sit at the three thresholds labeled with the
// next-week mult each one earns; the fill sweeping past a marker is the
// phase's "kill moment" (the banner fires from useGameEvents' tier diff).
//
// The tiers arrive as ABSOLUTE thresholds from the dashboard (bonusTiersFor —
// the same pure helper the Monday rollover stamps with), so a marker's
// position IS the number the reward math uses. Shown == applied.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { ANIM, PALETTE, SIZES } from "../config/assets";

type Tier = { threshold: number; boostMult: number };

export function BonusMeter({ total, tiers }: { total: number; tiers: Tier[] }) {
  // The bar spans to the top tier ("a full second boss"); past it the meter
  // simply sits full — still counting in the text readout, never draining.
  const cap = tiers.length > 0 ? tiers[tiers.length - 1].threshold : 1;
  const frac = Math.max(0, Math.min(1, cap > 0 ? total / cap : 0));
  const w = useRef(new Animated.Value(frac)).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: frac,
      duration: ANIM.meterFillMs,
      useNativeDriver: false,
    }).start();
  }, [frac, w]);
  const width = w.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width }]} />
        {tiers.map((t, i) => (
          <View
            key={i}
            style={[
              styles.marker,
              { left: `${(t.threshold / cap) * 100}%` },
              total >= t.threshold && styles.markerReached,
            ]}
          />
        ))}
      </View>
      {/* Marker labels: the mult each threshold earns next week. */}
      <View style={styles.labelRow}>
        {tiers.map((t, i) => {
          const last = i === tiers.length - 1;
          const reached = total >= t.threshold;
          return (
            <Text
              key={i}
              style={[
                styles.markerLabel,
                reached && styles.markerLabelReached,
                last
                  ? { right: 0 }
                  : { left: `${(t.threshold / cap) * 100}%`, marginLeft: -14 },
              ]}
            >
              ×{t.boostMult}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 4 },
  // Stone-dark base + gold fill: celebration, unmistakably NOT the red HP bar.
  track: {
    height: SIZES.barHeight,
    backgroundColor: "#2a2416",
    borderColor: "#4a3f1d",
    borderWidth: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: PALETTE.accent },
  marker: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#6b5a23",
  },
  markerReached: { backgroundColor: "#fff3d6" },
  labelRow: { height: 16, marginTop: 2 },
  markerLabel: {
    position: "absolute",
    color: PALETTE.textDim,
    fontSize: 11,
    fontWeight: "800",
  },
  markerLabelReached: { color: PALETTE.accent },
});
