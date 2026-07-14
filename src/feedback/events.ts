// The SEMANTIC feedback contract. View code emits these ("what happened in the
// game"); the treatments layer decides how they look. Game logic never imports
// this — it stays a pure description of events.

export type FeedbackEvent =
  | { type: "damageDealt"; amount: number; source: "deploy" | "idle" | "teammate"; crit?: boolean }
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
  | { type: "heroStateChanged"; from: HeroState; to: HeroState };

/** Mirror of the server's FuelState (convex/fuelMath.ts) — duplicated here so
 *  the feedback contract stays free of backend imports. */
export type HeroState = "battling" | "winded" | "resting";
