// The SEMANTIC feedback contract. View code emits these ("what happened in the
// game"); the treatments layer decides how they look. Game logic never imports
// this — it stays a pure description of events.

export type FeedbackEvent =
  | { type: "damageDealt"; amount: number; source: "deploy" | "idle" | "teammate"; crit?: boolean }
  | { type: "jobUp"; from: number; to: number; jobName: string }
  | { type: "idleCollected"; amount: number }
  | { type: "goalHit"; steps: number; goal: number }
  | { type: "bossDefeated"; bossName: string };
