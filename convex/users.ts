// =============================================================================
// Identity + per-launch session maintenance.
// =============================================================================
// STR-44 (spec §Backend): `bootstrap` became `ensureSession` — MAINTENANCE
// ONLY. It never creates a guild anymore: guild creation moved to the explicit
// Beat-2 mutations (guild.createGuild / guild.joinGuildByCode), which kills the
// "Setting up your guild…" flash and makes the onboarding fork real. The
// App.tsx state machine routes on server state (viewer.class → membership →
// onboardedAt), so this file also owns the two onboarding stamps.
// =============================================================================
import { internalMutation, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ensureCurrentChallenge, ensureProgress } from "./combat";
import { grantStarterFuelIfNew } from "./fuel";
import { getUserGroup } from "./players";
import { generateUniqueInviteCode } from "./guild";
import { effectiveNow } from "./time";
import { CLASS_KEYS, MVP_CLASS, type ClassKey } from "./gameConfig";

/** Hero names are read on the battlefield roster + recognition badges; 20 chars
 *  keeps them legible at pixel-font sizes (ticket STR-44's validated bound). */
const HERO_NAME_MAX = 20;

/** The currently signed-in player (or null if not signed in yet). Exposes the
 *  three onboarding routing keys (class → hasGuild → onboardedAt) so the
 *  App.tsx flow is resume-safe by construction: kill the app anywhere, the DB
 *  says which beat comes next. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      _id: user._id,
      displayName: user.displayName ?? "New Hero",
      baselineSteps: user.baselineSteps ?? null,
      isAnonymous: user.isAnonymous ?? false,
      class: user.class ?? null,
      onboardedAt: user.onboardedAt ?? null,
      hasGuild: membership !== null,
    };
  },
});

/**
 * Beat 1 — "THIS IS ME". Sets the chosen class (validated against the CLASSES
 * registry by the argument validator itself) and optionally the hero name.
 * Idempotent — safe to re-submit — and it doubles as the rename path later
 * (class re-pick + name edit go through the same door).
 *
 * The name field is PRE-FILLED client-side, so `displayName` omitted means
 * "keep what I have" (defaulting to Hero-<last4> if somehow unnamed), never
 * "clear it". No membership required: Beat 1 runs before the guild fork.
 */
export const setHeroIdentity = mutation({
  args: {
    class: v.union(...CLASS_KEYS.map((k) => v.literal(k))),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("User row missing.");

    const patch: { class: ClassKey; displayName?: string } = {
      class: args.class,
    };
    if (args.displayName !== undefined) {
      const trimmed = args.displayName.trim();
      if (trimmed.length < 1 || trimmed.length > HERO_NAME_MAX) {
        throw new ConvexError({
          code: "invalid_name",
          message: `Hero names are 1–${HERO_NAME_MAX} characters.`,
        });
      }
      patch.displayName = trimmed;
    } else if (!user.displayName) {
      patch.displayName = `Hero-${userId.slice(-4)}`;
    }
    await ctx.db.patch(userId, patch);
  },
});

/**
 * Beat 4 — stamp `onboardedAt` and land on the battle scene. Requires a
 * membership: "onboarded" MEANS class + guild + first render, so a client bug
 * can't strand a guild-less account past the fork (the stamp is what the
 * routing trusts). Idempotent — the original stamp is never overwritten.
 */
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("User row missing.");

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (membership === null) {
      throw new ConvexError({
        code: "no_guild",
        message: "Join or start a guild before heading into battle.",
      });
    }
    if (user.onboardedAt === undefined) {
      await ctx.db.patch(userId, { onboardedAt: Date.now() });
    }
  },
});

/**
 * Per-launch session maintenance (formerly `bootstrap`). Idempotent, safe to
 * call on every app open. It NEVER creates a guild (STR-44's load-bearing
 * restructure) — it only maintains what already exists:
 *  - a default display name (pre-fills the Beat-1 name field),
 *  - the starter tank for accounts that predate the fuel system (legacy grant),
 *  - and, ONLY when a membership exists: the guild tz refresh, a legacy
 *    invite-code backfill, and the weekly boss rollover + progress row.
 * Read state back through reactive queries.
 */
export const ensureSession = mutation({
  args: { tzOffsetMinutes: v.optional(v.number()) },
  handler: async (ctx, { tzOffsetMinutes }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("User row missing.");

    // 1) Default display name.
    if (!user.displayName) {
      await ctx.db.patch(userId, {
        displayName: `Hero-${userId.slice(-4)}`,
      });
    }

    // 2) Starter fuel (24h) so the first session never shows a resting hero.
    //    Idempotent — only fires while the tank has never been set. Also the
    //    legacy grant for accounts that predate the fuel system.
    await grantStarterFuelIfNew(ctx, userId, await effectiveNow(ctx));

    // 3) Guild maintenance — ONLY if a membership exists. A fresh account stays
    //    guild-less here; the dashboard renders its null-guild shape until the
    //    onboarding fork creates or joins one.
    const ug = await getUserGroup(ctx, userId);
    if (!ug) return;

    // tz refresh: OWNER-only now that guilds can hold real joiners — the
    // founder's timezone anchors the shared day/week boundary, and members in
    // other timezones must not flap it back and forth on every launch.
    if (
      tzOffsetMinutes !== undefined &&
      ug.membership.role === "owner" &&
      ug.group.tzOffsetMinutes !== tzOffsetMinutes
    ) {
      await ctx.db.patch(ug.group._id, { tzOffsetMinutes });
    }

    // Legacy invite-code backfill: guilds created before onboarding shipped
    // have no code, but the guild board's invite CTA needs one — same
    // self-healing shape as the starter-fuel grant above.
    if (ug.group.inviteCode === undefined) {
      await ctx.db.patch(ug.group._id, {
        inviteCode: await generateUniqueInviteCode(ctx),
      });
    }

    // 4) Weekly boss rollover + this member's progress row (idle clock started
    //    now, so no phantom offline backlog).
    const group = (await ctx.db.get(ug.group._id))!;
    const challenge = await ensureCurrentChallenge(ctx, group);
    await ensureProgress(ctx, challenge, userId);
  },
});

/**
 * One-shot legacy backfill (spec §Backend "Legacy users"): accounts from before
 * onboarding shipped already live in a guild but never picked a class. Stamp
 * them warrior (the MVP class they were playing) + onboardedAt so the routing
 * doesn't march existing heroes through the flow. Internal — run by hand once
 * per deployment:  npx convex run users:backfillLegacyOnboarding
 * (Self-healing also exists without it: `membership && !class` routes to
 * class-pick only.)
 */
export const backfillLegacyOnboarding = internalMutation({
  args: {},
  handler: async (ctx) => {
    let patched = 0;
    // Full scan is fine here: one-shot, and the users table is friend-group
    // sized (the 3–8 design target plus dev bots).
    for await (const user of ctx.db.query("users")) {
      if (user.isSimulated) continue; // bots aren't heroes; fallbacks cover them
      if (user.class !== undefined) continue;
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();
      if (!membership) continue; // mid-onboarding account — let the flow run
      await ctx.db.patch(user._id, {
        class: MVP_CLASS,
        onboardedAt: user.onboardedAt ?? user._creationTime,
      });
      patched++;
    }
    return { patched };
  },
});
