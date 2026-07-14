// =============================================================================
// Overdrive (STR-8) — player-activated fever mode (spec §4).
// =============================================================================
// Every step ABOVE the daily goal charges the meter; 4,000 excess = 100%. The
// charge is DERIVED, like Energy (economy.ts):
//   excess earned  = Σ over all ledger days of max(0, dayMax − DAILY_STEP_GOAL)
//   charge         = clamp((earned − user.overdriveExcessSpent) / 4,000, 0, 1)
// So partial charge persists across days for free, and the meter holds at 100%
// until used. Activation consumes the WHOLE earned pool (spent := earned) —
// that's what "1 stored charge max" means: overflow past 100% is lost, exactly
// like deploy zeroing the Energy bank.
//
// Effect: for OVERDRIVE.durationHours (4h wall-clock, server time) idle damage
// is ×3 on top of the job multiplier (and Winded's ×0.5 still applies —
// multiplicative). Fuel burn is UNCHANGED: Overdrive is a pure reward, never a
// cost. The ×3 boundary lives inside the shared piecewise walk (fuelMath), so
// burn and damage still derive from one walk and can never disagree. Because
// activation settles first and every later settle anchors its capped window at
// its own stamp, a charge always yields EXACTLY 4 effective hours of ×3 — the
// offline-cap pause truncates the far end of a window, never the ×3 head.
// =============================================================================
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { effectiveNow } from "./time";
import { getUserGroup } from "./players";
import { ensureCurrentChallenge, ensureProgress, resolveBoss } from "./combat";
import { settleFuelAndIdle } from "./idle";
import { settleFuel } from "./fuel";
import { fuelStateFor, overdriveChargeFraction } from "./fuelMath";
import { DAILY_STEP_GOAL, OVERDRIVE } from "./gameConfig";

const HOUR_MS = 3_600_000;

/** Lifetime Overdrive excess earned from the ledger: per-day max reading over
 *  the goal, summed. Day boundaries are the server-assigned `date` on each
 *  entry (recordSteps stamps them with the guild's effective day). */
export async function overdriveExcessEarned(
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
  let excess = 0;
  for (const v of maxByDay.values()) excess += Math.max(0, v - DAILY_STEP_GOAL);
  return excess;
}

export type OverdriveStatus = {
  /** 0..1 — the meter. Holds at 1 until used. */
  charge: number;
  /** True when the button lights up (charge at 100%). */
  ready: boolean;
  /** True while the ×3 window is running. */
  active: boolean;
  /** Effective-ms when the current/last window ends (null if never activated). */
  activeUntil: number | null;
};

/** Read helper for queries/dev tooling (STR-11 exposes this on the dashboard). */
export async function overdriveStatus(
  ctx: QueryCtx,
  user: Doc<"users">,
  effNow: number,
): Promise<OverdriveStatus> {
  const earned = await overdriveExcessEarned(ctx, user._id);
  const charge = overdriveChargeFraction(earned, user.overdriveExcessSpent ?? 0);
  const activeUntil = user.overdriveActiveUntil ?? null;
  return {
    charge,
    ready: charge >= 1,
    active: activeUntil !== null && activeUntil > effNow,
    activeUntil,
  };
}

/** Pop the charged meter: 4 hours of ×3 idle damage, player-chosen moment.
 *  Requires a 100% charge and a hero who isn't Resting (an empty tank deals ×0
 *  of anything — the charge would evaporate; wake the hero first). */
export const activateOverdrive = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("User row missing.");

    // User-facing rejections are ConvexError with a structured {code, message}
    // payload (the STR-44 pattern from guild.ts) so the STR-14 UI can show the
    // friendly `message` instead of a generic "Server Error".
    const now = await effectiveNow(ctx);
    if ((user.overdriveActiveUntil ?? 0) > now) {
      throw new ConvexError({
        code: "already_active",
        message: "Overdrive is already running — enjoy the rampage!",
      });
    }

    const earned = await overdriveExcessEarned(ctx, userId);
    const spent = user.overdriveExcessSpent ?? 0;
    if (overdriveChargeFraction(earned, spent) < 1) {
      throw new ConvexError({
        code: "not_charged",
        message:
          "Overdrive isn't fully charged yet — steps past your daily goal fill the meter.",
      });
    }

    // SETTLE the elapsed window FIRST, at the rates in force (old fuel level,
    // old job mult, old — possibly expired — overdrive stamp). The ×3 only
    // applies from now on: no "bank a window, then activate to cash it out
    // high" exploit (the standing settle-before-change invariant).
    const ug = await getUserGroup(ctx, userId);
    let settledFuel = user.fuel ?? 0;
    if (ug) {
      const challenge = await ensureCurrentChallenge(ctx, ug.group);
      if (challenge.status === "active") {
        const progress = await ensureProgress(ctx, challenge, userId);
        const settled = await settleFuelAndIdle(
          ctx,
          userId,
          progress,
          now,
          challenge.boostMult ?? 1, // guild-wide boost stamped on this week (STR-56)
        );
        settledFuel = settled.fuel;
        await resolveBoss(ctx, challenge._id);
      } else {
        settledFuel = (await settleFuel(ctx, userId, now)).fuel;
      }
    } else {
      settledFuel = (await settleFuel(ctx, userId, now)).fuel;
    }

    // The hero must be awake AFTER the settle (the honest current state).
    if (fuelStateFor(settledFuel) === "resting") {
      throw new ConvexError({
        code: "hero_resting",
        message:
          "Your hero is resting — walk some fuel into the tank before going Overdrive.",
      });
    }

    const activeUntil = now + OVERDRIVE.durationHours * HOUR_MS;
    await ctx.db.patch(userId, {
      // Consume the whole pool (overflow past 100% is lost — 1 stored charge max).
      overdriveExcessSpent: earned,
      overdriveActiveUntil: activeUntil,
    });

    return {
      activeUntil,
      durationHours: OVERDRIVE.durationHours,
      idleDamageMult: OVERDRIVE.idleDamageMult,
    };
  },
});
