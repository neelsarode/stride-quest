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
// STR-22; tap-a-hero fires that hero's ultimate — with the preview's rolled
// number in autoPlay (parity), as a numberless ambient swing in live mode
// (real numbers only ever come from fire() — STR-85).
// =============================================================================
import {
  forwardRef,
  memo,
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
import { SCENE, jobRenderScale, type ClassName } from "./fxConfig";
import { computeShotGeometry, Projectile, type Rect } from "./Projectile";
import { RestZzz } from "./RestZzz";
import { SPRITES, type SpriteKey } from "./spriteMap";
import manifestJson from "./sprites/manifest.json";
import { RevealGate } from "../ui/RevealGate";

const MANIFEST = manifestJson as Record<
  SpriteKey,
  { frames: number; w: number; h: number; file: string }
>;

const BACKGROUND = require("../../assets/backgrounds/battlefield_ruins.png");

// Concentric ellipses that fade outward → a cheap soft "blur" for the ground
// shadow (RN has no CSS blur off web, and boxShadow/filter don't render reliably
// on iOS here). Overlapping translucent black layers build a darker core that
// fades to nothing at the edges. Filled into the styles.shadow footprint.
const SHADOW_LAYERS = (
  [
    [0, 0.1],
    [10, 0.12],
    [20, 0.15],
    [30, 0.18],
    [40, 0.2],
  ] as const
).map(([n, opacity]) => {
  const inset = `${n}%` as const;
  return {
    position: "absolute" as const,
    top: inset,
    left: inset,
    right: inset,
    bottom: inset,
    borderRadius: 999,
    backgroundColor: "#000",
    opacity,
  };
});

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
  /** Fires once when the scene's RevealGate reveals (LoadCurtain sync, STR-94). */
  onRevealed?: () => void;
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
  // Deliberately uses the UNSCALED heroPx (this fn doesn't know jobs): with an
  // all-job-1 party (STR-91 shrink) the boss sizes as if they were full height
  // — slightly conservative, never wrong.
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

/**
 * Wrapper geometry for one hero at the STR-91 per-job scale. Fighter scales
 * from LEFT-BOTTOM, so a shrunken box would slide the character backwards out
 * of formation — `leftShift` re-centers it where the full-size sprite's
 * bottom-CENTER anchor stood. Used identically by the render wrapper, the
 * shot-geometry shooter rect, and the RestZzz overlay so they never drift.
 */
function heroBox(cls: ClassName, job: string, baseHeroPx: number) {
  const idle = MANIFEST[`${cls}/${job}/idle` as SpriteKey];
  const aspect = idle.w / idle.h;
  const heroPx = baseHeroPx * jobRenderScale(job);
  const wrapW = heroPx * aspect;
  return { heroPx, wrapW, leftShift: (baseHeroPx * aspect - wrapW) / 2 };
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

// memo (STR-85): ConnectedBattleScene re-renders on EVERY dashboard snapshot
// (fuel/energy tick over constantly) but `heroes` is memoized off the roster,
// `bossKey`/`autoPlay` are primitives, and `style` is a module constant at
// every call site — so memo skips re-rendering the whole stage subtree unless
// the roster/boss actually changed. (The DevPanel parity rig rebuilds its
// heroes array per render; memo is simply a no-op there.)
export const BattleScene = memo(
  forwardRef<BattleSceneHandle, BattleSceneProps>(function BattleScene(
    { heroes, bossKey = "horse_256", autoPlay = false, onRevealed, style },
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
      const heroId = heroesRef.current[index]?.id;
      if (!l || !pos) {
        // No layout/position yet → no projectile can spawn. Drop this swing's
        // queued number too: an orphaned entry would ride a LATER unrelated
        // swing as a stale figure (STR-85 queuedDamage hygiene).
        if (heroId) queuedDamage.current.delete(heroId);
        return;
      }
      const entry = MANIFEST[firedAnimKey(e)];
      // STR-91: job-1 fighters render smaller — the shot geometry must use the
      // SAME scaled box as the Fighter (height AND re-centered left), or
      // projectiles spawn off the weapon.
      const { heroPx, leftShift } = heroBox(e.cls, e.job, l.heroPx);
      const scale = heroPx / entry.h;
      // The rendered frame box: bottom-left pinned at (left, bottom), height
      // exactly the Fighter's displayHeight — the rect the anchor fractions
      // apply to, identical to the HTML's img getBoundingClientRect().
      const shooter: Rect = {
        x: pos.left + leftShift,
        y: l.stageH - pos.bottom - heroPx,
        width: entry.w * scale,
        height: heroPx,
      };
      const bossRect: Rect = {
        x: l.bossLeft,
        y: l.bossTop,
        width: l.bossW,
        height: l.bossH,
      };
      const geo = computeShotGeometry(shooter, e.anchor, bossRect);
      // .has() distinguishes an ambient queued `null` (→ no number) from "no
      // entry queued" (→ the preview's parity roll). A real number rides as-is.
      const hasQueued = heroId != null && queuedDamage.current.has(heroId);
      const queued = hasQueued
        ? (queuedDamage.current.get(heroId!) as number | null)
        : undefined;
      if (heroId) queuedDamage.current.delete(heroId);
      // Only shots whose number came in through fire() carry the exact-sum
      // promise; ambient (null) and autoPlay parity rolls are display flair.
      const carriesRealNumber = hasQueued && queued !== null;
      setShots((s) => {
        const shot: Shot = {
          id: shotId.current++,
          cls: e.cls,
          kind: e.kind,
          ...geo,
          damage: hasQueued ? queued! : rollDamage(e.kind),
        };
        if (s.length < SCENE.maxConcurrentShots) return [...s, shot];
        // AT the perf cap (plan §Perf risks — bounds concurrent Reanimated
        // work). For AMBIENT swings and autoPlay parity rolls the cap stays a
        // HARD limit: the swing still plays, the projectile is skipped (the
        // preview never exceeds it naturally). A REAL-number shot must never
        // be silently swallowed (the on-screen numbers sum to the real damage
        // — the exact-sum promise, STR-85): it EVICTS the oldest ambient shot
        // to take its slot.
        if (!carriesRealNumber) return s;
        const ambientIdx = s.findIndex((x) => x.damage === null);
        if (ambientIdx >= 0)
          return [...s.slice(0, ambientIdx), ...s.slice(ambientIdx + 1), shot];
        // Every in-flight shot carries a real number (practically
        // unreachable: each needs one real swing and fighters serialize
        // swings, so concurrency is bounded by roster size) — admit anyway;
        // a brief 1-shot overshoot beats a vanished number.
        return [...s, shot];
      });
    }, []);

    // queuedDamage hygiene (STR-85): a hero's cls/job change makes Fighter
    // abandon its in-flight swing (the jobKey effect cancels the scheduled
    // release), and a roster removal unmounts the Fighter outright — either
    // way a queued number would orphan and ride a LATER unrelated swing.
    // Fighter must not know about the scene's map, so the scene watches the
    // same signals (hero id + job key) and clears the entry here.
    const jobKeys = useRef(new Map<string, string>());
    useEffect(() => {
      const seen = new Map<string, string>();
      for (const h of heroes) {
        const key = `${h.cls}/${h.job}`;
        const prev = jobKeys.current.get(h.id);
        if (prev !== undefined && prev !== key)
          queuedDamage.current.delete(h.id);
        seen.set(h.id, key);
      }
      for (const id of [...queuedDamage.current.keys()]) {
        if (!seen.has(id)) queuedDamage.current.delete(id);
      }
      jobKeys.current = seen;
    }, [heroes]);

    // --- imperative attack orders (the event wiring's entry point) ----------
    // Shared by the ref handle's fire() AND tap-a-hero below, so BOTH paths
    // run the queue/restore protocol (a tap that bypassed it was how the
    // parity roll leaked fabricated numbers into production — STR-85).
    const orderAttack = useCallback(
      (heroId: string, kind: AttackKind, damage?: number | null): boolean => {
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
      [],
    );
    useImperativeHandle(ref, () => ({ fire: orderAttack }), [orderAttack]);

    // --- fade-in from black (STR-94): gate the WHOLE scene behind its own
    // asset probes so it never renders in piecemeal (bg, then boss, then
    // heroes "typing in" as each strip decodes). The stage is black; fading
    // the children in as one unit IS the fade-from-black. Probes cover what's
    // visible at t=0 (bg + boss idle + every hero's idle strip) — attack/
    // special strips keep prefetching in the background and are only needed
    // seconds later. `ready` blocks an EMPTY roster (Connected mounts with []
    // until the first snapshot); maxWait still guarantees a reveal.
    const rosterSig = heroes.map((h) => `${h.cls}/${h.job}`).join(",");
    const sceneAssets = useMemo(() => {
      const list = [BACKGROUND, SPRITES[`bosses/${bossKey}/idle` as SpriteKey]];
      for (const h of heroes) {
        const strip = SPRITES[`${h.cls}/${h.job}/idle` as SpriteKey];
        if (strip != null) list.push(strip);
      }
      return list;
      // rosterSig captures exactly the strip-relevant identity of `heroes`.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rosterSig, bossKey]);

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
        <RevealGate
          waitFor={sceneAssets}
          ready={heroes.length > 0}
          minHold={350}
          maxWait={4000}
          duration={320}
          onRevealed={onRevealed}
          style={StyleSheet.absoluteFill}
        >
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
              // STR-91: job-1s draw at SCENE.job1Scale — feet stay on the
              // formation line (bottom anchor) and leftShift keeps them
              // CENTERED where the full-size sprite stood (Fighter scales
              // from left-bottom, which would otherwise slide them back).
              const { heroPx, wrapW, leftShift } = heroBox(
                hero.cls,
                hero.job,
                layout.heroPx,
              );
              return (
                <Pressable
                  key={hero.id}
                  testID={`scene-hero-${i}`}
                  // Tap a hero → fire their ultimate now. In autoPlay (the
                  // DevPanel timer-parity QA rig, ≙ battlefield-ui.html) the
                  // swing keeps the preview's rolled number (`undefined` →
                  // parity roll); in LIVE mode it routes through the ambient
                  // path (`null` → flair only, NO floating number) so a tap
                  // can never float a fabricated figure (STR-85).
                  onPress={() =>
                    orderAttack(hero.id, "special", autoPlay ? undefined : null)
                  }
                  style={{
                    position: "absolute",
                    left: pos.left + leftShift,
                    bottom: pos.bottom,
                    width: wrapW,
                    height: heroPx,
                    zIndex: pos.z,
                  }}
                >
                  <View style={styles.shadow} pointerEvents="none">
                    {SHADOW_LAYERS.map((s, li) => (
                      <View key={li} style={s} />
                    ))}
                  </View>
                  <Fighter
                    ref={(h) => {
                      fighters.current[i] = h;
                      // Initial rest state (effect above covers changes).
                      if (h && hero.resting) h.setResting(true);
                    }}
                    cls={hero.cls}
                    job={hero.job}
                    displayHeight={heroPx}
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
              const { heroPx, leftShift } = heroBox(
                hero.cls,
                hero.job,
                layout.heroPx,
              );
              return (
                <RestZzz
                  key={`zzz-${hero.id}`}
                  left={pos.left + leftShift}
                  top={layout.stageH - pos.bottom - heroPx}
                  width={heroPx}
                  height={heroPx}
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
        </RevealGate>
      </View>
    );
  }),
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
  // Soft ground shadow footprint, centred under the character's FEET — bottom is
  // a PERCENTAGE (not px) because the sprite frame carries ~27% transparent
  // padding below the feet; a fixed offset dropped the shadow far below the
  // character (into the lower grass), which is why it read as a detached bar.
  // The % scales with each hero's size, so front (big) and back (small) rows
  // both land at the feet. Filled by SHADOW_LAYERS for a soft edge.
  shadow: {
    position: "absolute",
    left: "26%",
    bottom: "27%",
    width: "48%",
    height: 14,
  },
  // Native frame box pinned bottom-left of the wrapper; the displayHeight
  // scale (origin left-bottom) grows it to fill the wrapper exactly.
  fighter: { position: "absolute", left: 0, bottom: 0 },
});

export default BattleScene;
