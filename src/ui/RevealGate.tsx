// =============================================================================
// RevealGate — show a whole surface AT ONCE instead of letting it decode in
// piece-by-piece. The pixel font renders each glyph as its own <Image>, and RN
// loads + composites every <Image> asynchronously, so a freshly-mounted, text-
// heavy surface with hundreds of glyph views presents them in mount order —
// left-to-right, label-by-label — the cheap "typing" effect on a cold app open
// or a modal open. (Worst in the Metro dev build, where each source is an HTTP
// fetch; a release build serves them from the bundle, faster.)
//
// The gate holds the subtree invisible while its glyph/chrome views composite
// off-screen, then fades it in as ONE unit. Two conditions must both hold before
// the reveal:
//   • `minHold` ms since mount — the dominant cost is compositing the many glyph
//     VIEWS, which takes a fixed span regardless of cache; measured atomic on the
//     game HUD at ~0.7s, a modal (fewer glyphs) sooner.
//   • the shared font atlas (`waitFor`) has loaded — covers a cold first fetch
//     where the atlas itself is the long pole (glyphs can't draw before it).
// A `maxWait` fallback guarantees it always reveals. Fast-refresh safe: opacity
// is driven by a `revealed` state flag, so it always ends VISIBLE.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export interface RevealGateProps {
  children: React.ReactNode;
  /** Font atlas / key frames to wait on (covers a cold first fetch). */
  waitFor?: ImageSourcePropType[];
  /** Minimum invisible hold from mount — long enough for the glyph views to
   *  composite. Tune per surface (HUD ~700, modal ~380). */
  minHold?: number;
  /** Hard cap (ms): reveal even if a load never reports (offline, error). */
  maxWait?: number;
  /** Fade-in duration once revealed. */
  duration?: number;
  /**
   * Extra reveal condition ANDed with the asset probes (default true) — e.g.
   * the battle scene passes `heroes.length > 0` so a roster that arrives
   * AFTER mount can't reveal an empty stage and then "type in" the party.
   * `maxWait` still caps it (never hold black forever).
   */
  ready?: boolean;
  /** Fires once, when the gate decides to reveal (the app-level LoadCurtain
   *  waits on the scene + HUD gates through this). */
  onRevealed?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function RevealGate({
  children,
  waitFor,
  minHold = 400,
  maxWait = 3000,
  duration = 160,
  ready = true,
  onRevealed,
  style,
}: RevealGateProps) {
  const sources = waitFor ?? [];
  const [loaded, setLoaded] = useState(0);
  const [held, setHeld] = useState(false);
  const [capped, setCapped] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  // STABLE onLoad/onError identity — react-native-web's <Image> lists `onLoad`
  // in its load-effect deps, so an INLINE handler (new identity per render)
  // re-runs the load → fires onLoad → setState → re-render → … an infinite
  // render loop that flooded "Maximum update depth exceeded" and crashed the
  // web tab (native is unaffected — RN doesn't re-load on handler identity).
  // One shared stable counter + a bail-out once every probe has reported (the
  // functional update returns the SAME state, so React skips the re-render).
  const totalRef = useRef(sources.length);
  totalRef.current = sources.length;
  const countProbe = useCallback(() => {
    setLoaded((n) => (n >= totalRef.current ? n : n + 1));
  }, []);

  useEffect(() => {
    const a = setTimeout(() => setHeld(true), minHold);
    const b = setTimeout(() => setCapped(true), maxWait);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assetsReady = loaded >= sources.length;
  const revealed = capped || (held && assetsReady && ready);

  // Latest-callback ref + fire-once guard: onRevealed identity must neither
  // retrigger the effect nor fire twice across re-renders.
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;
  const firedRef = useRef(false);

  useEffect(() => {
    if (revealed) {
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      }).start();
      if (!firedRef.current) {
        firedRef.current = true;
        onRevealedRef.current?.();
      }
    }
  }, [revealed, opacity, duration]);

  return (
    <Animated.View style={[style, { opacity }]} pointerEvents="box-none">
      {/* Hidden loaders: mount the gating assets so their onLoad fires when the
          (shared) source is cached. 1px, non-interactive, out of layout. */}
      {sources.length > 0 && (
        <View style={styles.probe} pointerEvents="none">
          {sources.map((src, i) => (
            <Image
              key={i}
              source={src}
              style={styles.probeImg}
              onLoad={countProbe}
              onError={countProbe}
              fadeDuration={0}
            />
          ))}
        </View>
      )}
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  probe: { position: "absolute", width: 1, height: 1, opacity: 0, top: -1, left: -1 },
  probeImg: { width: 1, height: 1 },
});

export default RevealGate;
