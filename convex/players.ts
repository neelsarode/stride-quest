// Shared player-scoped lookups used across queries/mutations.
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/** The player's guild + their membership (first/only guild in the MVP). */
export async function getUserGroup(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{ membership: Doc<"memberships">; group: Doc<"groups"> } | null> {
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!membership) return null;
  const group = await ctx.db.get(membership.groupId);
  if (!group) return null;
  return { membership, group };
}

/** Number of members in a guild (for boss-HP scaling). */
export async function memberCount(
  ctx: QueryCtx,
  groupId: Id<"groups">,
): Promise<number> {
  const rows = await ctx.db
    .query("memberships")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();
  return Math.max(1, rows.length);
}
