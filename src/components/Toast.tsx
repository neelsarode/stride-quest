// A transient bottom toast ("While you were away: +N", overdrive close, friendly
// server rejections, …). Fades in, holds, fades out. The CHOREOGRAPHY is
// unchanged (the 220 / ANIM.toastHoldMs / 300 fade) — STR-70 only swaps the
// CHROME: the old bordered dark box + system Text becomes the hi-fi kit's dark
// `toast_silver` 3-slice chip (kit hifiToast) with the message in <PixelText>.
// The message string is passed through verbatim (incl. every friendlyError copy);
// atlasText only folds glyphs the pixel font can't draw onto the atlas — no
// wording changes. Text-width single line, per the game-screen spec (§5: toasts
// are text-width 3-slices).
//
// STR-71 OVERFLOW FIX: the toast_silver frame is a HORIZONTAL 3-slice (width
// grows, height is fixed to one line), so a long string — e.g. friendlyError's
// ~458dp fallback, or the winded/rally copy up to ~590dp — ran off a 390dp
// screen. A taller / 9-slice / wrapping bake is out of scope (§5). Least-bad fix
// that keeps the copy byte-identical, readable, and the frame valid: SHRINK the
// whole chip (frame + text uniformly) just enough to fit the viewport width when
// the natural size overflows. Short toasts (the common case) stay at the crisp
// base art scale; only the rare long ones scale down (never below MIN_TOAST_SCALE,
// and the realistic longest strings bottom out around ~1.25× — still legible
// chunky pixels). Single line, no reflow, no wording change.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { ANIM } from "../config/assets";
import { Frame, PixelText, measurePixelText, useUIScale } from "../ui";
import { UI_PALETTE, UI_FILLS } from "../ui/theme";
import { atlasText } from "./atlasText";

// toast_silver 3-slice geometry (art px) — mirrors theme UI_SLICES.toast_silver.
const TOAST_CAP = 8; // capW → min length = 2*capW + 1
const TOAST_PAD = 6; // art px each side of the label (kit hifiToast: +12 total)
const TOAST_SIDE_MARGIN = 12; // dp kept clear on each screen edge when clamping
const MIN_TOAST_SCALE = 1; // never shrink past the atlas's native 1 art px = 1 dp

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
  const { width: screenW } = useWindowDimensions();
  const baseScale = useUIScale(); // 2 on phones (Toast renders outside a provider)
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
  const toastW = Math.max(2 * TOAST_CAP + 1, textW + 2 * TOAST_PAD); // art px
  // Shrink-to-fit: if the chip at base scale would overrun the viewport (minus a
  // small side margin), scale frame + text down uniformly so it fits on one line.
  const availableDp = Math.max(1, screenW - 2 * TOAST_SIDE_MARGIN);
  const scale =
    toastW * baseScale <= availableDp
      ? baseScale
      : Math.max(MIN_TOAST_SCALE, availableDp / toastW);
  // Good news reads warm green on the dark well; everything else calm silver
  // (info rejections are never red — the treatments tone guardrail).
  const ink = tone === "good" ? UI_FILLS.green.light : UI_PALETTE.silver_rim;

  return (
    <Animated.View style={[styles.wrap, { opacity: t }]}>
      <Frame slice="toast_silver" length={toastW} scale={scale}>
        <View style={styles.face}>
          <PixelText text={label} color={ink} scale={scale} />
        </View>
      </Frame>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  face: { flex: 1, alignItems: "center", justifyContent: "center" },
});
