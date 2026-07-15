// A transient bottom toast ("While you were away: +N", overdrive close, friendly
// server rejections, …). Fades in, holds, fades out. The CHOREOGRAPHY is
// unchanged (the 220 / ANIM.toastHoldMs / 300 fade) — STR-70 only swaps the
// CHROME: the old bordered dark box + system Text becomes the hi-fi kit's dark
// `toast_silver` 3-slice chip (kit hifiToast) with the message in <PixelText>.
// The message string is passed through verbatim (incl. every friendlyError copy);
// atlasText only folds glyphs the pixel font can't draw onto the atlas — no
// wording changes. Text-width single line, per the game-screen spec (§5: toasts
// are text-width 3-slices).
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { ANIM } from "../config/assets";
import { Frame, PixelText, measurePixelText } from "../ui";
import { UI_PALETTE, UI_FILLS } from "../ui/theme";
import { atlasText } from "./atlasText";

// toast_silver 3-slice geometry (art px) — mirrors theme UI_SLICES.toast_silver.
const TOAST_CAP = 8; // capW → min length = 2*capW + 1
const TOAST_PAD = 6; // art px each side of the label (kit hifiToast: +12 total)

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

  const label = atlasText(message);
  const textW = measurePixelText(label);
  const toastW = Math.max(2 * TOAST_CAP + 1, textW + 2 * TOAST_PAD);
  // Good news reads warm green on the dark well; everything else calm silver
  // (info rejections are never red — the treatments tone guardrail).
  const ink = tone === "good" ? UI_FILLS.green.light : UI_PALETTE.silver_rim;

  return (
    <Animated.View style={[styles.wrap, { opacity: t }]}>
      <Frame slice="toast_silver" length={toastW}>
        <View style={styles.face}>
          <PixelText text={label} color={ink} />
        </View>
      </Frame>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  face: { flex: 1, alignItems: "center", justifyContent: "center" },
});
