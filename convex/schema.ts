// =============================================================================
// STRIDE QUEST — Database schema (Convex)
// =============================================================================
// This is the single source of truth for the shape of all stored data.
// Tables here map 1:1 to the data model in CLAUDE.md.
//
// Design rule (important): `stepEntries` is an APPEND-ONLY ledger. We never edit
// a past row — each step sync writes a brand-new immutable observation. Today's
// total and all game numbers are *derived* from this ledger. That's what lets us
// bolt on anti-cheat later without touching any game logic.
// =============================================================================

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // ---------------------------------------------------------------------------
  // Auth-managed tables (sessions, accounts, tokens, etc.) come from Convex Auth.
  // We spread them in, then OVERRIDE `users` below to add our own profile fields.
  // ---------------------------------------------------------------------------
  ...authTables,

  // users — identity + profile. Extends the Convex Auth user with our fields.
  users: defineTable({
    // --- fields Convex Auth reads/writes (kept so the auth library keeps working)
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // --- our own profile fields
    displayName: v.optional(v.string()),
    // baselineSteps: the player's "typical" daily steps, used for FAIR scoring
    // later (improvement vs. a personal baseline, not raw step totals).
    baselineSteps: v.optional(v.number()),

    // --- Phase 2 account-level meta (PERSISTS across weekly resets) ---
    // Energy is DERIVED: balance = energyEarned(ledger) − energySpent. We store
    // only this monotonic counter (see CLAUDE.md "Energy is derived").
    energySpent: v.optional(v.number()),
    // Daily-deploy streak (account-level, survives the weekly boss reset).
    streakCount: v.optional(v.number()),
    longestStreak: v.optional(v.number()),
    lastDeployDate: v.optional(v.string()), // "YYYY-MM-DD" effective day of last deploy
    // Dev-only simulated teammate bot (never authenticates). Lets us test co-op solo.
    isSimulated: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  // groups — the friend group. Called a "guild" internally. One per player for
  // now, but it's a seam: a user can belong to many guilds later (guild-vs-guild).
  groups: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    createdAt: v.number(),
    // The guild's timezone anchor (minutes, like Date.getTimezoneOffset()). The
    // server uses this to decide the guild's "day"/"week" boundary so all co-op
    // members share ONE boss-week and one streak-day. Captured at bootstrap.
    tzOffsetMinutes: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  // memberships — which user belongs to which guild (its own table so a user can
  // join multiple guilds later and carry per-guild stats).
  memberships: defineTable({
    userId: v.id("users"),
    groupId: v.id("groups"),
    role: v.union(v.literal("owner"), v.literal("member")),
    joinedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_group", ["groupId"])
    .index("by_user_and_group", ["userId", "groupId"]),

  // stepEntries — APPEND-ONLY ledger of step observations. The immutable source
  // of truth. Each row asserts the cumulative step total for `date` as observed
  // at `createdAt`. The client proposes; the server records (never trust client).
  stepEntries: defineTable({
    userId: v.id("users"),
    date: v.string(), // "YYYY-MM-DD" (server-local day)
    stepCount: v.number(), // cumulative total for `date` at time of this reading
    source: v.union(v.literal("healthkit"), v.literal("injector")),
    createdAt: v.number(),
  })
    .index("by_user_and_date", ["userId", "date"])
    .index("by_user", ["userId"]),

  // challenges — the weekly boss for a guild. HP is tuned to the crew's pace.
  challenges: defineTable({
    groupId: v.id("groups"),
    startDate: v.string(), // "YYYY-MM-DD" (Monday)
    endDate: v.string(), // "YYYY-MM-DD" (Sunday)
    bossName: v.string(),
    bossMaxHP: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("won"),
      v.literal("expired"),
    ),
    // Difficulty tier — bumped +1 each time the crew kills a boss (next boss is
    // tougher). Drives bossMaxHP via the formula in gameConfig.
    tier: v.optional(v.number()),
    previousChallengeId: v.optional(v.id("challenges")), // chain, for analytics
    createdAt: v.number(),
  })
    .index("by_group", ["groupId"])
    .index("by_group_and_status", ["groupId", "status"]),

  // challengeProgress — derived per-member stats for the current challenge:
  // damage contributed, current Job XP (cumulative weekly), current Energy
  // (spendable bank). Phase 2 fills these in from the stepEntries ledger.
  challengeProgress: defineTable({
    challengeId: v.id("challenges"),
    groupId: v.id("groups"),
    userId: v.id("users"),
    // The ONE materialized game number: boss HP = bossMaxHP − Σ(damageContributed).
    damageContributed: v.number(),
    // Idle accrual bookkeeping (see Architecture #4): when we last settled idle
    // damage onto the boss, and the idle multiplier in force since then.
    lastIdleCollectedAt: v.optional(v.number()), // effective ms
    idleMultiplierSnapshot: v.optional(v.number()),
    // DEPRECATED in Phase 2 — Job XP and Energy are now DERIVED, not stored.
    // Kept optional so the widen is non-breaking; no longer written.
    jobXp: v.optional(v.number()),
    energy: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_challenge", ["challengeId"])
    .index("by_challenge_and_user", ["challengeId", "userId"])
    .index("by_user", ["userId"]),

  // devState — a single row holding the dev-only mocked-clock offset. Lets the
  // dev tools time-travel (advance day, fast-forward idle). In production this
  // table stays empty → offset 0 → effectiveNow() == real Date.now().
  devState: defineTable({
    key: v.literal("singleton"),
    clockOffsetMs: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
