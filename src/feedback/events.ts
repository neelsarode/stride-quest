// The SEMANTIC feedback contract. View code emits these ("what happened in the
// game"); the treatments layer decides how they look. Game logic never imports
// this — it stays a pure description of events.

export type FeedbackEvent =
  // userId attributes a teammate's hit to its member (the battle scene fires
  // THAT fighter's attack — STR-22); absent for your own deploy/idle hits.
  | {
      type: "damageDealt";
      amount: number;
      source: "deploy" | "idle" | "teammate";
      crit?: boolean;
      userId?: string;
    }
  | { type: "jobUp"; from: number; to: number; jobName: string }
  // firstTime (STR-49 teaching layer): the account's FIRST idle collect that
  // banked damage — the toast gains the one-time "Your hero never stops."
  // suffix. Keyed by server state (dashboard.hasEverCollectedIdle).
  | { type: "idleCollected"; amount: number; firstTime?: boolean }
  | { type: "goalHit"; steps: number; goal: number }
  | { type: "bossDefeated"; bossName: string }
  // --- M2.5 teaching layer (STR-49, spec §Teaching Layer) ---
  // First post-onboarding render: frame the week ("…until Sunday night").
  | { type: "bossAppears"; bossName: string }
  // A joiner landed in a friend's guild (the founder path stays quiet — the
  // code reveal IS that moment). memberCount = the guild size including them.
  | { type: "guildJoined"; guildName: string; memberCount: number }
  // --- M1 fuel hybrid (STR-13) ---
  // The hero's fuel state crossed a boundary (Battling⇄Winded⇄Resting).
  // Resting is DIGNIFIED (spec §3): its treatment is calm, never red/shaming;
  // recovering to Battling is a small celebration.
  | { type: "heroStateChanged"; from: HeroState; to: HeroState }
  // --- M1 fuel hybrid (STR-14) ---
  // Overdrive window opened/closed (diffed from the reactive snapshot, so the
  // banner also fires when a DevPanel activation lands). Ending is quiet —
  // the reward ran its course; nothing was lost (never loss-frame a bonus).
  | { type: "overdriveStarted"; durationHours: number; mult: number }
  | { type: "overdriveEnded" }
  // A server-side rejection with a friendly ConvexError message (rally daily
  // limit, uncharged overdrive, …). Always a calm info toast, never red.
  | { type: "actionRejected"; message: string }
  // --- M1 fuel hybrid (STR-15) ---
  // A teammate's rally landed in YOUR tank — the welcome-back celebration,
  // named after the sender (the nudge comes from a friend, not the app).
  | { type: "rallyReceived"; senderName: string; hours: number }
  // You sent one — make the giver feel generous (toast, quieter than the
  // receiver's banner).
  | { type: "rallySent"; receiverName: string; hours: number }
  // --- M1.5 Bonus Boss / victory week (STR-57) ---
  // The crowned form rises the moment the weekly boss falls (sequenced after
  // the FALLS banner). bossName is already the crowned name.
  | { type: "bonusBossRises"; bossName: string }
  // The party's accumulating meter crossed a tier threshold — the phase's
  // "kill moment". A crossed tier can never be un-crossed (the meter only
  // counts up), so "secured" is honest. nextMult/damageToGo null at max tier.
  | {
      type: "bonusTierReached";
      mult: number;
      damageToGo: number | null;
      nextMult: number | null;
    }
  // The Monday reward is in force: last week's bonus damage became this
  // week's guild-wide power. Fires once per challenge per app session.
  | { type: "boostActive"; mult: number; sourceDamage: number };

/** Mirror of the server's FuelState (convex/fuelMath.ts) — duplicated here so
 *  the feedback contract stays free of backend imports. */
export type HeroState = "battling" | "winded" | "resting";
