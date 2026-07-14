// =============================================================================
// useGameEvents — turns CHANGES in the reactive dashboard snapshot into feedback
// animations, WITHOUT coupling game logic to animation. The snapshot is server
// truth; this hook just diffs prev vs current and emits semantic events.
// =============================================================================
// Note: the LOCAL player's own deploy/idle-collect are animated directly by their
// action handlers (instant feel). This hook covers PASSIVE/REMOTE changes — a
// job-up from injecting steps, hitting the daily goal, a teammate's contribution
// (added in 2b), and the boss dying. Guards every field so it's safe as the
// dashboard grows across chunks, and never fires on the cold-open snapshot.
// =============================================================================
import { useEffect } from "react";
import { usePrevious } from "./usePrevious";
import { useFeedback } from "./FeedbackProvider";
import type { HeroState } from "./events";

// Loosely typed on purpose — the dashboard shape grows chunk by chunk.
type Snapshot =
  | {
      player?: { jobLevel: number; jobName: string };
      boss?: { id: string; currentHP: number; name: string } | null;
      dailyGoal?: { hit: boolean; goal: number } | null;
      steps?: { today: number };
      fuel?: { state: HeroState };
    }
  | null
  | undefined;

export function useGameEvents(data: Snapshot) {
  const { emit } = useFeedback();
  const prev = usePrevious(data);

  useEffect(() => {
    if (!data || !prev) return; // don't animate the first snapshot

    // Job up (from recording steps across a threshold).
    if (
      data.player &&
      prev.player &&
      data.player.jobLevel > prev.player.jobLevel
    ) {
      emit({
        type: "jobUp",
        from: prev.player.jobLevel,
        to: data.player.jobLevel,
        jobName: data.player.jobName,
      });
    }

    // Daily goal hit (added to the dashboard in chunk 2a-6).
    if (data.dailyGoal && prev.dailyGoal && !prev.dailyGoal.hit && data.dailyGoal.hit) {
      emit({ type: "goalHit", steps: data.steps?.today ?? 0, goal: data.dailyGoal.goal });
    }

    // Boss defeated (HP crossed to 0). The killing hit's number is emitted by the
    // deploy/collect handler; this adds the victory banner.
    if (
      data.boss &&
      prev.boss &&
      data.boss.id === prev.boss.id &&
      data.boss.currentHP === 0 &&
      prev.boss.currentHP > 0
    ) {
      emit({ type: "bossDefeated", bossName: data.boss.name });
    }

    // Hero fuel-state transitions (STR-13): Battling⇄Winded⇄Resting. The
    // treatment keys off from→to (recovery celebrates, resting stays dignified).
    if (data.fuel && prev.fuel && data.fuel.state !== prev.fuel.state) {
      emit({
        type: "heroStateChanged",
        from: prev.fuel.state,
        to: data.fuel.state,
      });
    }
  }, [data, prev, emit]);
}
