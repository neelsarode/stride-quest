// =============================================================================
// Projectile — one mount per shot (docs/fx-rn-port-plan.md, step 4; ≙
// fx-engine.js fireProjectile + impactAt, semantics ported 1:1).
//
// Choreography: spawn at the shooter's measured weapon-tip point → straight
// constant-px/ms flight to the right (withTiming linear, duration clamped to
// FX.flightMinMs..flightMaxMs — plan D2) → impact burst at the hit point +
// floating damage number. The boss's OWN reaction (white flash + translateY
// bump) is the caller's job via Boss.hit() from onImpact — Projectile stays
// dumb: spawn/target coords in, effects out, onDone when everything finished
// (the caller unmounts it; key each mount by a shot id).
//
// GEOMETRY (decision D3 — the critical invariant): spawn/target come from the
// pixel-measured anchors (tipX/tipY as FRACTIONS of the shooter's RENDERED
// box) and FX.bossChestX (fraction across the boss box) — NEVER from raw view
// bounds. Transparent padding inside the sprite boxes is exactly why: using
// box edges made projectiles spawn past the target and fly BACKWARDS on
// narrow screens in the HTML era. computeShotGeometry() is the 1:1 port of
// fireProjectile's cx0/cy/cx1 math with getBoundingClientRect swapped for
// onLayout rects; both rects MUST be measured in the same parent's coordinate
// space — the stage that also mounts the Projectile.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { FxAnchor } from "./anchors";
import type { AttackKind } from "./Fighter";
import { CLASS_FX, FX, projectileSizePx, type ClassName } from "./fxConfig";
import { Sprite } from "./Sprite";
import { type SpriteKey } from "./spriteMap";
import manifestJson from "./sprites/manifest.json";

const MANIFEST = manifestJson as Record<
  SpriteKey,
  { frames: number; w: number; h: number; file: string }
>;

/** An onLayout rect (react-native LayoutRectangle shape), stage coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Resolved spawn/target for one shot. Impact Y === from.y (straight flight). */
export interface ShotGeometry {
  from: { x: number; y: number };
  toX: number;
}

/**
 * 1:1 port of fx-engine.js#fireProjectile's geometry:
 *   cx0 = w.left + w.width  * a.tipX     ← visible weapon tip, NOT a box edge
 *   cy  = w.top  + w.height * a.tipY
 *   cx1 = max(b.left + b.width * bossChestX, cx0 + minTravelPx)
 * The minTravelPx clamp guarantees a rightward flight even when layout puts
 * the boss chest left of the tip (narrow screens — the D3 bug scenario).
 */
export function computeShotGeometry(
  shooter: Rect,
  anchor: FxAnchor,
  boss: Rect,
): ShotGeometry {
  const x = shooter.x + shooter.width * anchor.tipX;
  const y = shooter.y + shooter.height * anchor.tipY;
  const toX = Math.max(
    boss.x + boss.width * FX.bossChestX,
    x + FX.minTravelPx,
  );
  return { from: { x, y }, toX };
}

// fx-engine.js#impactAt parity — the damage-number juice values. These are
// battle-layer numbers, deliberately separate from the feedback layer's
// FloatingNumber (ANIM.floatRiseMs/Dist in src/config/assets.ts): the two
// layers tune independently. If the scene ticket wants the number standalone
// it extracts to DamageNumber.tsx per plan D4.
const DMG_NUMBER = {
  riseMs: 800, // transition .8s ease-out (rise + fade share one clock)
  risePx: 46, // translateY(-46px)
  offsetX: -12, // left: cx - 12
  offsetY: -8, // top: cy - impactSize/2 - 8
  basicSize: 22,
  specialSize: 30,
  basicColor: "#ffd166",
  specialColor: "#ffe9a3",
} as const;

// fx-engine z-order (60/61/62): projectile under burst under number — all
// inside the stage's effect layer, below HUD chrome (100+) by design.
const Z = { projectile: 60, impact: 61, number: 62 } as const;

// ≈ CSS `ease-out` (cubic-bezier(0, 0, 0.58, 1)) — the damage number's easing
// in fx-engine's inline transition.
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);

export interface ProjectileProps {
  cls: ClassName;
  kind: AttackKind;
  /** Spawn point (weapon tip) in stage coordinates — from computeShotGeometry. */
  from: { x: number; y: number };
  /** Impact X in stage coordinates; impact Y is from.y (straight flight). */
  toX: number;
  /** Number shown on impact (caller supplies — real damage with plan step 6). */
  damage: number;
  /** The moment flight ends — caller triggers Boss.hit(big), HP updates, etc. */
  onImpact?: () => void;
  /** Whole choreography finished (burst AND number) — caller unmounts. */
  onDone?: () => void;
}

/**
 * Props are fixed for the mount's lifetime — one mount per shot, keyed by a
 * shot id. Phases: flight (looping class projectile strip translating right)
 * → impact (one-shot burst + rising damage number) → onDone.
 */
export function Projectile({
  cls,
  kind,
  from,
  toX,
  damage,
  onImpact,
  onDone,
}: ProjectileProps) {
  const special = kind === "special";
  const [phase, setPhase] = useState<"flight" | "impact">("flight");
  const [burstDone, setBurstDone] = useState(false);

  const sizePx = projectileSizePx(kind);
  // fx-engine: impact size = projectile size × 1.3 (× a further 1.25 when big).
  const impactPx =
    sizePx * FX.impactSizeMult * (special ? FX.specialImpactMult : 1);
  const angle = special ? CLASS_FX[cls].specialAngle : CLASS_FX[cls].basicAngle;

  // VFX strips are per-CLASS, shared across jobs (user-approved budget
  // decision); per-job feel comes from the per-job anchors.
  const projKey = `effects/${cls}/${special ? "special" : "basic"}` as SpriteKey;
  const impactKey = `effects/${cls}/impact` as SpriteKey;

  // Flight progress 0→1. Linear easing = constant px/ms (plan D2), which is
  // what makes the flight read as "straight shot", fx-engine parity.
  const flight = useSharedValue(0);
  // Damage-number rise progress 0→1 (translate + fade share it).
  const rise = useSharedValue(0);

  // Latest-callback refs (same pattern as Sprite/Fighter): the animation
  // completions must never call stale closures.
  const onImpactRef = useRef(onImpact);
  onImpactRef.current = onImpact;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // The shot completes when BOTH post-impact effects finish. Today the number
  // (800ms) always outlives the burst (7f / 14fps = 500ms), but gate on both
  // so a retimed strip can't unmount the number early.
  const partsRemaining = useRef(2);
  const partDone = useCallback(() => {
    partsRemaining.current -= 1;
    if (partsRemaining.current === 0) onDoneRef.current?.();
  }, []);

  // Flight ended: swap to the impact phase, notify the caller (boss flash +
  // bump happen THERE — Boss.hit()), and start the damage number's rise.
  const handleImpact = useCallback(() => {
    setPhase("impact");
    onImpactRef.current?.();
    rise.value = withTiming(
      1,
      { duration: DMG_NUMBER.riseMs, easing: EASE_OUT },
      (finished) => {
        "worklet";
        if (finished) scheduleOnRN(partDone);
      },
    );
  }, [partDone, rise]);

  useEffect(() => {
    // fx-engine: dur = clamp((cx1 − cx0) / speedPxMs, 120, 320).
    const durationMs = Math.max(
      FX.flightMinMs,
      Math.min(FX.flightMaxMs, (toX - from.x) / FX.speedPxMs),
    );
    flight.value = withTiming(
      1,
      { duration: durationMs, easing: Easing.linear },
      (finished) => {
        "worklet";
        if (finished) scheduleOnRN(handleImpact);
      },
    );
    return () => {
      cancelAnimation(flight);
      cancelAnimation(rise);
    };
    // One mount per shot: props never change, so this intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE (both styles): the shared value is in the deps ON PURPOSE — on web
  // without the worklets Babel plugin, Reanimated subscribes the updater to
  // the shared values found in the deps array (see the same note in Sprite).
  const flightStyle = useAnimatedStyle(
    () => ({
      // translateX only — Y is fixed by `top`, so the flight is straight by
      // construction (fx-engine keeps cy constant the same way). rotate comes
      // AFTER translate so the sprite-facing angle never bends the path.
      transform: [
        { translateX: (toX - from.x) * flight.value },
        { rotate: `${angle}deg` },
      ],
    }),
    [flight, toX, from.x, angle],
  );

  const numberStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: -DMG_NUMBER.risePx * rise.value }],
      opacity: 1 - rise.value,
    }),
    [rise],
  );

  if (phase === "flight") {
    return (
      <Animated.View
        pointerEvents="none"
        testID="projectile"
        style={[
          styles.abs,
          {
            left: from.x - sizePx / 2,
            top: from.y - sizePx / 2,
            width: sizePx,
            height: sizePx,
            zIndex: Z.projectile,
          },
          flightStyle,
        ]}
      >
        {/* Strip is native-sized (64/96px per manifest); scale it up to the
            display size around the top-left so it fills this box exactly. */}
        <Sprite
          animKey={projKey}
          fps={FX.projFps}
          loop
          style={{
            transform: [{ scale: sizePx / MANIFEST[projKey].w }],
            transformOrigin: "top left",
          }}
        />
      </Animated.View>
    );
  }

  // Impact phase: burst centered at (toX, from.y) — fx-engine's (cx1, cy) —
  // plus the damage number rising from just above the burst.
  return (
    <>
      {!burstDone && (
        <View
          pointerEvents="none"
          testID="impact-burst"
          style={[
            styles.abs,
            {
              left: toX - impactPx / 2,
              top: from.y - impactPx / 2,
              width: impactPx,
              height: impactPx,
              zIndex: Z.impact,
            },
          ]}
        >
          <Sprite
            animKey={impactKey}
            fps={FX.impactFps}
            loop={false}
            onDone={() => {
              // fx-engine removes the burst img after its last frame.
              setBurstDone(true);
              partDone();
            }}
            style={{
              transform: [{ scale: impactPx / MANIFEST[impactKey].w }],
              transformOrigin: "top left",
            }}
          />
        </View>
      )}
      <Animated.View
        pointerEvents="none"
        testID="damage-number"
        style={[
          styles.abs,
          {
            left: toX + DMG_NUMBER.offsetX,
            top: from.y - impactPx / 2 + DMG_NUMBER.offsetY,
            zIndex: Z.number,
          },
          numberStyle,
        ]}
      >
        <Text
          style={[
            styles.numberText,
            {
              fontSize: special ? DMG_NUMBER.specialSize : DMG_NUMBER.basicSize,
              color: special ? DMG_NUMBER.specialColor : DMG_NUMBER.basicColor,
            },
          ]}
        >
          -{damage}
        </Text>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  // fx-engine: font-weight 800, text-shadow 0 2px 3px #000.
  numberText: {
    fontWeight: "800",
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
});

export default Projectile;
