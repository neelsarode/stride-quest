// A damage/heal number that rises and fades, then self-removes. Placeholder for
// the eventual "flying number" art. All timings/colors come from assets.ts.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { ANIM } from "../config/assets";

export function FloatingNumber({
  id,
  text,
  color,
  size,
  onDone,
}: {
  id: number;
  text: string;
  color: string;
  size: number;
  onDone: (id: number) => void;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: ANIM.floatRiseMs,
      useNativeDriver: false,
    }).start(() => onDone(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -ANIM.floatRiseDist],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 1, 0],
  });
  return (
    <Animated.Text
      style={[styles.num, { color, fontSize: size, transform: [{ translateY }], opacity }]}
    >
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  num: {
    fontWeight: "900",
    textShadowColor: "#000",
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
});
