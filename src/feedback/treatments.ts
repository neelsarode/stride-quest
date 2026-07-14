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
    // --- M1 fuel hybrid (STR-13) ---
    case "heroStateChanged": {
      if (e.to === "battling") {
        // Recovery is a small celebration — the comeback moment.
        juice.haptic("success");
        return {
          banner: {
            variant: "backInFight",
            title: "BACK IN THE FIGHT!",
            subtitle: "Tank refueled — your hero charges back in.",
          },
        };
      }
      if (e.to === "winded") {
        return {
          toast: {
            // Rising out of rest is good news; slipping toward it is a gentle
            // nudge. Either way: the fix is always "walk", never a scold.
            message:
              e.from === "resting"
                ? "Your hero is up — winded but fighting. More steps bring full strength."
                : "Your hero is winded — the tank runs low. Any walk refills it.",
            tone: e.from === "resting" ? "good" : "info",
          },
        };
      }
      // → resting: the dignified kneel (spec §3). Calm, recoverable, NEVER red,
      // no loss language — nothing earned is ever at stake while resting.
      return {
        banner: {
          variant: "heroResting",
          title: "CATCHING BREATH",
          subtitle: "Your hero kneels to rest — any walk rejoins the fight.",
        },
      };
    }
    // --- M1 fuel hybrid (STR-14) ---
    case "overdriveStarted":
      juice.haptic("heavy");
      juice.screenShake();
      return {
        banner: {
          variant: "overdrive",
          title: "OVERDRIVE!",
          subtitle: `×${e.mult} damage for the next ${e.durationHours} hours.`,
        },
      };
    case "overdriveEnded":
      // Quiet close: the reward ran its course — never loss-framed.
      return {
        toast: {
          message: "Overdrive has run its course — back to the steady fight.",
          tone: "info",
        },
      };
    case "actionRejected":
      // Friendly server rejections (ConvexError messages). Calm, never red.
      return { toast: { message: e.message, tone: "info" } };
  }
}
