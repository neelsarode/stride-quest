// A labeled progress meter that TWEENS its fill (so it visibly fills as you walk).
// Used for Job XP (progress to next job) and the Energy bank. Colors/timings from
// assets.ts.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { ANIM, PALETTE, SIZES } from "../config/assets";

export function AnimatedMeter({
  label,
  value,
  max,
  color,
  valueText,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  valueText: string;
}) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 1;
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
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color }]}>{valueText}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 5 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  label: { color: PALETTE.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  value: { fontSize: 13, fontWeight: "700" },
  track: {
    height: SIZES.barHeight - 4,
    backgroundColor: "#0c0e14",
    borderRadius: (SIZES.barHeight - 4) / 2,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: (SIZES.barHeight - 4) / 2 },
});
