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
//
// Bonus phase (M1.5, spec §3): while the progress row's challenge is "won",
// the SAME settled damage banks into bonusDamageContributed (the accumulating
// meter) instead of boss HP. Routed HERE, at the single write site, so every
// settle path — collect, step sync, dev teleport — behaves identically and
// post-kill idle damage is never discarded (the old victory-lap "settle fuel,
// throw the damage away" was a subtle punishment; fixed).
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
    // Overdrive (STR-8): the elapsed window prices any active/just-expired ×3
    // hours from the stamp in force. Activation patches this AFTER settling,
    // so the pre-activation window never retroactively earns the boost.
    overdriveUntil: user.overdriveActiveUntil,
  });

  // Damage routing (M1.5 spec §3): a "won" challenge is in its bonus phase —
  // bank onto the accumulating meter; otherwise onto boss HP as always.
  const challenge = await ctx.db.get(progress.challengeId);
  const bonusPhase = challenge?.status === "won";

  await ctx.db.patch(userId, { fuel: settled.fuel, fuelSettledAt: effNow });
  await ctx.db.patch(progress._id, {
    ...(bonusPhase
      ? {
          bonusDamageContributed:
            (progress.bonusDamageContributed ?? 0) + settled.damage,
        }
      : { damageContributed: progress.damageContributed + settled.damage }),
    lastIdleCollectedAt: effNow,
    idleMultiplierSnapshot: newMult ?? progress.idleMultiplierSnapshot ?? 1,
    updatedAt: Date.now(),
  });

  return { collected: settled.damage, burned: settled.burned, fuel: settled.fuel };
}
