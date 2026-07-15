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
// Event → choreography map (all through the existing feedback stream; the
// overlay treatments — banners/toasts/floating numbers — are untouched, the
// scene is ADDITIVE):
//   • damageDealt/deploy (you)      → your fighter's SPECIAL, impact number =
//                                     the REAL deploy damage (threaded through
//                                     fire(); never the preview's random roll).
//   • damageDealt/teammate          → THAT member's fighter (event userId);
//                                     special when the hit is deploy-sized,
//                                     basic otherwise; their real number.
//   • damageDealt/idle + idleCollected (the auto-collect on open) → a quick
//     staggered basic volley from the whole party; the banked total is split
//     evenly across the volley's impact numbers (sum ≈ the real amount).
//   • bossDefeated                  → nothing here: the banner + victory lap
//     stay with the feedback layer; the CROWNED form swap is reactive state
//     (boss.status === "won" via boss.defeated), not an event.
//   • Overdrive active (you)       → your fighter chains SPECIALS on its
//     cycle turns for the whole ×3 window (ambient flourish — parity-rolled
//     numbers; the real damage lands via the idle channel's collect).
//   • Hero fuel states             → per-fighter kneel via the roster's
//     heroState (Resting ⇒ setResting → rest loop + scene-level z-particles).
//
// A busy fighter ignores orders (mid-swing/resting — Fighter contract), so a
// deploy that collides with another swing retries once after a beat; if the
// fighter is RESTING the swing is skipped entirely (dignified — the overlay
// floating number still shows the damage).
// =============================================================================
import { useEffect, useMemo, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CLASSES, type ClassKey } from "../../convex/gameConfig";
import { useFeedbackEvent } from "../feedback/FeedbackProvider";
import {
  BattleScene,
  type BattleSceneHandle,
  type SceneHero,
} from "./BattleScene";
import type { AttackKind } from "./Fighter";
import { SCENE, type ClassName } from "./fxConfig";

// A teammate hit at/above this size renders as their SPECIAL (deploy-sized),
// below it as a basic (idle-sized). TUNABLE display threshold: typical idle
// collects run hundreds–low thousands, deploys thousands–tens of thousands.
const TEAMMATE_SPECIAL_MIN_DAMAGE = 5_000;

// Volley feel (HTML preview's ATTACK button: staggered basics every 120ms).
const VOLLEY_STAGGER_MS = 120;

// A deploy special that collided with a busy fighter retries once this much
// later (a basic volley clears in well under a second).
const RETRY_MS = 900;

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
  const { heroes, meId } = useMemo(() => {
    if (!members) return { heroes: [] as SceneHero[], meId: null };
    const mine = members.filter((m) => m.isMe);
    const mates = members.filter((m) => !m.isMe);
    const heroes = [...mine, ...mates].slice(0, 8).map(
      (m): SceneHero => ({
        id: m.userId,
        cls: m.class as ClassName,
        job: jobFolderFor(m.class, m.jobLevel),
        resting: m.heroState === "resting",
      }),
    );
    return { heroes, meId: mine[0]?.userId ?? null };
  }, [members]);

  // Latest roster for event handlers/timeouts (no stale closures).
  const heroesRef = useRef(heroes);
  heroesRef.current = heroes;

  const fire = (heroId: string, kind: AttackKind, damage?: number) =>
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

  useFeedbackEvent((e) => {
    if (e.type === "idleCollected") {
      volley(Math.round(e.amount));
      return;
    }
    if (e.type !== "damageDealt") return;
    const amount = Math.round(e.amount);
    switch (e.source) {
      case "deploy": {
        // Your burst hit — the REAL number rides the impact (D5).
        if (!meId) return;
        if (!fire(meId, "special", amount)) {
          setTimeout(() => fire(meId, "special", amount), RETRY_MS);
        }
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

  // Overdrive window (you): chain specials on your cycle turns while the ×3
  // runs — first one a beat after activation, then every cycle.
  const overdriveActive = data?.overdrive.active === true;
  useEffect(() => {
    if (!overdriveActive || !meId) return;
    const first = setTimeout(() => fire(meId, "special"), 600);
    const iv = setInterval(() => fire(meId, "special"), SCENE.cycleMs);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overdriveActive, meId]);

  // The crowned form rises while the week's boss is beaten (status "won" —
  // the same condition that makes the bonus payload non-null).
  const bossKey = data?.boss?.defeated ? "horse_crowned_256" : "horse_256";

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
