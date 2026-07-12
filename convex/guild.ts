// =============================================================================
// Guild — the co-op layer's reactive roster + recognition.
// =============================================================================
// The shared boss is already derived (boss HP = maxHP − Σ every member's
// damageContributed in game.dashboard), so a teammate's hit drops the bar on
// everyone's screen for free. This query exposes WHO contributed what, plus the
// fairness-based recognition (MVP / most improved / longest streak) scored on
// IMPROVEMENT + CONSISTENCY, never raw steps — so a lighter walker can win.
// =============================================================================
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getUserGroup } from "./players";
import { stepsForDate, stepsForWeek } from "./steps";
import { getClockOffsetMs, dayString, weekRange } from "./time";
import {
  CLASSES,
  MVP_CLASS,
  IMPROVEMENT_FLOOR,
  RECOGNITION,
  jobLevelForWeeklySteps,
} from "./gameConfig";

const DAY_MS = 86_400_000;

/** Today's steps relative to this player's own rolling average (locked fairness
 *  decision). 1.0 = exactly their norm; >1 = beating it. Floored so a brand-new
 *  player with no history isn't divide-by-zero. */
async function improvementScore(
  ctx: QueryCtx,
  userId: Id<"users">,
  tz: number | undefined,
  now: number,
  today: string,
  todaySteps: number,
): Promise<number> {
  const windowStart = dayString(
    now - RECOGNITION.baselineWindowDays * DAY_MS,
    tz ?? 0,
  );
  const yesterday = dayString(now - DAY_MS, tz ?? 0);
  const sumPrev = await stepsForWeek(ctx, userId, windowStart, yesterday);
  const avg = sumPrev / RECOGNITION.baselineWindowDays;
  const baseline = Math.max(avg, IMPROVEMENT_FLOOR);
  return todaySteps / baseline;
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const ug = await getUserGroup(ctx, userId);
    if (!ug) return null;
    const group = ug.group;
    const tz = group.tzOffsetMinutes;

    const now = Date.now() + (await getClockOffsetMs(ctx));
    const date = dayString(now, tz ?? 0);
    const yesterday = dayString(now - DAY_MS, tz ?? 0);
    const { weekStart, weekEnd } = weekRange(now, tz ?? 0);

    // The challenge whose contributions we attribute (active, else latest).
    let challenge = await ctx.db
      .query("challenges")
      .withIndex("by_group_and_status", (q) =>
        q.eq("groupId", group._id).eq("status", "active"),
      )
      .first();
    if (!challenge) {
      challenge = await ctx.db
        .query("challenges")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .order("desc")
        .first();
    }
    const dmgByUser = new Map<string, number>();
    if (challenge) {
      const ch = challenge;
      const rows = await ctx.db
        .query("challengeProgress")
        .withIndex("by_challenge", (q) => q.eq("challengeId", ch._id))
        .collect();
      for (const r of rows) dmgByUser.set(r.userId, r.damageContributed);
    }

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const cls = CLASSES[MVP_CLASS];

    const members: Array<{
      userId: Id<"users">;
      displayName: string;
      isMe: boolean;
      isSimulated: boolean;
      damage: number;
      todaySteps: number;
      weeklySteps: number;
      jobLevel: number;
      jobName: string;
      displayStreak: number;
      improvementPct: number;
      _improvement: number;
    }> = [];

    for (const m of memberships) {
      const u = await ctx.db.get(m.userId);
      if (!u) continue;
      const weekly = await stepsForWeek(ctx, m.userId, weekStart, weekEnd);
      const jobLevel = jobLevelForWeeklySteps(weekly);
      const todaySteps = await stepsForDate(ctx, m.userId, date);
      const rawStreak = u.streakCount ?? 0;
      const alive = u.lastDeployDate === date || u.lastDeployDate === yesterday;
      const displayStreak = alive ? rawStreak : 0;
      const improvement = await improvementScore(
        ctx,
        m.userId,
        tz,
        now,
        date,
        todaySteps,
      );
      members.push({
        userId: m.userId,
        displayName: u.displayName ?? "Hero",
        isMe: m.userId === userId,
        isSimulated: u.isSimulated ?? false,
        damage: Math.round(dmgByUser.get(m.userId) ?? 0),
        todaySteps,
        weeklySteps: weekly,
        jobLevel,
        jobName: cls.jobNames[jobLevel - 1],
        displayStreak,
        improvementPct: Math.round((improvement - 1) * 100),
        _improvement: improvement,
      });
    }

    members.sort((a, b) => b.damage - a.damage);

    // Recognition: improvement + consistency, normalized across the crew.
    const maxImp = Math.max(...members.map((m) => m._improvement), 0.0001);
    const maxStreak = Math.max(...members.map((m) => m.displayStreak), 1);
    let mvp: Id<"users"> | null = null;
    let mostImproved: Id<"users"> | null = null;
    let longest: Id<"users"> | null = null;
    let bestMvp = -1;
    let bestImp = -1;
    let bestStreak = -1;
    for (const m of members) {
      const mvpScore =
        RECOGNITION.improvementWeight * (m._improvement / maxImp) +
        RECOGNITION.consistencyWeight * (m.displayStreak / maxStreak);
      if (mvpScore > bestMvp) {
        bestMvp = mvpScore;
        mvp = m.userId;
      }
      if (m._improvement > bestImp) {
        bestImp = m._improvement;
        mostImproved = m.userId;
      }
      if (m.displayStreak > bestStreak) {
        bestStreak = m.displayStreak;
        longest = m.userId;
      }
    }
    if (bestStreak <= 0) longest = null; // no one has a live streak yet

    return {
      members: members.map(({ _improvement, ...rest }) => rest),
      recognition: {
        mvpUserId: mvp,
        mostImprovedUserId: mostImproved,
        longestStreakUserId: longest,
      },
      memberCount: members.length,
    };
  },
});
