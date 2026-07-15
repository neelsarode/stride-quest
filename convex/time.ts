// =============================================================================
// Server-owned clock + day/week math.
// =============================================================================
// The server is the single source of truth for "now", "today", and "this week".
// A dev-only offset (devState.clockOffsetMs) lets the dev tools time-travel, so
// idle accrual, streaks, and the weekly reset are all testable in minutes. In
// production devState is empty → offset 0 → effectiveNow() == real Date.now().
//
// The guild's tzOffsetMinutes (captured at bootstrap) anchors the day/week
// boundary, so all co-op members share one boss-week and one streak-day.
// =============================================================================
import type { QueryCtx } from "./_generated/server";

const MINUTE_MS = 60_000;

/** The dev clock offset (0 if unset / in production). */
export async function getClockOffsetMs(ctx: QueryCtx): Promise<number> {
  const row = await ctx.db
    .query("devState")
    .withIndex("by_key", (q) => q.eq("key", "singleton"))
    .first();
  return row?.clockOffsetMs ?? 0;
}

/** The effective "now" in ms (real time + dev offset). */
export async function effectiveNow(ctx: QueryCtx): Promise<number> {
  return Date.now() + (await getClockOffsetMs(ctx));
}

// --- pure date helpers (instant ms + tz minutes → calendar strings) ---------
// tzOffsetMinutes follows JS Date.getTimezoneOffset(): minutes to ADD to local
// to get UTC (e.g. UTC-5 → +300). So localMs = instantMs − tzOffsetMinutes*60000,
// after which UTC getters read the local calendar day.

/** "YYYY-MM-DD" for an instant in the given timezone. */
export function dayString(instantMs: number, tzOffsetMinutes: number): string {
  return fmt(new Date(instantMs - tzOffsetMinutes * MINUTE_MS));
}

/** Monday…Sunday range (local) containing the instant. Jobs reset Monday. */
export function weekRange(
  instantMs: number,
  tzOffsetMinutes: number,
): { weekStart: string; weekEnd: string } {
  const local = new Date(instantMs - tzOffsetMinutes * MINUTE_MS);
  const mondayOffset = (local.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

function fmt(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The guild-tz "end of the effective day" as a wall-clock instant (ms): the
 *  NEXT local midnight after `instantMs`. Pure, and it reuses the exact tz
 *  convention of dayString/weekRange — localMs = instantMs − tzOffsetMinutes·
 *  MINUTE_MS (UTC getters then read the local calendar), and the local-midnight
 *  is converted back to a real instant with + tzOffsetMinutes·MINUTE_MS.
 *
 *  Overdrive retrigger (Core Loop v2 §5.4): when today's steps cross the daily
 *  goal, recordSteps/injectFor stamp `overdriveActiveUntil` to this instant, so
 *  Overdrive ×2 runs until the daily reset and then reads as inactive (the stamp
 *  is in the past) until the next goal-hit re-arms it. */
export function endOfEffectiveDay(
  instantMs: number,
  tzOffsetMinutes: number,
): number {
  const local = new Date(instantMs - tzOffsetMinutes * MINUTE_MS);
  // Next local calendar midnight (00:00 of the following local day), in local-ms.
  const nextLocalMidnightMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 1,
  );
  // Convert that local-ms back to a real instant (undo the tz shift above).
  return nextLocalMidnightMs + tzOffsetMinutes * MINUTE_MS;
}

// --- group-aware convenience (effective day/week for a guild) ----------------

export async function effectiveDayForTz(
  ctx: QueryCtx,
  tzOffsetMinutes: number | undefined,
): Promise<string> {
  return dayString(await effectiveNow(ctx), tzOffsetMinutes ?? 0);
}

export async function effectiveWeekForTz(
  ctx: QueryCtx,
  tzOffsetMinutes: number | undefined,
): Promise<{ weekStart: string; weekEnd: string }> {
  return weekRange(await effectiveNow(ctx), tzOffsetMinutes ?? 0);
}
