// =============================================================================
// ConnectedBattleScene — the BattleScene driven by REAL Convex state and the
// live game-event stream (docs/fx-rn-port-plan.md step 6 / decision D5 — the
// point of the whole port, STR-22).
//
// Party composition is the guild roster (guild.overview): per-member class,
// job (weekly progression), and fuel state — your hero takes the FRONT slot
// (foot-aligned with the boss), teammates file in behind in the board's
// damage order. The scene renders whatever the roster provides (1–8 heroes,
// any classes — D5).
//
// TWO layers, decoupled by design (Core Loop v2, spec §5.1 / §5.3 / §8):
//
//   (A) CONTINUOUS idle-attack loop (STR-77) — the fight is now ALIVE. One
//       self-rescheduling timer per roster member throws an AMBIENT basic swing
//       keyed off that member's live fuel state: Battling every
//       SCENE.idleLoopCycleMs, Winded ×windedCycleMult slower, your Overdrive
//       ×overdriveCycleMult faster, Resting = kneels (no swing). Phase-offset
//       per member by index × idleLoopStaggerMs → a staggered wave, not unison.
//       These carry NO damage number (fire(..., null)) — the idle DAMAGE economy
//       is server-settled on interaction, not per-swing; the projectile flies
//       and the boss flashes so the fight reads as alive without lying.
//
//   (B) EVENT-driven layer (over the top; the overlay treatments —
//       banners/toasts/floating numbers — are untouched, the scene is ADDITIVE):
//   • damageDealt/deploy (you)      → a SUPER ATTACK FLURRY (STR-77, §5.3): a
//                                     burst of N buildup basics + a SPECIAL
//                                     finisher, N sized by the BANK (event
//                                     `spent`); the real total is split across
//                                     the impact numbers so they SUM to the real
//                                     damage exactly, finisher largest.
//   • damageDealt/teammate          → THAT member's fighter (event userId);
//                                     special when the hit is deploy-sized,
//                                     basic otherwise; their real number. (No
//                                     flurry for teammates yet — §8.)
//   • damageDealt/idle + idleCollected (the auto-collect on open) → a quick
//     staggered basic volley from the whole party; the banked total is split
//     evenly across the volley's impact numbers (sum ≈ the real amount).
//   • bossDefeated                  → nothing here: the banner + victory lap
//     stay with the feedback layer; the CROWNED form swap is reactive state
//     (boss.status === "won" via boss.defeated), not an event.
//   • Overdrive active (you)       → the retriggered all-day Overdrive's ONLY
//     scene effect is speeding up your CONTINUOUS loop (overdriveCycleMult) —
//     it no longer chains constant ultimates (that was sized for a 4h window;
//     Overdrive is now all-day, so constant specials would be far too much).
//   • Hero fuel states             → per-fighter kneel via the roster's
//     heroState (Resting ⇒ setResting → rest loop + scene-level z-particles).
//
// A busy fighter ignores orders (mid-swing/resting — Fighter contract), so an
// ambient swing that collides with a swing/rest is simply skipped (no retry —
// the next tick comes around shortly), while the flurry POLLS fire() until the
// single fighter is free so every number lands (see runFlurry).
// =============================================================================
import { useEffect, useMemo, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CLASSES, type ClassKey } from "../../convex/gameConfig";
import { useFeedbackEvent } from "../feedback/FeedbackProvider";
import { SUPER_ATTACK } from "../config/assets";
import {
  BattleScene,
  type BattleSceneHandle,
  type SceneHero,
} from "./BattleScene";
import type { AttackKind } from "./Fighter";
import { SCENE, type ClassName } from "./fxConfig";
import { prefetchRosterStrips } from "./prefetch";

// A teammate hit at/above this size renders as their SPECIAL (deploy-sized),
// below it as a basic (idle-sized). TUNABLE display threshold: typical idle
// collects run hundreds–low thousands, deploys thousands–tens of thousands.
const TEAMMATE_SPECIAL_MIN_DAMAGE = 5_000;

// Volley feel (HTML preview's ATTACK button: staggered basics every 120ms).
const VOLLEY_STAGGER_MS = 120;

// A hit that collided with a busy fighter retries once this much later (a basic
// volley clears in well under a second). Used by the teammate/idle single-hit
// paths and the Super Attack fallback.
const RETRY_MS = 900;

// Super Attack flurry dispatch (STR-77, §5.3). A single Fighter serializes
// swings (attack anims are 7–17 frames at 12fps ≈ 0.6–1.4s each), so it cannot
// fire a 110ms barrage back-to-back — a plain "retry once" would DROP most of
// N≥3's hits and the on-screen numbers would no longer sum to the real total
// (the spec's hard invariant). Instead runFlurry() dispatches the hits IN ORDER,
// polling fire() every FLURRY_POLL_MS until the hero is idle enough to take the
// next swing, so every number lands and the finisher is always the last
// projectile (the "BOOM"). Bounded by FLURRY_MAX_ATTEMPTS so a fighter that
// went resting mid-flurry can never leak timers.
const FLURRY_POLL_MS = SUPER_ATTACK.hitStaggerMs;
const FLURRY_MAX_ATTEMPTS = 32; // ~3.5s ceiling per hit — covers the longest swing

// Mirror of the server's FuelState (guild.overview member.heroState) — the
// continuous idle-attack loop keys each member's cadence off this (§5.1).
type HeroState = "battling" | "winded" | "resting";

/** "warrior" + jobLevel 2 → "2_strider" (registry-driven, clamped). */
function jobFolderFor(cls: ClassKey, jobLevel: number): string {
  const folders = CLASSES[cls].jobFolders;
  return folders[Math.max(0, Math.min(folders.length - 1, jobLevel - 1))];
}

export function ConnectedBattleScene({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  const data = useQuery(api.game.dashboard, {});
  const overview = useQuery(api.guild.overview, {});
  const sceneRef = useRef<BattleSceneHandle>(null);

  const members = overview?.members;
  const { heroes, loop, meId } = useMemo(() => {
    if (!members)
      return {
        heroes: [] as SceneHero[],
        loop: [] as { id: string; state: HeroState }[],
        meId: null as string | null,
      };
    const mine = members.filter((m) => m.isMe);
    const mates = members.filter((m) => !m.isMe);
    const ordered = [...mine, ...mates].slice(0, 8);
    const heroes = ordered.map(
      (m): SceneHero => ({
        id: m.userId,
        cls: m.class as ClassName,
        job: jobFolderFor(m.class, m.jobLevel),
        resting: m.heroState === "resting",
      }),
    );
    // Parallel cadence descriptors for the continuous idle-attack loop (§5.1),
    // in the SAME order as `heroes` (front hero i=0) so the stagger index and
    // the on-screen slot line up.
    const loop = ordered.map((m) => ({ id: m.userId, state: m.heroState }));
    return { heroes, loop, meId: mine[0]?.userId ?? null };
  }, [members]);

  // Latest roster for event handlers/timeouts (no stale closures).
  const heroesRef = useRef(heroes);
  heroesRef.current = heroes;

  // Overdrive is active for YOU when the goal-armed window is running (§5.4).
  const overdriveActive = data?.overdrive.active === true;

  // --- latest-state refs for the self-rescheduling ambient timers -----------
  // The continuous loop's timer closures OUTLIVE the render that created them,
  // so they must read live state from refs, NEVER capture it (spec §5.1 / §8).
  // Overdrive + meId live here: they must NOT force a timer rebuild — Overdrive's
  // only scene effect is speeding up YOUR cadence, read live each reschedule. A
  // member's fuel-state change or a roster change DOES rebuild (loopSig below).
  const overdriveActiveRef = useRef(overdriveActive);
  overdriveActiveRef.current = overdriveActive;
  const meIdRef = useRef(meId);
  meIdRef.current = meId;
  // True while YOUR Super Attack flurry owns the fighter — the ambient loop
  // yields meId's swings to it (protects the flurry's exact-sum guarantee).
  const flurryActiveRef = useRef(false);
  // One live self-rescheduling timeout per member id, so a rebuild/unmount can
  // clear exactly the right ones (a leaked timer = a double swing).
  const idleTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const fire = (heroId: string, kind: AttackKind, damage?: number | null) =>
    sceneRef.current?.fire(heroId, kind, damage) ?? false;

  // idleCollect → quick basic volley from the whole party, the banked total
  // split evenly across the hits (sum ≈ the real collected amount).
  const volley = (total: number) => {
    const roster = heroesRef.current;
    if (roster.length === 0) return;
    const share = Math.max(1, Math.round(total / roster.length));
    roster.forEach((h, i) => {
      setTimeout(() => fire(h.id, "basic", share), i * VOLLEY_STAGGER_MS);
    });
  };

  // --- (B) Super Attack flurry dispatch (spec §5.3) -------------------------
  // Fire YOUR flurry hits IN ORDER, each landing before the next starts, so the
  // SPECIAL finisher is always the last projectile (the "BOOM") and every number
  // lands (the on-screen numbers sum to the real total exactly). One Fighter
  // serializes swings, so we POLL fire() until it's idle enough for the next
  // swing rather than dropping hits (see FLURRY_* above), bounded so it can
  // never spin. While it runs, the ambient loop yields meId (flurryActiveRef).
  const runFlurry = (hits: { kind: AttackKind; dmg: number }[]) => {
    const me = meIdRef.current;
    if (!me || hits.length === 0) return;
    flurryActiveRef.current = true;
    let i = 0;
    const step = () => {
      if (i >= hits.length) {
        flurryActiveRef.current = false; // done — ambient resumes on meId
        return;
      }
      const { kind, dmg } = hits[i];
      let attempts = FLURRY_MAX_ATTEMPTS;
      const attempt = () => {
        if (fire(me, kind, dmg)) {
          i += 1;
          setTimeout(step, FLURRY_POLL_MS); // brief gap → rat-a-tat
          return;
        }
        if (--attempts > 0) {
          setTimeout(attempt, FLURRY_POLL_MS); // fighter busy — poll until free
        } else {
          flurryActiveRef.current = false; // gave up (rested?) — never spin
        }
      };
      attempt();
    };
    step();
  };

  useFeedbackEvent((e) => {
    if (e.type === "idleCollected") {
      volley(Math.round(e.amount));
      return;
    }
    if (e.type !== "damageDealt") return;
    const amount = Math.round(e.amount);
    switch (e.source) {
      case "deploy": {
        // Your SUPER ATTACK (§5.3): a combo/flurry whose LENGTH scales with the
        // BANK (energy `spent` = steps since your last Super Attack), not the
        // damage roll, so it honestly visualizes walking. The damage SPLIT still
        // sums to the real total exactly (no economy lie).
        if (!meId) return;
        const spent = e.spent;
        if (spent == null) {
          // No bank on the event (shouldn't happen — the dock emits it): fall
          // back to the classic single special so a number never goes missing.
          if (!fire(meId, "special", amount)) {
            setTimeout(() => fire(meId, "special", amount), RETRY_MS);
          }
          return;
        }
        // N = clamp(round(spent / energyPerHit), minHits, maxHits).
        const N = Math.max(
          SUPER_ATTACK.minHits,
          Math.min(
            SUPER_ATTACK.maxHits,
            Math.round(spent / SUPER_ATTACK.energyPerHit),
          ),
        );
        const buildupCount = N - 1;
        // Damage split (sums to `amount` EXACTLY): the finisher carries
        // finisherFrac PLUS every rounding remainder → the single largest
        // number; the N−1 buildups share the floored rest evenly.
        const finisherBase = Math.round(SUPER_ATTACK.finisherFrac * amount);
        const pool = amount - finisherBase; // the buildups' shared pool
        const each = buildupCount > 0 ? Math.floor(pool / buildupCount) : 0;
        let finisher = finisherBase + (pool - each * buildupCount); // remainder → finisher
        const buildups = Array.from({ length: buildupCount }, () => each);
        // Keep the finisher STRICTLY largest even in the degenerate
        // finisherFrac=0.5 / N=2 / even-total 50-50 (shift 1 pt; sum stays exact).
        if (buildupCount > 0 && finisher <= each) {
          buildups[0] -= 1;
          finisher += 1;
        }
        const hits: { kind: AttackKind; dmg: number }[] = [
          ...buildups.map((dmg) => ({ kind: "basic" as AttackKind, dmg })),
          { kind: "special" as AttackKind, dmg: finisher },
        ];
        runFlurry(hits);
        return;
      }
      case "idle":
        volley(amount);
        return;
      case "teammate": {
        if (!e.userId) return;
        const kind: AttackKind =
          amount >= TEAMMATE_SPECIAL_MIN_DAMAGE ? "special" : "basic";
        if (!fire(e.userId, kind, amount)) {
          setTimeout(() => fire(e.userId!, kind, amount), RETRY_MS);
        }
        return;
      }
    }
  });

  // --- (A) continuous idle-attack loop (spec §5.1 / §8) ---------------------
  // One self-rescheduling timer per non-resting member. The effect REBUILDS the
  // whole timer set whenever the roster identity OR any member's fuel state
  // changes (loopSig) — that decides WHICH members swing and how fast a Winded
  // one is — clearing every old timer first so a leaked/duplicate timer (= a
  // double swing) is impossible. Overdrive is read LIVE from a ref in the tick
  // (it speeds up only YOUR cadence and must not trigger a rebuild). Resting
  // members are skipped (they kneel — the Fighter also refuses orders while
  // resting, so it's belt & suspenders).
  const loopSig = useMemo(
    () => loop.map((m) => `${m.id}:${m.state}`).join(","),
    [loop],
  );
  useEffect(() => {
    const timers = idleTimers.current;
    loop.forEach((m, index) => {
      if (m.state === "resting") return; // kneels — no ambient swing (§5.1)
      // Winded cadence is fixed for this timer's life (a state change rebuilds).
      const windedMult = m.state === "winded" ? SCENE.windedCycleMult : 1;
      // Live period: your Overdrive speeds the loop up; read from the ref so
      // toggling Overdrive needs no rebuild and never captures a stale value.
      const periodFor = () =>
        SCENE.idleLoopCycleMs *
        windedMult *
        (overdriveActiveRef.current && m.id === meIdRef.current
          ? SCENE.overdriveCycleMult
          : 1);
      const tick = () => {
        // Yield to YOUR Super Attack flurry (it owns the single fighter and must
        // land every number); still reschedule so ambient resumes afterward.
        if (!(m.id === meIdRef.current && flurryActiveRef.current)) {
          // Ambient swing — NO damage number (null): the projectile flies and
          // the boss flashes, but the idle economy is server-settled (§5.1).
          sceneRef.current?.fire(m.id, "basic", null);
        }
        timers.set(m.id, setTimeout(tick, periodFor()));
      };
      // First fire offset by index × stagger → the party swings in a wave.
      timers.set(m.id, setTimeout(tick, index * SCENE.idleLoopStaggerMs));
    });
    return () => {
      // Clear ALL timers on unmount AND before every rebuild — no leaks/doubles.
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
    // loopSig fully captures the rebuild triggers; overdrive/meId are live refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopSig]);

  // The crowned form rises while the week's boss is beaten (status "won" —
  // the same condition that makes the bonus payload non-null).
  const bossKey = data?.boss?.defeated ? "horse_crowned_256" : "horse_256";

  // Perf (plan §Perf risks, STR-23): warm exactly the on-screen roster's
  // strips — internal memo makes re-runs on every snapshot free.
  useEffect(() => {
    prefetchRosterStrips(heroes, bossKey);
  }, [heroes, bossKey]);

  return (
    <BattleScene
      ref={sceneRef}
      heroes={heroes}
      bossKey={bossKey}
      style={style}
    />
  );
}

export default ConnectedBattleScene;
