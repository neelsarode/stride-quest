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
import { FEEDBACK } from "../config/assets";
import type { HeroState } from "./events";

// Loosely typed on purpose — the dashboard shape grows chunk by chunk.
type Snapshot =
  | {
      player?: { jobLevel: number; jobName: string };
      boss?: { id: string; currentHP: number; name: string } | null;
      dailyGoal?: { hit: boolean; goal: number } | null;
      steps?: { today: number };
      fuel?: { state: HeroState };
      overdrive?: { active: boolean; durationHours: number; idleDamageMult: number };
      bonus?: {
        bossName: string;
        currentTier: number;
        currentMult: number;
        nextTier: { damageToGo: number; boostMult: number } | null;
      } | null;
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

    // Overdrive window opened/closed (STR-14). Diffing the snapshot (instead
    // of emitting from the button handler) means the banner also fires for a
    // DevPanel activation, and the end toast fires whenever a refresh lands
    // past the 4h mark.
    if (data.overdrive && prev.overdrive) {
      if (data.overdrive.active && !prev.overdrive.active) {
        emit({
          type: "overdriveStarted",
          durationHours: data.overdrive.durationHours,
          mult: data.overdrive.idleDamageMult,
        });
      } else if (!data.overdrive.active && prev.overdrive.active) {
        emit({ type: "overdriveEnded" });
      }
    }

    // The crowned form rises (STR-57): the bonus payload appearing IS the kill
    // (status flipped to "won" in the same write). Sequenced a beat after the
    // FALLS banner above so the two read as victory → escalation. Fire-and-
    // forget timer on purpose: this effect re-runs on every snapshot, and a
    // cleanup would cancel the entrance whenever another update lands early.
    if (data.bonus && !prev.bonus) {
      const bossName = data.bonus.bossName;
      setTimeout(
        () => emit({ type: "bonusBossRises", bossName }),
        FEEDBACK.bonusRiseDelayMs,
      );
    }

    // Bonus tier crossed (STR-57) — the victory week's "kill moment". The
    // payload rides the SAME pure helpers the rollover stamps with, so the
    // mult announced here is exactly what Monday applies.
    if (
      data.bonus &&
      prev.bonus &&
      data.bonus.currentTier > prev.bonus.currentTier
    ) {
      emit({
        type: "bonusTierReached",
        mult: data.bonus.currentMult,
        damageToGo: data.bonus.nextTier?.damageToGo ?? null,
        nextMult: data.bonus.nextTier?.boostMult ?? null,
      });
    }
  }, [data, prev, emit]);
}
