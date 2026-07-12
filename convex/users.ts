// =============================================================================
// Identity + first-time setup.
// =============================================================================
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ensureCurrentChallenge, ensureProgress } from "./combat";

/** The currently signed-in player (or null if not signed in yet). */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    return {
      _id: user._id,
      displayName: user.displayName ?? "New Hero",
      baselineSteps: user.baselineSteps ?? null,
      isAnonymous: user.isAnonymous ?? false,
    };
  },
});

/**
 * Idempotent first-run setup. Safe to call on every app launch.
 * Ensures the player has: a display name, a personal guild + membership, and an
 * ACTIVE weekly boss with a progress row. Returns nothing meaningful — read state
 * back through reactive queries.
 *
 * `tzOffsetMinutes` (Date.getTimezoneOffset()) is captured once so the SERVER can
 * decide the guild's day/week boundary — the client no longer computes dates for
 * game logic.
 */
export const bootstrap = mutation({
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

    // 2) Ensure a personal guild + owner membership (capture timezone).
    let membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    let groupId;
    if (membership === null) {
      groupId = await ctx.db.insert("groups", {
        name: "My Guild",
        ownerId: userId,
        createdAt: Date.now(),
        tzOffsetMinutes: tzOffsetMinutes ?? 0,
      });
      await ctx.db.insert("memberships", {
        userId,
        groupId,
        role: "owner",
        joinedAt: Date.now(),
      });
    } else {
      groupId = membership.groupId;
      if (tzOffsetMinutes !== undefined) {
        const g = await ctx.db.get(groupId);
        if (g && g.tzOffsetMinutes !== tzOffsetMinutes) {
          await ctx.db.patch(groupId, { tzOffsetMinutes });
        }
      }
    }

    // 3) Ensure the current weekly boss (handles weekly rollover) + this member's
    //    progress row (idle clock started now, so no phantom offline backlog).
    const group = (await ctx.db.get(groupId))!;
    const challenge = await ensureCurrentChallenge(ctx, group);
    await ensureProgress(ctx, challenge, userId);
  },
});
