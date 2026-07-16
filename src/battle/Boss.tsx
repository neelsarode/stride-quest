// =============================================================================
// Boss — the shared weekly boss (docs/fx-rn-port-plan.md, step 4).
//
// Idle loop via Sprite (9-frame strip @ 9fps — parity with battlefield-ui.html
// `BOSS`/`BOSS_CROWNED`). `bossKey` selects the form: "horse_256" (normal
// week) or "horse_crowned_256" (bonus/victory week) — both are in the packed
// spriteMap. The hurt/attack/idle_alt frame dirs still exist under
// characters/bosses/ but are NOT packed (STR-85 trim — the hit reaction ships
// as flash + bump per fx-engine); to wire one up, add it to BOSS_SCOPE in
// scripts/pack-sprites.mjs and re-run `npm run pack-sprites`.
//
// SCALE: art is 256×256 native (boss asset spec: PixelLab max, faces left,
// upscaled for display); rendered at `heightPx`. The never-shorter-than-the-
// party AUTO-SCALE RULE lands with the scene ticket (plan step 5) — until
// then the caller computes and passes the height, which keeps this component
// hook-ready: scene decides, Boss renders.
//
// HIT FLASH (decision D2): RN has no CSS brightness() filter (fx-engine uses
// brightness(2.2)), so the flash is a white-TINTED copy of the boss strip
// stacked over the base Sprite, opacity-animated 0 → 0.7 → 0 across the flash
// duration — plus fx-engine's translateY bump (instant up, hold for the flash
// duration, instant release). The overlay steps frames with its own repeat
// timing started in the same commit as the base Sprite's: both are
// timestamp-driven linear repeats of identical duration, so they stay
// frame-locked by construction (and a ±1-frame slip during a 120ms flash
// would be invisible under 0.7-opacity white anyway).
// =============================================================================
import { forwardRef, useEffect, useImperativeHandle } from "react";
import {
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { FX } from "./fxConfig";
import { PIXELATED, Sprite } from "./Sprite";
import { SPRITES, type SpriteKey } from "./spriteMap";
import manifestJson from "./sprites/manifest.json";

const MANIFEST = manifestJson as Record<
  SpriteKey,
  { frames: number; w: number; h: number; file: string }
>;

// battlefield-ui.html parity: BOSS/BOSS_CROWNED = { frames: 9, fps: 9 }.
// A boss-local constant there too, so it lives here rather than in fxConfig.
const BOSS_IDLE_FPS = 9;
// Plan D2: flash peaks at 0.7 white — the RN stand-in for brightness(2.2).
const FLASH_PEAK_OPACITY = 0.7;

/** The two horse forms in the packed spriteMap. */
export type BossKey = "horse_256" | "horse_crowned_256";

export interface BossHandle {
  /**
   * Hit reaction (≙ fx-engine impactAt's boss half): white flash + translateY
   * bump. big=true (specials) uses the longer/bigger values.
   */
  hit(big: boolean): void;
}

export interface BossProps {
  bossKey?: BossKey;
  /** Display height in px (art is square; width follows). See SCALE above. */
  heightPx: number;
  /**
   * Measure hook for the caller's shot geometry (D3): rect must land in the
   * same stage coordinate space as the shooters and projectiles.
   */
  onLayout?: (e: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Boss = forwardRef<BossHandle, BossProps>(function Boss(
  { bossKey = "horse_256", heightPx, onLayout, style, testID = "boss" },
  ref,
) {
  const idleKey = `bosses/${bossKey}/idle` as SpriteKey;
  const { frames, w, h } = MANIFEST[idleKey];
  const scale = heightPx / h;
  const widthPx = heightPx * (w / h);

  // Flash-overlay frame progress — the same loop driver as Sprite's, so the
  // tinted copy shows the same frame as the base (see header on sync).
  const overlayProgress = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(overlayProgress);
    overlayProgress.value = 0;
    overlayProgress.value = withRepeat(
      withTiming(frames, {
        duration: (frames / BOSS_IDLE_FPS) * 1000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => cancelAnimation(overlayProgress);
  }, [idleKey, frames, overlayProgress]);

  const flashOpacity = useSharedValue(0);
  const bumpY = useSharedValue(0);
  useEffect(
    () => () => {
      cancelAnimation(flashOpacity);
      cancelAnimation(bumpY);
    },
    [flashOpacity, bumpY],
  );

  useImperativeHandle(
    ref,
    () => ({
      hit(big: boolean) {
        const flashMs = big ? FX.specialFlashMs : FX.flashMs;
        const bumpPx = big ? FX.specialBumpPx : FX.bumpPx;
        // 0 → peak → 0 across the flash duration (plan D2).
        flashOpacity.value = 0;
        flashOpacity.value = withSequence(
          withTiming(FLASH_PEAK_OPACITY, {
            duration: flashMs / 2,
            easing: Easing.linear,
          }),
          withTiming(0, { duration: flashMs / 2, easing: Easing.linear }),
        );
        // fx-engine bump: translateY(-bump) applied instantly, reset after
        // flashMs — not a smooth ease; the snap IS the impact feel.
        bumpY.value = -bumpPx;
        bumpY.value = withDelay(flashMs, withTiming(0, { duration: 0 }));
      },
    }),
    [flashOpacity, bumpY],
  );

  // NOTE (all three styles): the shared value is in the deps ON PURPOSE — on
  // web without the worklets Babel plugin, Reanimated subscribes the updater
  // to the shared values found in the deps array (see the note in Sprite).
  const bumpStyle = useAnimatedStyle(
    () => ({ transform: [{ translateY: bumpY.value }] }),
    [bumpY],
  );
  const flashStyle = useAnimatedStyle(
    () => ({ opacity: flashOpacity.value }),
    [flashOpacity],
  );
  const overlayFrameStyle = useAnimatedStyle(() => {
    // Same quantization as Sprite: clamp so the value never slides past the
    // strip end on the repeat boundary.
    const frameIndex = Math.min(frames - 1, Math.floor(overlayProgress.value));
    return { transform: [{ translateX: -frameIndex * w }] };
  }, [overlayProgress, frames, w]);

  return (
    <Animated.View
      testID={testID}
      onLayout={onLayout}
      style={[{ width: widthPx, height: heightPx }, bumpStyle, style]}
    >
      <Sprite
        animKey={idleKey}
        fps={BOSS_IDLE_FPS}
        style={{ transform: [{ scale }], transformOrigin: "top left" }}
      />
      {/* White-tinted flash copy (plan D2) — same strip, same frame window,
          same scale, stacked exactly over the base; only opacity animates. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flashWindow,
          {
            width: w,
            height: h,
            transform: [{ scale }],
            transformOrigin: "top left",
          },
          flashStyle,
        ]}
      >
        <Animated.Image
          source={SPRITES[idleKey]}
          tintColor="#ffffff"
          style={[{ width: frames * w, height: h }, PIXELATED, overlayFrameStyle]}
          resizeMode="stretch"
          fadeDuration={0}
        />
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  flashWindow: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
  },
});

export default Boss;
