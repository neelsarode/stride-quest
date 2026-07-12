// A bottom toast (e.g. "While you were away: +N"). Fades in, holds, fades out.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { ANIM, PALETTE, SIZES } from "../config/assets";

export function Toast({
  id,
  message,
  tone,
  onDone,
}: {
  id: number;
  message: string;
  tone: "info" | "good";
  onDone: (id: number) => void;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 220, useNativeDriver: false }),
      Animated.delay(ANIM.toastHoldMs),
      Animated.timing(t, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start(() => onDone(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={[styles.wrap, { opacity: t }]}>
      <Text style={[styles.text, { color: tone === "good" ? PALETTE.good : PALETTE.text }]}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#0c0e14",
    borderColor: PALETTE.panelBorder,
    borderWidth: 1,
    borderRadius: SIZES.radius,
    paddingVertical: 10,
    paddingHorizontal: 16,
    maxWidth: 320,
  },
  text: { fontSize: 13, fontWeight: "600", textAlign: "center" },
});
