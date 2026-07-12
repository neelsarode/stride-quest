// =============================================================================
// Idle accrual — FUEL-DRIVEN (STR-7). Kept in its own module (no import cycle
// with steps.ts / combat.ts).
// =============================================================================
// The hero only fights while fueled: Battling earns BASE_IDLE_DPH × job mult,
// Winded earns half, Resting earns zero (and burns zero — resting is never
// punished). Damage and fuel burn settle TOGETHER through one piecewise walk
// (fuelMath.settleFuelAndIdleWindow) over the same clock windows, so the two
// can never disagree. Elapsed time past OFFLINE_CAP_HOURS pauses BOTH.
//
// settleFuelAndIdle banks the damage onto the boss, drains the tank, and
// re-stamps both clocks + (optionally) the new job multiplier — so each
// sub-interval accrues at the correct rate with no mid-window exploit
// (same rule as the old flat accrual's job-change settlement).
// =============================================================================
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { settleFuelAndIdleWindow } from "./fuelMath";

export type SettleResult = {
  /** Idle damage banked onto the boss by this settle. */
  collected: number;
  /** Fuel burned across the settled window. */
  burned: number;
  /** The tank after settling. */
  fuel: number;
};

/** Settle fuel burn + idle damage in one shared walk; bank the damage, drain
 *  the tank, re-stamp both clocks (and the job multiplier if it changed). */
export async function settleFuelAndIdle(
  ctx: MutationCtx,
  userId: Id<"users">,
  progress: Doc<"challengeProgress">,
  effNow: number,
  newMult?: number,
): Promise<SettleResult> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User row missing.");

  const settled = settleFuelAndIdleWindow({
    fuel: user.fuel ?? 0,
    fuelLastAt: user.fuelSettledAt ?? effNow,
    idleLastAt: progress.lastIdleCollectedAt ?? effNow,
    now: effNow,
    jobMult: progress.idleMultiplierSnapshot ?? 1,
  });

  await ctx.db.patch(userId, { fuel: settled.fuel, fuelSettledAt: effNow });
  await ctx.db.patch(progress._id, {
    damageContributed: progress.damageContributed + settled.damage,
    lastIdleCollectedAt: effNow,
    idleMultiplierSnapshot: newMult ?? progress.idleMultiplierSnapshot ?? 1,
    updatedAt: Date.now(),
  });

  return { collected: settled.damage, burned: settled.burned, fuel: settled.fuel };
}
