// =============================================================================
// Streak Shields (Convex side, STR-10) — earning settlement from the ledger.
// =============================================================================
// A shield is earned by hitting DAILY_STEP_GOAL on 5 days within one Mon–Sun
// week (server weeks, guild timezone). Stored state is tiny and settled on
// interaction, like everything else:
//   users.shieldsHeld            — the pocket (0..maxHeld)
//   users.shieldLastEarnedWeek   — latest weekStart already credited
// Earning is DERIVED from the step ledger (goal days per week) and settles on
// every step sync (recordSteps / dev inject) and on deploy — the moments the
// ledger can have grown. A qualifying week is, by definition, a week with 5+
// synced goal days, so its own syncs settle it; the previous-week check also
// covers a 5th goal day that lands late (e.g. HealthKit backfilling Sunday
// during Monday's first sync). Weeks older than that can no longer earn — the
// pocket is protection for the CURRENT run of play, not an archaeology dig.
// =============================================================================
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { weekRange } from "./time";
import { getUserGroup } from "./players";
import { weekEarnsShield, shieldsAfterEarning } from "./streakMath";
import { DAILY_STEP_GOAL } from "./gameConfig";

const DAY_MS = 86_400_000;

/** How many days in [weekStart, weekEnd] hit the daily step goal (per-day MAX
 *  reading, same derivation rule as everything else on the ledger). */
export async function goalDaysInWeek(
  ctx: MutationCtx,
  userId: Id<"users">,
  weekStart: string,
  weekEnd: string,
): Promise<number> {
  const entries = await ctx.db
    .query("stepEntries")
    .withIndex("by_user_and_date", (q) =>
      q.eq("userId", userId).gte("date", weekStart).lte("date", weekEnd),
    )
    .collect();
  const maxByDay = new Map<string, number>();
  for (const e of entries) {
    maxByDay.set(e.date, Math.max(maxByDay.get(e.date) ?? 0, e.stepCount));
  }
  let days = 0;
  for (const v of maxByDay.values()) if (v >= DAILY_STEP_GOAL) days += 1;
  return days;
}

/** Settle shield EARNING for the previous + current week (each at most once —
 *  `shieldLastEarnedWeek` is the no-double-earn marker; the marker advances
 *  even when the pocket is full, so capped overflow is LOST, not banked).
 *  Returns the up-to-date shieldsHeld so callers can consume from a fresh
 *  number. Idempotent — safe to call on every sync/deploy. */
export async function settleShieldEarning(
  ctx: MutationCtx,
  userId: Id<"users">,
  effNow: number,
): Promise<number> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User row missing.");
  const ug = await getUserGroup(ctx, userId);
  const tz = ug?.group.tzOffsetMinutes ?? 0;

  let held = user.shieldsHeld ?? 0;
  let marker = user.shieldLastEarnedWeek;

  // Chronological: previous week first, then the current one.
  const weeks = [weekRange(effNow - 7 * DAY_MS, tz), weekRange(effNow, tz)];
  for (const { weekStart, weekEnd } of weeks) {
    if (marker !== undefined && weekStart <= marker) continue; // already credited
    if (weekEarnsShield(await goalDaysInWeek(ctx, userId, weekStart, weekEnd))) {
      held = shieldsAfterEarning(held);
      marker = weekStart;
    }
  }

  if (held !== (user.shieldsHeld ?? 0) || marker !== user.shieldLastEarnedWeek) {
    await ctx.db.patch(userId, {
      shieldsHeld: held,
      shieldLastEarnedWeek: marker,
    });
  }
  return held;
}
