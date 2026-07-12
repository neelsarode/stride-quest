// Boss HP bar that TWEENS to its new value (so a hit visibly drops the bar) and
// flashes white on a decrease. Drop-in replacement for the Phase-1 static HPBar.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { ANIM, FEEDBACK, PALETTE, SIZES } from "../config/assets";
import { usePrevious } from "../feedback/usePrevious";

export function AnimatedHPBar({ current, max }: { current: number; max: number }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const w = useRef(new Animated.Value(frac)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const prev = usePrevious(current);

  useEffect(() => {
    Animated.timing(w, {
      toValue: frac,
      duration: ANIM.hpTweenMs,
      useNativeDriver: false,
    }).start();
    if (prev !== undefined && current < prev) {
      flash.setValue(1);
      Animated.timing(flash, {
        toValue: 0,
        duration: ANIM.flashMs,
        useNativeDriver: false,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frac, current]);

  const width = w.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width }]} />
      <Animated.View
        style={[styles.flash, { opacity: flash }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: SIZES.barHeight,
    backgroundColor: PALETTE.hpTrack,
    borderRadius: SIZES.barHeight / 2,
    overflow: "hidden",
    marginVertical: 6,
  },
  fill: { height: "100%", backgroundColor: PALETTE.hp },
  flash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: FEEDBACK.damageFlash,
  },
});
