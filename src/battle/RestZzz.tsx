// =============================================================================
// RestZzz — drifting pixel "z" particles over a RESTING fighter (STR-22;
// closes the z-particle deferral from STR-19). Port of the spawnZ/makeZCanvas
// recipe in assets/fx-engine.js: the kneel pose alone reads subtle, so the z's
// carry the "asleep" legibility.
//
// Glyph: the classic 5×5-block Z (bar, 3-step diagonal, bar) with a 1px
// pixel drop-shadow on a 6×6 art-px grid — drawn as positioned Views instead
// of a canvas (grid-pure like the sprites; no fonts, no art). Each spawn
// picks scale 2 or 3 (12/18 screen px), rises −34px with a slight right
// drift over 2.2s ease-out, fades in 0.6s ease-in, holds, fades out from
// 1.4s, and unmounts at 2.4s. New z every 1.5–2.2s. All timings/geometry are
// fx-engine parity.
//
// This is a SCENE-LEVEL overlay (like projectiles/damage numbers): the scene
// mounts one emitter per hero whose Fighter MODE is "rest" (keyed off
// onModeChange — z's stop on wake, and a mid-swing fighter only starts
// snoring once the swing settles into the kneel).
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// fx-engine parity numbers (makeZCanvas / spawnZ).
const Z = {
  grid: 6, // art-px canvas: 5×5 glyph + 1px shadow offset
  color: "#cfd6e4",
  shadow: "rgba(0,0,0,0.55)",
  riseMs: 2200, // transform 2.2s ease-out
  fadeMs: 600, // opacity .6s ease-in (both directions)
  fadeOutAtMs: 1400,
  removeAtMs: 2400,
  peakOpacity: 0.9,
  risePx: 34,
  spawnBaseMs: 1500, // next z in 1500 + rand·700 ms
  spawnJitterMs: 700,
  xFracBase: 0.5, // spawn x = hero box × (0.50 + rand·0.14)
  xFracJitter: 0.14,
  yFrac: 0.3, // spawn y = hero box top + 30% height
  driftBasePx: 8, // drift right 8 + rand·10 px
  driftJitterPx: 10,
  zIndex: 60, // fx layer (with projectiles), below HUD chrome
} as const;

// The Z glyph's filled cells, in art px: top bar, 3-step diagonal, bottom bar.
const GLYPH_RECTS = [
  { x: 0, y: 0, w: 5, h: 1 },
  { x: 3, y: 1, w: 1, h: 1 },
  { x: 2, y: 2, w: 1, h: 1 },
  { x: 1, y: 3, w: 1, h: 1 },
  { x: 0, y: 4, w: 5, h: 1 },
] as const;

// ≈ CSS ease-out / ease-in (the inline transition curves in fx-engine).
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);
const EASE_IN = Easing.bezier(0.42, 0, 1, 1);

function GlyphLayer({ scale, offset, color }: { scale: number; offset: number; color: string }) {
  return (
    <>
      {GLYPH_RECTS.map((r, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: (r.x + offset) * scale,
            top: (r.y + offset) * scale,
            width: r.w * scale,
            height: r.h * scale,
            backgroundColor: color,
          }}
        />
      ))}
    </>
  );
}

interface ZInst {
  id: number;
  x: number;
  y: number;
  scale: number;
  driftX: number;
}

function ZParticle({ z, onDone }: { z: ZInst; onDone: (id: number) => void }) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: Z.riseMs, easing: EASE_OUT });
    opacity.value = withSequence(
      withTiming(Z.peakOpacity, { duration: Z.fadeMs, easing: EASE_IN }),
      withDelay(
        Z.fadeOutAtMs - Z.fadeMs,
        withTiming(0, { duration: Z.fadeMs, easing: EASE_IN }),
      ),
    );
    const t = setTimeout(() => onDone(z.id), Z.removeAtMs);
    return () => {
      clearTimeout(t);
      cancelAnimation(progress);
      cancelAnimation(opacity);
    };
    // One mount per z: props fixed for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared values in the deps ON PURPOSE (see the note in Sprite.tsx).
  const style = useAnimatedStyle(
    () => ({
      opacity: opacity.value,
      transform: [
        { translateX: z.driftX * progress.value },
        { translateY: -Z.risePx * progress.value },
      ],
    }),
    [progress, opacity, z.driftX],
  );

  const sizePx = Z.grid * z.scale;
  return (
    <Animated.View
      pointerEvents="none"
      testID="rest-z"
      style={[
        styles.abs,
        { left: z.x, top: z.y, width: sizePx, height: sizePx, zIndex: Z.zIndex },
        style,
      ]}
    >
      <GlyphLayer scale={z.scale} offset={1} color={Z.shadow} />
      <GlyphLayer scale={z.scale} offset={0} color={Z.color} />
    </Animated.View>
  );
}

export interface RestZzzProps {
  /** The resting hero's rendered box, in stage coordinates. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Mounted while a fighter's mode is "rest"; unmount stops the snoring. */
export function RestZzz({ left, top, width, height }: RestZzzProps) {
  const [zs, setZs] = useState<ZInst[]>([]);
  const nextId = useRef(0);
  const box = useRef({ left, top, width, height });
  box.current = { left, top, width, height };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const spawn = () => {
      const b = box.current;
      setZs((prev) => [
        ...prev,
        {
          id: nextId.current++,
          x: b.left + b.width * (Z.xFracBase + Math.random() * Z.xFracJitter),
          y: b.top + b.height * Z.yFrac,
          scale: 2 + Math.floor(Math.random() * 2),
          driftX: Z.driftBasePx + Math.random() * Z.driftJitterPx,
        },
      ]);
      timer = setTimeout(spawn, Z.spawnBaseMs + Math.random() * Z.spawnJitterMs);
    };
    spawn(); // fx-engine parity: first z immediately on entering rest
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <>
      {zs.map((z) => (
        <ZParticle
          key={z.id}
          z={z}
          onDone={(id) => setZs((prev) => prev.filter((p) => p.id !== id))}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: "absolute" },
});

export default RestZzz;
