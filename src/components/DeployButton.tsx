// The DEPLOY button — the dopamine action. Spends the whole Energy bank as a
// burst. Shows the deployable energy + the current streak readout. A press
// scale-punch gives instant tactile feedback regardless of network.
import { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { ANIM, PALETTE, SIZES } from "../config/assets";

export function DeployButton({
  energy,
  streakCount,
  streakMult,
  disabled,
  onDeploy,
}: {
  energy: number;
  streakCount: number;
  streakMult: number;
  disabled?: boolean;
  onDeploy: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: ANIM.pressScaleMs, useNativeDriver: false }),
      Animated.timing(scale, { toValue: 1, duration: ANIM.pressScaleMs, useNativeDriver: false }),
    ]).start();
    onDeploy();
  };
  return (
    <>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={press}
          disabled={disabled}
          style={[styles.btn, disabled && styles.disabled]}
        >
          <Text style={styles.deploy}>⚔ DEPLOY</Text>
          <Text style={styles.energy}>{energy.toLocaleString()} ⚡</Text>
        </Pressable>
      </Animated.View>
      <Text style={styles.streak}>
        {streakCount > 0
          ? `🔥 ${streakCount}-day streak · ×${streakMult.toFixed(2)} power`
          : `×${streakMult.toFixed(2)} power · build a streak for more`}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: PALETTE.accent,
    borderRadius: SIZES.radius,
    paddingVertical: 18,
    alignItems: "center",
    gap: 2,
  },
  disabled: { opacity: 0.4 },
  deploy: { color: "#11131a", fontSize: 22, fontWeight: "900", letterSpacing: 2 },
  energy: { color: "#11131a", fontSize: 15, fontWeight: "700" },
  streak: { color: PALETTE.crit, fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 8 },
});
