// The DEPLOY button — the dopamine action. Spends the whole Energy bank as a
// burst. Shows the deployable energy + the current streak readout. A press
// scale-punch gives instant tactile feedback regardless of network.
//
// First-deploy hint (STR-49, spec §Teaching Layer — "the single most important
// teach"): while `firstDeployHint` is on (server-derived: energy > 0 and the
// account has never deployed), the button breathes a gentle pulse and one line
// explains the loop. The first deploy is already a guaranteed crit, so the
// payoff is built in — and lastDeployDate flips server-side, so the hint
// disappears forever, on every device, after that one tap.
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { ANIM, PALETTE, SIZES, TEACHING } from "../config/assets";

export function DeployButton({
  energy,
  streakCount,
  streakMult,
  disabled,
  firstDeployHint,
  onDeploy,
}: {
  energy: number;
  streakCount: number;
  streakMult: number;
  disabled?: boolean;
  /** Pulse + teach line until the account's first-ever deploy (STR-49). */
  firstDeployHint?: boolean;
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

  // The gentle first-deploy pulse: a slow breathing loop on its own Animated
  // value (kept separate from the press punch so the two never fight).
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!firstDeployHint) {
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
  }, [firstDeployHint, pulse]);

  return (
    <>
      {firstDeployHint && (
        <Text style={styles.hint}>
          Your steps are banked as Energy. DEPLOY hurls the whole bank at the
          boss.
        </Text>
      )}
      <Animated.View style={{ transform: [{ scale: Animated.multiply(scale, pulse) }] }}>
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
  hint: {
    color: PALETTE.accent,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 18,
  },
});
