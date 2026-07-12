// =============================================================================
// Rally (STR-9) — gift a Winded/Resting guildmate some fight time (spec §5).
// =============================================================================
// The giver spends RALLY.energyCost (500) Energy — through the same derived-
// energy path deploy uses (bump the monotonic users.energySpent counter) — and
// the receiver's tank gains RALLY.fuelHoursGiven (6h) of fuel, tank cap applied.
//
// Rules (all spec §5):
//  - Receiver must currently be Winded or Resting — it's a WAKE-UP, not a
//    subsidy, and it blocks fuel-banking loops between friends. The receiver's
//    tank is SETTLED FIRST (at their old level — the standing invariant), and
//    only then is the state checked, so a hero who drained to Winded since
//    their last interaction is honestly rally-able.
//  - Max 1 rally sent per giver per server-day (the rallies table is the ledger).
//  - The row records WHO sent it; `seen: false` marks the pending celebration
//    the receiver's client plays (STR-15) — the nudge comes from a friend.
// =============================================================================
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { effectiveNow, effectiveDayForTz } from "./time";
import { getUserGroup } from "./players";
import { energyEarned } from "./economy";
import { ensureCurrentChallenge, ensureProgress, resolveBoss } from "./combat";
import { settleFuelAndIdle } from "./idle";
import { settleFuel, grantFuel } from "./fuel";
import { fuelStateFor, RALLY_FUEL_GRANT } from "./fuelMath";
import { RALLY } from "./gameConfig";

/** Core rally: every rule from spec §5, taking an explicit giverId so the dev
 *  "simulate teammate rally" (dev.ts) drives a bot through the SAME path —
 *  rate limit, receiver settle+state check, energy spend, and the rallies row
 *  (sender attribution + seen:false) all behave exactly like a friend's rally.
 *  Same shape as combat.applyDeploy. */
export async function applyRally(
  ctx: MutationCtx,
  giverId: Id<"users">,
  receiverId: Id<"users">,
) {
  if (receiverId === giverId) {
    throw new Error("You can't rally yourself.");
  }
  const giver = await ctx.db.get(giverId);
  if (giver === null) throw new Error("User row missing.");
  const ug = await getUserGroup(ctx, giverId);
  if (!ug) throw new Error("No guild yet.");

  // Same-guild check: rallies flow between teammates only.
  const receiverMembership = await ctx.db
    .query("memberships")
    .withIndex("by_user_and_group", (q) =>
      q.eq("userId", receiverId).eq("groupId", ug.group._id),
    )
    .first();
  if (!receiverMembership) {
    throw new Error("You can only rally a member of your guild.");
  }

  const now = await effectiveNow(ctx);
  const today = await effectiveDayForTz(ctx, ug.group.tzOffsetMinutes);

  // Rate limit: 1 rally sent per giver per server-day.
  const sentToday = await ctx.db
    .query("rallies")
    .withIndex("by_giver_and_date", (q) =>
      q.eq("giverId", giverId).eq("date", today),
    )
    .take(RALLY.perGiverPerDay);
  if (sentToday.length >= RALLY.perGiverPerDay) {
    throw new Error("You've already sent today's rally.");
  }

  // Giver must afford it (Energy is derived: ledger − spent, like deploy).
  const earned = await energyEarned(ctx, giverId);
  const balance = Math.max(0, earned - (giver.energySpent ?? 0));
  if (balance < RALLY.energyCost) {
    throw new Error(`A rally costs ${RALLY.energyCost} Energy.`);
  }

  // SETTLE the receiver FIRST at their old fuel level (and bank any idle
  // damage over the same walk when there's a live boss) — THEN check state.
  const challenge = await ensureCurrentChallenge(ctx, ug.group);
  let settledFuel: number;
  if (challenge.status === "active") {
    const progress = await ensureProgress(ctx, challenge, receiverId);
    const settled = await settleFuelAndIdle(ctx, receiverId, progress, now);
    settledFuel = settled.fuel;
    await resolveBoss(ctx, challenge._id);
  } else {
    // Victory lap: no boss to hit, but the tank still drains.
    settledFuel = (await settleFuel(ctx, receiverId, now)).fuel;
  }
  if (fuelStateFor(settledFuel) === "battling") {
    throw new Error("That hero is still battling — save the rally for a friend who needs it.");
  }

  // Spend the giver's Energy (monotonic counter — the derived balance drops).
  await ctx.db.patch(giverId, {
    energySpent: (giver.energySpent ?? 0) + RALLY.energyCost,
  });

  // Grant the fuel: settle-then-add (the settle is a no-op — we just did it),
  // clamped to the tank cap. A Winded/Resting receiver is far below the cap,
  // so in practice the full grant always lands.
  const after = await grantFuel(ctx, receiverId, now, RALLY_FUEL_GRANT);
  const fuelGiven = after.fuel - settledFuel;

  await ctx.db.insert("rallies", {
    giverId,
    receiverId,
    groupId: ug.group._id,
    date: today,
    fuelGiven,
    energySpent: RALLY.energyCost,
    seen: false,
    createdAt: Date.now(),
  });

  return { receiverId, fuelGiven, receiverState: after.state };
}

export const sendRally = mutation({
  args: { receiverId: v.id("users") },
  handler: async (ctx, { receiverId }) => {
    const giverId = await getAuthUserId(ctx);
    if (giverId === null) throw new Error("Not signed in.");
    return await applyRally(ctx, giverId, receiverId);
  },
});

/** The receiver acknowledges their pending celebrations (STR-15 calls this
 *  after playing the "X rallied you!" moment). */
export const markRalliesSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const unseen = await ctx.db
      .query("rallies")
      .withIndex("by_receiver_and_seen", (q) =>
        q.eq("receiverId", userId).eq("seen", false),
      )
      .take(50);
    for (const r of unseen) await ctx.db.patch(r._id, { seen: true });
  },
});
