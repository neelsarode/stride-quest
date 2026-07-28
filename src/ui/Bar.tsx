// =============================================================================
// Bar — a value bar built from baked chrome + plain Views, animated entirely on
// shared values so the fill/ghost/flash move with ZERO React re-renders per
// frame (the M2 acceptance bar, spec §12).
//
// Chrome: a 3-slice Frame (full h=20 boss/plate, slim h=14 fuel/xp). Fill: a
// well View (theme WELL_INSETS) that is overflow-hidden + rounded ~2 art px, so
// everything inside is clipped to the rounded well — a partial fill gets a flat
// right edge, a full fill gets rounded right corners, exactly like the kit's
// per-row insets (assets/ui-kit.js hifiBar) but for free.
//
// The fill is a full-well-width wrapper compressed left-anchored via a scaleX
// transform (transformOrigin 'left'). Its light/mid/dark rows are solid
// horizontal colours, so compressing == shortening — visually identical to a
// width change but it's a TRANSFORM, never a layout pass (spec §5). The ghost
// (red_light, fillW→ghostW) and the flash (white overlay, opacity square-waved
// for frame-count blink parity) ride the same shared values.
//
// Drive: pass `value`/`ghost` (0..1) and the fill springs to them; OR pass an
// external `progress` SharedValue to drive it directly (the gallery proves the
// flat-render property that way). Trigger the damage blink via the ref.flash().
// =============================================================================
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
} from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Frame } from "./Frame";
import { PixelText, measurePixelText } from "./PixelText";
import { UI_FILLS, WELL_INSETS } from "./theme";
import { useResolvedScale } from "./scale";
import { useUITheme } from "./theme-context";

export type BarVariant = "full" | "slim";
export type BarFill =
  | (keyof typeof UI_FILLS extends infer K
      ? K extends "ghost" | "flash"
        ? never
        : K
      : never)
  // "accent" resolves to the current class theme's accent (per-class), not a
  // static UI_FILLS family — used for the fuel/energy bars (was "sky").
  | "accent";

const FRAME_H = { full: 20, slim: 14 } as const;
const SLICE = { full: "bar_full", slim: "bar_slim" } as const;
const FILL_MS = 260; // spring-in duration when the `value` prop changes

function clamp01(v: number): number {
  "worklet";
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface BarHandle {
  /** White damage-blink over the filled region (frame-count square wave). */
  flash: () => void;
}

export interface BarProps {
  variant: BarVariant;
  /** Total bar width in ART px. */
  width: number;
  /** Fill fraction 0..1 (ignored when `progress` is supplied). */
  value?: number;
  /** Ghost/chip fraction 0..1, ≥ value (ignored when `ghostProgress` supplied). */
  ghost?: number;
  /** Fill colour family (boss=gold, fuel/xp=sky, …). Default gold. */
  fill?: BarFill;
  /** External drive: a shared value 0..1 replaces the internal fill spring. */
  progress?: SharedValue<number>;
  ghostProgress?: SharedValue<number>;
  /** Outlined label centred over the bar (readable on any fill). */
  label?: string;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export const Bar = forwardRef<BarHandle, BarProps>(function Bar(
  {
    variant,
    width,
    value = 0,
    ghost,
    fill = "gold",
    progress,
    ghostProgress,
    label,
    scale,
    style,
  },
  ref,
) {
  const s = useResolvedScale(scale);
  const theme = useUITheme();
  const h = FRAME_H[variant];
  const inset = WELL_INSETS[variant === "full" ? "full" : "slim"];
  const wellW = width - inset.dw;
  const wellH = h - inset.dh;
  // "accent" is class-themed; everything else is a static UI_FILLS family.
  const fam = fill === "accent" ? theme.accent : UI_FILLS[fill];

  // Internal drives (used unless an external SharedValue is provided).
  const ownFill = useSharedValue(clamp01(value));
  const ownGhost = useSharedValue(clamp01(ghost ?? value));
  const flashSaw = useSharedValue(0);
  const fillFrac = progress ?? ownFill;
  const ghostFrac = ghostProgress ?? ownGhost;

  useEffect(() => {
    if (progress) return;
    ownFill.value = withTiming(clamp01(value), {
      duration: FILL_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, progress, ownFill]);

  useEffect(() => {
    if (ghostProgress) return;
    ownGhost.value = withTiming(clamp01(ghost ?? value), {
      duration: FILL_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [ghost, value, ghostProgress, ownGhost]);

  useImperativeHandle(
    ref,
    () => ({
      flash: () => {
        cancelAnimation(flashSaw);
        flashSaw.value = 0;
        // Sawtooth 0→1 ×6 at ~66ms/cycle; opacity square-waves off it below
        // → ~15Hz blink (kit frame-count parity), ends OFF via the callback.
        flashSaw.value = withRepeat(
          withTiming(1, { duration: 66, easing: Easing.linear }),
          6,
          false,
          (finished) => {
            "worklet";
            if (finished) flashSaw.value = 0;
          },
        );
      },
    }),
    [flashSaw],
  );

  // Left-anchored horizontal compression == shortening for solid-colour rows.
  const fillStyle = useAnimatedStyle(
    () => ({ transform: [{ scaleX: clamp01(fillFrac.value) }] }),
    [fillFrac],
  );
  const ghostStyle = useAnimatedStyle(
    () => ({ transform: [{ scaleX: clamp01(ghostFrac.value) }] }),
    [ghostFrac],
  );
  const flashStyle = useAnimatedStyle(
    () => ({
      transform: [{ scaleX: clamp01(fillFrac.value) }],
      opacity: flashSaw.value > 0 && flashSaw.value < 0.5 ? 1 : 0,
    }),
    [fillFrac, flashSaw],
  );

  const wrap: ViewStyle = useMemo(
    () => ({
      position: "absolute",
      left: 0,
      top: 0,
      width: wellW * s,
      height: wellH * s,
      transformOrigin: "left",
    }),
    [wellW, wellH, s],
  );

  const labelW = label ? measurePixelText(label, "outlined") : 0;

  return (
    <View style={[{ width: width * s, height: h * s }, style]}>
      <Frame slice={SLICE[variant]} length={width} scale={s} />

      {/* rounded well clip over the baked dark well */}
      <View
        style={{
          position: "absolute",
          left: inset.x * s,
          top: inset.y * s,
          width: wellW * s,
          height: wellH * s,
          borderRadius: inset.radius * s,
          overflow: "hidden",
        }}
      >
        {/* ghost chip (behind the fill) */}
        <Animated.View
          style={[wrap, { backgroundColor: UI_FILLS.ghost }, ghostStyle]}
        />
        {/* value fill: light top row / mid body / dark bottom row */}
        <Animated.View style={[wrap, fillStyle]}>
          <View style={[fillRow, { top: 0, height: s, backgroundColor: fam.light }]} />
          <View
            style={[
              fillRow,
              { top: s, bottom: s, backgroundColor: fam.mid },
            ]}
          />
          <View
            style={[
              fillRow,
              { bottom: 0, height: s, backgroundColor: fam.dark },
            ]}
          />
        </Animated.View>
        {/* damage flash over the filled region */}
        <Animated.View
          style={[wrap, { backgroundColor: UI_FILLS.flash }, flashStyle]}
        />
      </View>

      {label != null && (
        <View
          style={{
            position: "absolute",
            left: Math.round((width - labelW) / 2) * s,
            top: (inset.y + Math.round((wellH - 7) / 2)) * s,
          }}
        >
          <PixelText text={label} variant="outlined" scale={s} />
        </View>
      )}
    </View>
  );
});

const fillRow: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
};

export default Bar;
