// =============================================================================
// TREATMENTS — the ONE place "semantic event -> placeholder visual" lives.
// =============================================================================
// Each event maps to legible placeholder UI (floating number / banner / toast)
// today, and fires the matching juice stub (no-op now). Swapping placeholders
// for real art/juice later happens here + in juice.ts only.
// =============================================================================
import type { FeedbackEvent } from "./events";
import { FEEDBACK } from "../config/assets";
import type { BannerVariant } from "../config/assets";
import * as juice from "./juice";

export type FloatingSpawn = { text: string; color: string; size: number };
export type BannerSpawn = { variant: BannerVariant; title: string; subtitle?: string };
export type ToastSpawn = { message: string; tone: "info" | "good" };
export type Treatment = {
  floating?: FloatingSpawn;
  banner?: BannerSpawn;
  toast?: ToastSpawn;
};

const n = (x: number) => Math.round(x).toLocaleString();

export function treatmentFor(e: FeedbackEvent): Treatment {
  switch (e.type) {
    case "damageDealt": {
      const crit = !!e.crit;
      juice.haptic(crit ? "heavy" : "light");
      if (crit) juice.screenShake();
      return {
        floating: {
          text: `${crit ? "CRIT! " : "−"}${n(e.amount)}`,
          color: crit ? FEEDBACK.critColor : FEEDBACK.damageColor,
          size: crit ? FEEDBACK.critNumberSize : FEEDBACK.floatNumberSize,
        },
      };
    }
    case "idleCollected":
      return {
        floating: { text: `+${n(e.amount)}`, color: FEEDBACK.idleColor, size: FEEDBACK.floatNumberSize },
        toast: {
          // First-time suffix (STR-49): teach the idle loop exactly once, at
          // the moment it first pays out (self-defers to session 2 — day-1
          // pending idle is 0 by design).
          message: e.firstTime
            ? `While you were away: +${n(e.amount)} damage. Your hero never stops.`
            : `While you were away: +${n(e.amount)} damage`,
          tone: "good",
        },
      };
    case "jobUp":
      juice.haptic("success");
      return { banner: { variant: "jobUp", title: "JOB UP!", subtitle: `${e.jobName} · Job ${e.to}` } };
    case "goalHit":
      juice.haptic("success");
      return { banner: { variant: "goalHit", title: "GOAL HIT!", subtitle: `${n(e.steps)} steps today` } };
    case "bossDefeated":
      juice.haptic("success");
      juice.screenShake(16);
      return { banner: { variant: "bossDefeated", title: `${e.bossName} FALLS`, subtitle: "Victory!" } };
    // --- M2.5 teaching layer (STR-49) ---
    case "bossAppears":
      // Frame the week on the first post-onboarding render (spec Beat 4:
      // "THE SLOTH TYRANT — your guild has until Sunday night.").
      return {
        banner: {
          variant: "bossAppears",
          title: e.bossName.toUpperCase(),
          subtitle: "Your guild has until Sunday night.",
        },
      };
    case "guildJoined":
      // The joiner's welcome ("You're in — Team Sofia grows to 4.").
      juice.haptic("success");
      return {
        banner: {
          variant: "guildJoined",
          title: "YOU'RE IN!",
          subtitle: `${e.guildName} grows to ${e.memberCount}.`,
        },
      };
  }
}
