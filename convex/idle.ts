// =============================================================================
// Idle accrual math (see Architecture #4). Kept in its own module (depends only
// on config) so both steps.ts and combat.ts can use it without an import cycle.
// =============================================================================
// pendingIdleDamage = min(elapsed, OFFLINE_CAP) hours × BASE_IDLE_DPH × the
// multiplier in force since the last settle. settleIdle banks that onto the
// boss and re-stamps the clock + (optionally) the new multiplier — so each
// sub-interval accrues at the correct rate with no mid-window exploit.
// =============================================================================
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { BASE_IDLE_DPH, OFFLINE_CAP_MS } from "./gameConfig";

const HOUR_MS = 3_600_000;

export function pendingIdleDamage(
  progress: Doc<"challengeProgress">,
  effNow: number,
): number {
  const last = progress.lastIdleCollectedAt ?? effNow;
  const mult = progress.idleMultiplierSnapshot ?? 1;
  const elapsed = Math.min(Math.max(0, effNow - last), OFFLINE_CAP_MS);
  return Math.floor((elapsed / HOUR_MS) * BASE_IDLE_DPH * mult);
}

/** Bank pending idle onto the boss; re-stamp the idle clock (and multiplier).
 *  Returns the amount collected. */
export async function settleIdle(
  ctx: MutationCtx,
  progress: Doc<"challengeProgress">,
  effNow: number,
  newMult?: number,
): Promise<number> {
  const collected = pendingIdleDamage(progress, effNow);
  await ctx.db.patch(progress._id, {
    damageContributed: progress.damageContributed + collected,
    lastIdleCollectedAt: effNow,
    idleMultiplierSnapshot: newMult ?? progress.idleMultiplierSnapshot ?? 1,
    updatedAt: Date.now(),
  });
  return collected;
}
