// =============================================================================
// Fuel accounting (Convex side) — the tank that powers the 24/7 fighting hero.
// =============================================================================
// Stored state is just (users.fuel, users.fuelSettledAt): the settled fuel and
// when it was settled. Everything else is derived by the PURE piecewise walk in
// fuelMath.ts, settled on interaction exactly like idle accrual (idle.ts):
// settle the elapsed window at the level in force FIRST, then apply the change
// (add fuel) — so there's no "add fuel mid-window and retroactively battle
// harder" exploit, mirroring the job-change rule in steps.ts.
//
// Fuel EARNED = steps × fuelPerStep (granted as day-max deltas when the ledger
// grows) + the starter tank + (later) rallies. Fuel lives on the USER, not on
// challengeProgress, so it persists across weekly boss resets by construction.
// =============================================================================
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  addFuel,
  cappedElapsedMs,
  fuelStateFor,
  burnRateForState,
  walkFuel,
  STARTER_FUEL,
  type FuelState,
  type FuelSegment,
} from "./fuelMath";

export type FuelSnapshot = {
  /** Current fuel after settling the pending window (not yet written). */
  fuel: number;
  /** Fuel burned across the pending window. */
  burned: number;
  state: FuelState;
  segments: FuelSegment[];
};

/** Read-only view of the tank as of `effNow` (safe in queries — writes nothing).
 *  A user who has never been fueled reads as empty/resting. */
export function fuelSnapshot(user: Doc<"users">, effNow: number): FuelSnapshot {
  const settled = user.fuel ?? 0;
  const settledAt = user.fuelSettledAt ?? effNow;
  const { endFuel, burned, segments } = walkFuel(
    settled,
    cappedElapsedMs(settledAt, effNow),
  );
  return { fuel: endFuel, burned, segments, state: fuelStateFor(endFuel) };
}

/** Fuel burned per hour at the tank's current level (for UI extrapolation). */
export function currentBurnPerHour(snapshot: FuelSnapshot): number {
  return burnRateForState(snapshot.state);
}

/** One-time starter tank so a new hero fights from minute one (24h of fuel).
 *  Idempotent: only fires while `fuel` has never been set. Also covers accounts
 *  that predate the fuel system — they get the same starter on next bootstrap,
 *  never an empty tank they didn't earn. */
export async function grantStarterFuelIfNew(
  ctx: MutationCtx,
  userId: Id<"users">,
  effNow: number,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user || user.fuel !== undefined) return;
  await ctx.db.patch(userId, { fuel: STARTER_FUEL, fuelSettledAt: effNow });
}

/** Settle the pending burn window and re-stamp the clock. Returns the settled
 *  tank. Mirrors idle.ts's settleIdle. */
export async function settleFuel(
  ctx: MutationCtx,
  userId: Id<"users">,
  effNow: number,
): Promise<FuelSnapshot> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User row missing.");
  const snap = fuelSnapshot(user, effNow);
  await ctx.db.patch(userId, { fuel: snap.fuel, fuelSettledAt: effNow });
  return snap;
}

/** Grant fuel (from steps, starter top-ups, rallies later): settle the elapsed
 *  window at the OLD level first, then add — clamped to the 48h tank cap. */
export async function grantFuel(
  ctx: MutationCtx,
  userId: Id<"users">,
  effNow: number,
  amount: number,
): Promise<FuelSnapshot> {
  const settled = await settleFuel(ctx, userId, effNow);
  const fuel = addFuel(settled.fuel, amount);
  await ctx.db.patch(userId, { fuel });
  return { ...settled, fuel, state: fuelStateFor(fuel) };
}
