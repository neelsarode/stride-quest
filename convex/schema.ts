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
import { CLASS_KEYS } from "./gameConfig";

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

    // --- M2.5 onboarding (STR-42) ---
    // Chosen hero class. Optional because mid-onboarding and legacy (warrior-
    // only MVP) users have none — every read falls back via
    // `user.class ?? MVP_CLASS`. The validator is DERIVED from the CLASSES
    // registry so adding a class stays a data-only change in gameConfig.ts.
    class: v.optional(v.union(...CLASS_KEYS.map((k) => v.literal(k)))),
    // Stamped when onboarding completes (Beat 4 — first battle). The App.tsx
    // state machine routes on server state, so unset ⇒ resume the flow.
    onboardedAt: v.optional(v.number()),
    // Stamped by the first HealthKit sync that lands REAL steps (>0), in
    // recordSteps (STR-48, spec §Beat 3). iOS never reveals read-permission
    // status (privacy by design), so "connected" is derived from evidence:
    // data actually arrived. Unset ⇒ the dashboard shows the calm CONNECT
    // HEALTH chip (never red, never a badge). Server state, so the chip stays
    // consistent across devices.
    healthKitConnectedAt: v.optional(v.number()),
    // Stamped by the first idle collect that banked damage (>0) — keys the
    // one-time "Your hero never stops." teaching suffix (STR-49, spec
    // §Teaching Layer). First-time-only BY SERVER STATE, never localStorage,
    // so the moment fires exactly once across devices/reinstalls.
    firstIdleCollectedAt: v.optional(v.number()),

    // --- Phase 2 account-level meta (PERSISTS across weekly resets) ---
    // Energy is DERIVED: balance = energyEarned(ledger) − energySpent. We store
    // only this monotonic counter (see CLAUDE.md "Energy is derived").
    energySpent: v.optional(v.number()),
    // Daily-deploy streak (account-level, survives the weekly boss reset).
    streakCount: v.optional(v.number()),
    longestStreak: v.optional(v.number()),
    lastDeployDate: v.optional(v.string()), // "YYYY-MM-DD" effective day of last deploy

    // --- Phase 3 fuel tank (fuel hybrid; PERSISTS across weekly resets) ---
    // Settled fuel (in steps; 1 step = 1 fuel) as of fuelSettledAt (effective
    // ms). Current fuel is DERIVED by walking the piecewise burn from this pair
    // (convex/fuelMath.ts) — same settle-on-interaction shape as idle accrual.
    // `undefined` means "never fueled yet" → bootstrap grants the starter tank.
    fuel: v.optional(v.number()),
    fuelSettledAt: v.optional(v.number()),
    // --- Phase 3 Overdrive (spec §4). Charge is DERIVED like Energy:
    //   excess earned (Σ per-day max(0, dayMax − DAILY_STEP_GOAL) from the ledger)
    //   − overdriveExcessSpent, clamped to one full charge (4,000 excess).
    // Activation consumes the WHOLE earned pool (maxStoredCharges = 1: overflow
    // past 100% is lost, exactly like deploy zeroing the Energy bank).
    overdriveExcessSpent: v.optional(v.number()),
    // Effective-ms timestamp when the current/most recent Overdrive ends. Stays
    // on the doc after expiry — settles clamp the ×3 boundary inside their own
    // window, so a stale value simply contributes 0 overdrive hours.
    overdriveActiveUntil: v.optional(v.number()),
    // --- Phase 3 Streak Shields (STR-10, spec §6; PERSIST across weekly resets)
    // Settled shield count (0..STREAK_SHIELD.maxHeld). Earned by hitting the
    // daily goal on 5 days within one Mon–Sun week; auto-consumed silently to
    // bridge a missed deploy day (the streak survives). Settle-on-interaction:
    // earning settles on step syncs + deploys, consumption at the next deploy.
    shieldsHeld: v.optional(v.number()),
    // weekStart ("YYYY-MM-DD" Monday) of the latest week already credited a
    // shield — the no-double-earn marker.
    shieldLastEarnedWeek: v.optional(v.string()),
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
    // 6-character code friends type to join this guild (M2.5 onboarding;
    // length/alphabet in gameConfig.GUILD). Optional: guilds created before
    // onboarding shipped don't have one yet.
    inviteCode: v.optional(v.string()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_invite_code", ["inviteCode"]),

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
    // --- Bonus Boss (M1.5, spec §5). Stamped by resolveBoss in the SAME write
    // as the active→won kill transition (the single shared write, so the
    // crowned form can't double-fire). The bonus phase itself is DERIVED:
    // status "won" AND the week isn't over — no new status literal.
    bonusStartedAt: v.optional(v.number()), // effective ms of the kill
    bonusBossName: v.optional(v.string()), // "Crowned <bossName>"
    // --- Stamped by spawnBoss on the NEXT week's challenge (STR-56, spec §5
    // write-site 4). spawnBoss is called only from ensureCurrentChallenge —
    // the single writer of weekly rollover — so the reward is stamped exactly
    // once. BOTH fields absent = ×1.0 floor (tier 0 or prior expired — the
    // never-punish guardrail: no reward is never a penalty).
    boostMult: v.optional(v.number()), // guild-wide damage mult in force this week
    boostSourceDamage: v.optional(v.number()), // last week's total bonus damage (reward banner/history)
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
    // Bonus Boss (M1.5, spec §3/§5): post-kill damage (deploys + idle) banked
    // while the challenge is "won". The party's accumulating meter is
    // Σ across members — same derived pattern as boss HP (each member writes
    // only their own row, no write contention). Defaults 0 when absent.
    bonusDamageContributed: v.optional(v.number()),
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

  // rallies — one row per rally sent (STR-9, spec §5): a giver spends Energy to
  // gift a Winded/Resting guildmate some fight time. The row records WHO sent it
  // (the receiver's celebration names the friend, not the app) and doubles as
  // the per-giver-per-day rate-limit ledger.
  rallies: defineTable({
    giverId: v.id("users"),
    receiverId: v.id("users"),
    groupId: v.id("groups"),
    date: v.string(), // giver's effective "YYYY-MM-DD" (anchors the daily limit)
    fuelGiven: v.number(), // actually granted (post tank-cap clamp)
    energySpent: v.number(), // what the giver paid (RALLY.energyCost at the time)
    // False until the receiver's client plays the "X rallied you!" moment
    // (STR-15 flips it). Unseen rallies = pending celebrations.
    seen: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_giver_and_date", ["giverId", "date"])
    .index("by_receiver_and_seen", ["receiverId", "seen"]),

  // devState — a single row holding the dev-only mocked-clock offset. Lets the
  // dev tools time-travel (advance day, fast-forward idle). In production this
  // table stays empty → offset 0 → effectiveNow() == real Date.now().
  devState: defineTable({
    key: v.literal("singleton"),
    clockOffsetMs: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
