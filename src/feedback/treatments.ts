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
import { fmtCompact } from "../format";
import * as juice from "./juice";

export type FloatingSpawn = { text: string; color: string; size: number };
export type BannerSpawn = { variant: BannerVariant; title: string; subtitle?: string };
export type ToastSpawn = { message: string; tone: "info" | "good" };
export type Treatment = {
  floating?: FloatingSpawn;
  banner?: BannerSpawn;
  toast?: ToastSpawn;
};

// `n` — grouped digits, for STEP counts (unscaled step space). Damage/HP figures
// use fmtCompact instead ("1.4M") so scaled millions can't overflow the tiny
// floating-number labels (see src/format.ts).
const n = (x: number) => Math.round(x).toLocaleString();

export function treatmentFor(e: FeedbackEvent): Treatment {
  switch (e.type) {
    case "damageDealt": {
      const crit = !!e.crit;
      juice.haptic(crit ? "heavy" : "light");
      if (crit) juice.screenShake();
      return {
        floating: {
          text: `${crit ? "CRIT! " : "−"}${fmtCompact(e.amount)}`,
          color: crit ? FEEDBACK.critColor : FEEDBACK.damageColor,
          size: crit ? FEEDBACK.critNumberSize : FEEDBACK.floatNumberSize,
        },
      };
    }
    case "idleCollected":
      return {
        floating: { text: `+${fmtCompact(e.amount)}`, color: FEEDBACK.idleColor, size: FEEDBACK.floatNumberSize },
        toast: {
          // First-time suffix (STR-49): teach the idle loop exactly once, at
          // the moment it first pays out (self-defers to session 2 — day-1
          // pending idle is 0 by design).
          message: e.firstTime
            ? `While you were away: +${fmtCompact(e.amount)} damage. Your hero never stops.`
            : `While you were away: +${fmtCompact(e.amount)} damage`,
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
      // Automatic on the goal-cross now (Core Loop v2 §5.4): ×N all day, until
      // the daily reset — no fixed-hours copy (durationHours is gone).
      juice.haptic("heavy");
      juice.screenShake();
      return {
        banner: {
          variant: "overdrive",
          title: `OVERDRIVE ×${e.mult} — ALL DAY!`,
          subtitle: `×${e.mult} damage on idle AND your Super Attack, until the daily reset.`,
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
    // --- M1 fuel hybrid (STR-15) ---
    case "rallyReceived":
      // The welcome-back moment: a FRIEND woke you, by name — celebratory,
      // never guilt-flavored (spec §5 design intent).
      juice.haptic("success");
      return {
        banner: {
          variant: "rallyReceived",
          title: `${e.senderName.toUpperCase()} RALLIED YOU!`,
          subtitle: `+${e.hours} hours of fight time — welcome back to the front.`,
        },
      };
    case "rallySent":
      // The giver's glow: generous, quieter than the receiver's banner.
      return {
        toast: {
          message: `Rally sent — ${e.receiverName} fights on with ${e.hours} more hours. That was generous.`,
          tone: "good",
        },
      };
    // --- M1.5 Bonus Boss / victory week (STR-57) ---
    case "bonusBossRises":
      juice.haptic("heavy");
      juice.screenShake(12);
      return {
        banner: {
          variant: "bonusRises",
          title: `THE ${e.bossName.toUpperCase()} RISES`,
          subtitle: "Every hit counts toward next week's power.",
        },
      };
    case "bonusTierReached":
      // A tier can never be lost once crossed (the meter only counts up), so
      // "secured" is honest — and the chase line points at the next one.
      juice.haptic("success");
      juice.screenShake();
      return {
        banner: {
          variant: "bonusTier",
          title: `×${e.mult} POWER SECURED`,
          subtitle:
            e.nextMult != null && e.damageToGo != null
              ? `${fmtCompact(e.damageToGo)} more damage reaches ×${e.nextMult}.`
              : "Top tier — the crown has no more to give.",
        },
      };
    case "boostActive":
      // The Monday payoff, shared by the whole crew (spec §6 reward banner).
      juice.haptic("success");
      return {
        banner: {
          variant: "boostActive",
          title: `×${e.mult} POWER ALL WEEK!`,
          subtitle: `The crew dealt ${fmtCompact(e.sourceDamage)} bonus damage last week.`,
        },
      };
  }
}
