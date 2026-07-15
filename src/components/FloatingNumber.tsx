// A damage/idle number that rises and fades, then self-removes — the overlay
// layer (the battle scene renders its OWN in-scene damage numbers; these are the
// FeedbackProvider's floating numbers). The MOTION is unchanged (ANIM.floatRise*
// rise + fade curve) — STR-70 only swaps the CHROME: the old system Animated.Text
// with a soft shadow becomes an outlined <PixelText> (glyph + baked 1px dark
// outline), which stays legible over the busy battle scene at any position — the
// whole reason spec §4/§8 specify the outlined variant here.
//
// The outlined atlas is two-tone and rendered as-is, so per-number tinting
// (crit orange / idle green) is intentionally not applied; the crit read is
// carried by its larger size + the "CRIT!" prefix, idle vs damage by the +/-
// sign — exactly as the treatments already build them. `color` stays in the
// props (FeedbackProvider spreads it) but no longer selects a tint.
import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { ANIM } from "../config/assets";
import { PixelText } from "../ui";
import { atlasText } from "./atlasText";

export function FloatingNumber({
  id,
  text,
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
  // Map the treatments' dp font size (26 normal / 40 crit) to an integer art
  // scale so the number lands crisp: normal ≈ 4, crit ≈ 6 (the ANIM.critScale
  // 1.5 ratio). floor 2 keeps it never smaller than the HUD baseline.
  const numScale = Math.max(2, Math.round(size / 6.5));
  return (
    <Animated.View style={{ transform: [{ translateY }], opacity }}>
      <PixelText text={atlasText(text)} variant="outlined" scale={numScale} />
    </Animated.View>
  );
}
