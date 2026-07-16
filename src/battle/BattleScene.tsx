// =============================================================================
// BattleScene — the full party-vs-boss stage (docs/fx-rn-port-plan.md step 5,
// STR-21; layout + choreography ≙ battlefield-ui.html's inline script).
//
// Composition: background → boss (auto-scaled, right edge overhanging) → the
// party in two staggered columns (front hero bottom-right, rows stepping up
// and back) → the effect layer (projectiles z60, bursts z61, numbers z62 —
// fx-engine z-order, all below HUD chrome by design).
//
// PARITY ADAPTATIONS (documented — the HTML preview stays the reference):
//   1. The HTML positions with CSS `calc(% ± px)`; RN has no calc(), so
//      computeSceneLayout() derives every px value from the stage's onLayout
//      size. Same constants (fxConfig SCENE), same math, same result.
//   2. Shot geometry uses that SAME layout math instead of re-measuring DOM
//      rects: positions are set BY these numbers, so deriving rects from them
//      is exact — and anchors stay fractions of the rendered frame (D3: the
//      spawn point is the measured weapon tip, never a box edge).
//   3. `object-position: 50% 35%` on the background has no RN equivalent —
//      resizeMode "cover" centers at 50%/50% (slight vertical framing delta).
//   4. Shadow blur + boss drop-shadow are CSS filters; applied on web via
//      react-native-web's style passthrough, skipped on native (crisp ellipse
//      shadow there — visual polish noted for the iOS pass).
//
// ROSTER: renders WHATEVER it's given (1–8 heroes, any classes, any jobs) —
// party composition comes from the caller (guild roster with plan step 6);
// nothing here assumes 8 heroes or all classes (D5).
//
// DRIVERS: `autoPlay` runs the preview's idle choreography (basics every
// cycle staggered down the party, every-4th = special) — the STR-21 parity
// mode. Real Convex events drive the scene through the `fire()` handle with
// STR-22; tap-a-hero always fires that hero's ultimate (preview parity).
// =============================================================================
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { FX_SPECIAL_ANCHORS } from "./anchors";
import { Boss, type BossHandle, type BossKey } from "./Boss";
import {
  Fighter,
  type AttackKind,
  type FighterHandle,
  type FighterMode,
  type ReleaseEvent,
} from "./Fighter";
import { SCENE, type ClassName } from "./fxConfig";
import { computeShotGeometry, Projectile, type Rect } from "./Projectile";
import { RestZzz } from "./RestZzz";
import type { SpriteKey } from "./spriteMap";
import manifestJson from "./sprites/manifest.json";

const MANIFEST = manifestJson as Record<
  SpriteKey,
  { frames: number; w: number; h: number; file: string }
>;

const BACKGROUND = require("../../assets/backgrounds/battlefield_beach.png");

/** One party member as the scene needs it. */
export interface SceneHero {
  /** Stable identity (member userId with plan step 6; demo keys until then). */
  id: string;
  cls: ClassName;
  /** Job folder key, e.g. "5_warlord". */
  job: string;
  /** Out-of-fuel kneel (fx setResting semantics — attacks ignored while true). */
  resting?: boolean;
}

export interface BattleSceneProps {
  heroes: SceneHero[];
  bossKey?: BossKey;
  /** Run the preview's timer choreography (STR-21 parity mode). Default off —
   *  the real app drives attacks from game events via the ref handle. */
  autoPlay?: boolean;
  style?: StyleProp<ViewStyle>;
}

export interface BattleSceneHandle {
  /**
   * Order a hero's attack. `damage` shows on the impact number:
   *   • a number → that exact figure rides the impact (real deploy/idle amount),
   *   • `null`   → an AMBIENT swing (Core Loop v2 §5.1, STR-77): projectile flies
   *                and the boss flashes, but NO floating number (the idle economy
   *                is server-settled, not per-swing),
   *   • omitted  → the preview's parity roll (autoPlay / tap-to-ult).
   * Returns false when ignored (unknown hero / not idle / resting).
   */
  fire(heroId: string, kind: AttackKind, damage?: number | null): boolean;
}

// --- layout math (pure port of battlefield-ui.html's constants + sizeBoss) ---

export interface SceneLayout {
  phone: boolean;
  stageW: number;
  stageH: number;
  heroPx: number; // display height of every hero
  heroes: { left: number; bottom: number; z: number }[];
  bossH: number;
  bossW: number; // == bossH (256×256 square art)
  bossLeft: number;
  bossTop: number;
}

/**
 * All positions in px within a stage of (w × h) — the RN stand-in for the
 * HTML's `calc(% ± px)` styles (adaptation #1). `bossTopPad` is the measured
 * first-visible-pixel fraction of the current boss form (SCENE.bossTopPad).
 */
export function computeSceneLayout(
  w: number,
  h: number,
  heroCount: number,
  bossTopPad: number,
): SceneLayout {
  const phone = w <= SCENE.phoneMaxWidth;
  const pxPerSrc = phone ? SCENE.pxPerSrcPhone : SCENE.pxPerSrcDesktop;
  const heroPx = SCENE.srcHero * pxPerSrc;
  const bossMin = SCENE.srcBoss * pxPerSrc;
  const stepPct = phone ? SCENE.partyStepPctPhone : SCENE.partyStepPctDesktop;

  const heroes = Array.from({ length: heroCount }, (_, i) => ({
    // Front hero (i=0) on the RIGHT column, alternating back-left/back-right.
    left:
      ((i % 2 === 0 ? SCENE.colRightPct : SCENE.colLeftPct) / 100) * w +
      SCENE.partyDx,
    bottom: ((SCENE.partyBasePct + i * stepPct) / 100) * h - SCENE.partyDy,
    z: SCENE.heroZFront - i,
  }));

  // sizeBoss() port: the boss's VISIBLE top (its box top + topPad·height) must
  // reach the top party member's head (their box top + heroTopPad·height).
  const bossBottomY = h * (1 - SCENE.bossBottomPct);
  let bossH = bossMin;
  if (heroCount > 0) {
    const top = heroes[heroCount - 1];
    const partyTopY = h - top.bottom - heroPx + heroPx * SCENE.heroTopPad;
    bossH = Math.max(bossMin, (bossBottomY - partyTopY) / (1 - bossTopPad));
  }
  const bossW = bossH; // square art

  return {
    phone,
    stageW: w,
    stageH: h,
    heroPx,
    heroes,
    bossH,
    bossW,
    // right:0 + translateX(30%) ⇒ the box overhangs the right edge by 30% of
    // its own width.
    bossLeft: w - (1 - SCENE.bossOverhangFrac) * bossW,
    bossTop: bossBottomY - bossH,
  };
}

// fx-engine impactAt's parity damage roll — used until real damage rides in
// through fire() (plan step 6 threads the actual amounts).
function rollDamage(kind: AttackKind): number {
  return kind === "special"
    ? 9000 + Math.floor(Math.random() * 3000)
    : 1800 + Math.floor(Math.random() * 900);
}

/** The anim a swing renders with (Fighter's special→attack fallback rule). */
function firedAnimKey(e: ReleaseEvent): SpriteKey {
  const name =
    e.kind === "special" && FX_SPECIAL_ANCHORS[`${e.cls}/${e.job}`]
      ? "special"
      : "attack";
  return `${e.cls}/${e.job}/${name}` as SpriteKey;
}

interface Shot {
  id: number;
  cls: ClassName;
  kind: AttackKind;
  from: { x: number; y: number };
  toX: number;
  // null → ambient swing (no floating number, Core Loop v2 §5.1); a number →
  // the exact figure; see BattleSceneHandle.fire.
  damage: number | null;
}

export const BattleScene = forwardRef<BattleSceneHandle, BattleSceneProps>(
  function BattleScene(
    { heroes, bossKey = "horse_256", autoPlay = false, style },
    ref,
  ) {
    const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
    const [shots, setShots] = useState<Shot[]>([]);
    // Heroes whose Fighter MODE is "rest" (not the resting PROP: a mid-swing
    // fighter finishes first) — drives the scene-level z-particle overlay.
    const [restingIds, setRestingIds] = useState<ReadonlySet<string>>(
      () => new Set(),
    );
    const shotId = useRef(0);
    const bossRef = useRef<BossHandle>(null);
    const fighters = useRef<(FighterHandle | null)[]>([]);
    // Damage queued by fire() for the hero's NEXT release (a fighter has at
    // most one swing in flight — attacks only arm from idle — so one slot per
    // hero id suffices). A queued value of `null` marks an ambient swing (Core
    // Loop v2 §5.1) — distinct from "no entry" (parity roll), so the map holds
    // number | null and we test membership with .has().
    const queuedDamage = useRef(new Map<string, number | null>());

    const layout = useMemo(
      () =>
        stage
          ? computeSceneLayout(
              stage.w,
              stage.h,
              heroes.length,
              SCENE.bossTopPad[bossKey] ?? 0,
            )
          : null,
      [stage, heroes.length, bossKey],
    );
    // The release callback needs the CURRENT layout without re-arming anything.
    const layoutRef = useRef(layout);
    layoutRef.current = layout;
    const heroesRef = useRef(heroes);
    heroesRef.current = heroes;

    const onStageLayout = (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setStage((s) =>
        s && s.w === width && s.h === height ? s : { w: width, h: height },
      );
    };

    // Rest sync: prop → imperative fighter state (initial value is applied by
    // the ref callback below; this covers every later change).
    useEffect(() => {
      heroes.forEach((h, i) => fighters.current[i]?.setResting(!!h.resting));
    }, [heroes]);

    // Z-overlay bookkeeping: track rest MODE per hero id, and prune ids that
    // left the roster.
    const handleModeChange = useCallback((heroId: string, mode: FighterMode) => {
      setRestingIds((prev) => {
        const isRest = mode === "rest";
        if (prev.has(heroId) === isRest) return prev;
        const next = new Set(prev);
        if (isRest) next.add(heroId);
        else next.delete(heroId);
        return next;
      });
    }, []);
    useEffect(() => {
      setRestingIds((prev) => {
        const alive = new Set(heroes.map((h) => h.id));
        const next = new Set([...prev].filter((id) => alive.has(id)));
        return next.size === prev.size ? prev : next;
      });
    }, [heroes]);

    // --- release → projectile (the full choreography, D3 geometry) ----------
    const handleRelease = useCallback((index: number, e: ReleaseEvent) => {
      const l = layoutRef.current;
      const pos = l?.heroes[index];
      if (!l || !pos) return;
      const entry = MANIFEST[firedAnimKey(e)];
      const scale = l.heroPx / entry.h;
      // The rendered frame box: bottom-left pinned at (left, bottom), height
      // exactly heroPx (Fighter displayHeight) — the rect the anchor fractions
      // apply to, identical to the HTML's img getBoundingClientRect().
      const shooter: Rect = {
        x: pos.left,
        y: l.stageH - pos.bottom - l.heroPx,
        width: entry.w * scale,
        height: l.heroPx,
      };
      const bossRect: Rect = {
        x: l.bossLeft,
        y: l.bossTop,
        width: l.bossW,
        height: l.bossH,
      };
      const geo = computeShotGeometry(shooter, e.anchor, bossRect);
      const heroId = heroesRef.current[index]?.id;
      // .has() distinguishes an ambient queued `null` (→ no number) from "no
      // entry queued" (→ the preview's parity roll). A real number rides as-is.
      const hasQueued = heroId != null && queuedDamage.current.has(heroId);
      const queued = hasQueued
        ? (queuedDamage.current.get(heroId!) as number | null)
        : undefined;
      if (heroId) queuedDamage.current.delete(heroId);
      setShots((s) => {
        // Perf cap (plan §Perf risks): past the cap the swing still plays but
        // the projectile is skipped; the preview never exceeds this naturally.
        if (s.length >= SCENE.maxConcurrentShots) return s;
        return [
          ...s,
          {
            id: shotId.current++,
            cls: e.cls,
            kind: e.kind,
            ...geo,
            damage: hasQueued ? queued! : rollDamage(e.kind),
          },
        ];
      });
    }, []);

    // --- imperative attack orders (the event wiring's entry point) ----------
    useImperativeHandle(
      ref,
      () => ({
        fire(heroId, kind, damage) {
          const index = heroesRef.current.findIndex((h) => h.id === heroId);
          const f = index >= 0 ? fighters.current[index] : null;
          if (!f) return false;
          // Capture any queued damage already waiting on this hero (an armed,
          // not-yet-released swing's number) so a REJECTED fire (fighter busy)
          // RESTORES it instead of nuking it. Core Loop v2 (STR-77) fires the
          // SAME hero rapidly — the continuous idle loop can collide with a real
          // event swing, and the Super Attack flurry polls while its own swing
          // is in flight — so a failed attempt must never corrupt the in-flight
          // swing's number (which would surface as a parity-roll fallback).
          const hadPrev = queuedDamage.current.has(heroId);
          const prev = hadPrev ? queuedDamage.current.get(heroId) : undefined;
          if (damage !== undefined) queuedDamage.current.set(heroId, damage);
          const ok = kind === "special" ? f.special() : f.basic();
          if (!ok && damage !== undefined) {
            if (hadPrev) queuedDamage.current.set(heroId, prev as number | null);
            else queuedDamage.current.delete(heroId);
          }
          return ok;
        },
      }),
      [],
    );

    // --- idle choreography (timer parity: CYCLE/STAGGER/SPECIAL_EVERY) ------
    useEffect(() => {
      if (!autoPlay) return;
      let cycle = 0;
      const pending = new Set<ReturnType<typeof setTimeout>>();
      const iv = setInterval(() => {
        cycle++;
        heroesRef.current.forEach((_, i) => {
          const t = setTimeout(() => {
            pending.delete(t);
            const f = fighters.current[i];
            if (!f) return;
            // Resting fighters ignore orders by construction (Fighter parity).
            if ((cycle + i) % SCENE.specialEvery === 0) f.special();
            else f.basic();
          }, i * SCENE.staggerMs);
          pending.add(t);
        });
      }, SCENE.cycleMs);
      return () => {
        clearInterval(iv);
        pending.forEach(clearTimeout);
      };
    }, [autoPlay, heroes.length]);

    return (
      <View style={[styles.stage, style]} onLayout={onStageLayout} testID="battle-scene">
        <Image
          source={BACKGROUND}
          style={styles.bg}
          resizeMode="cover"
          fadeDuration={0}
        />
        {layout && (
          <>
            <Boss
              ref={bossRef}
              bossKey={bossKey}
              heightPx={layout.bossH}
              style={[
                {
                  position: "absolute",
                  left: layout.bossLeft,
                  top: layout.bossTop,
                  zIndex: 1,
                },
                BOSS_SHADOW,
              ]}
            />
            {heroes.map((hero, i) => {
              const pos = layout.heroes[i];
              const idleEntry = MANIFEST[`${hero.cls}/${hero.job}/idle` as SpriteKey];
              const wrapW = layout.heroPx * (idleEntry.w / idleEntry.h);
              return (
                <Pressable
                  key={hero.id}
                  testID={`scene-hero-${i}`}
                  // Tap a hero → fire their ultimate now (preview parity).
                  onPress={() => fighters.current[i]?.special()}
                  style={{
                    position: "absolute",
                    left: pos.left,
                    bottom: pos.bottom,
                    width: wrapW,
                    height: layout.heroPx,
                    zIndex: pos.z,
                  }}
                >
                  <View style={styles.shadow} />
                  <Fighter
                    ref={(h) => {
                      fighters.current[i] = h;
                      // Initial rest state (effect above covers changes).
                      if (h && hero.resting) h.setResting(true);
                    }}
                    cls={hero.cls}
                    job={hero.job}
                    displayHeight={layout.heroPx}
                    onRelease={(e) => handleRelease(i, e)}
                    onModeChange={(m) => handleModeChange(hero.id, m)}
                    style={styles.fighter}
                  />
                </Pressable>
              );
            })}
            {/* Scene-level z-particles over every KNEELING fighter (STR-22 —
                the overlay effect deferred from the Fighter ticket). */}
            {heroes.map((hero, i) => {
              if (!restingIds.has(hero.id)) return null;
              const pos = layout.heroes[i];
              if (!pos) return null;
              return (
                <RestZzz
                  key={`zzz-${hero.id}`}
                  left={pos.left}
                  top={layout.stageH - pos.bottom - layout.heroPx}
                  width={layout.heroPx}
                  height={layout.heroPx}
                />
              );
            })}
            {shots.map((s) => (
              <Projectile
                key={s.id}
                cls={s.cls}
                kind={s.kind}
                from={s.from}
                toX={s.toX}
                damage={s.damage}
                onImpact={() => bossRef.current?.hit(s.kind === "special")}
                onDone={() =>
                  setShots((prev) => prev.filter((x) => x.id !== s.id))
                }
              />
            ))}
          </>
        )}
      </View>
    );
  },
);

// Boss drop-shadow (HTML: filter drop-shadow(0 14px 10px rgba(0,0,0,.5))) —
// web-only CSS passthrough (adaptation #4).
const BOSS_SHADOW =
  Platform.OS === "web"
    ? ({ filter: "drop-shadow(0 14px 10px rgba(0,0,0,0.5))" } as object)
    : null;

const styles = StyleSheet.create({
  stage: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  bg: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
  },
  // .hero .shadow parity: ellipse at 66% width centered, 4px above the feet.
  // blur(5px) is web-only (adaptation #4); native gets the crisp ellipse.
  shadow: {
    position: "absolute",
    left: "17%",
    bottom: 4,
    width: "66%",
    height: 15,
    borderRadius: 999,
    backgroundColor: "#000",
    opacity: 0.65,
    ...(Platform.OS === "web" ? ({ filter: "blur(5px)" } as object) : null),
  },
  // Native frame box pinned bottom-left of the wrapper; the displayHeight
  // scale (origin left-bottom) grows it to fill the wrapper exactly.
  fighter: { position: "absolute", left: 0, bottom: 0 },
});

export default BattleScene;
