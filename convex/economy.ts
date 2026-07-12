// =============================================================================
// Energy economy — Energy is DERIVED, not stored (see CLAUDE.md Architecture #2).
// =============================================================================
//   energyEarned  = Σ over all days of (that day's MAX step reading) × ENERGY_PER_STEP
//   energyBalance = energyEarned − user.energySpent   (clamped ≥ 0)
// This is self-correcting (immune to stale/negative step readings, back-dated
// injects) and "carries over and never expires" for free. Deploy zeroes the
// balance by setting energySpent = energyEarned.
// =============================================================================
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ENERGY_PER_STEP } from "./gameConfig";

/** Lifetime energy earned from the player's entire step ledger. */
export async function energyEarned(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<number> {
  const entries = await ctx.db
    .query("stepEntries")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const maxByDay = new Map<string, number>();
  for (const e of entries) {
    maxByDay.set(e.date, Math.max(maxByDay.get(e.date) ?? 0, e.stepCount));
  }
  let steps = 0;
  for (const v of maxByDay.values()) steps += v;
  return steps * ENERGY_PER_STEP;
}

/** Spendable Energy bank = lifetime earned − spent. */
export async function energyBalance(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<number> {
  const user = await ctx.db.get(userId);
  const spent = user?.energySpent ?? 0;
  return Math.max(0, (await energyEarned(ctx, userId)) - spent);
}
