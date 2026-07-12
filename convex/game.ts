// =============================================================================
// Dashboard — the single reactive query the home screen subscribes to.
// =============================================================================
// SERVER owns the clock now: it computes the effective date/week (honoring the
// guild timezone + the dev clock offset) and returns them. Because it reads the
// dev clock, advancing the clock reactively re-runs this query on every screen.
// Boss HP is derived: maxHP − Σ(damage from all members).
// =============================================================================
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { stepsForDate, stepsForWeek } from "./steps";
import { getUserGroup } from "./players";
import { energyBalance } from "./economy";
import { getClockOffsetMs, dayString, weekRange } from "./time";
import {
  CLASSES,
  MVP_CLASS,
  JOB_THRESHOLDS,
  XP_PER_STEP,
  BASE_IDLE_DPH,
  OFFLINE_CAP_MS,
  DAILY_STEP_GOAL,
  jobLevelForWeeklySteps,
  multiplierForJobLevel,
  nextJobThreshold,
} from "./gameConfig";
import { computeStreakMultiplier } from "./streak";

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const user = await ctx.db.get(userId);
    if (user === null) return null;

    const ug = await getUserGroup(ctx, userId);
    const group = ug?.group ?? null;
    const tz = group?.tzOffsetMinutes ?? 0;

    // Effective time (reading the dev clock makes this reactive to time-travel).
    const offsetMs = await getClockOffsetMs(ctx);
    const now = Date.now() + offsetMs;
    const date = dayString(now, tz);
    const { weekStart, weekEnd } = weekRange(now, tz);

    // Boss: prefer the ACTIVE boss; else show the latest (e.g. a just-defeated
    // boss in its victory-lap before next week's spawn).
    let challenge = group
      ? await ctx.db
          .query("challenges")
          .withIndex("by_group_and_status", (q) =>
            q.eq("groupId", group._id).eq("status", "active"),
          )
          .first()
      : null;
    if (!challenge && group) {
      challenge = await ctx.db
        .query("challenges")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .order("desc")
        .first();
    }

    let currentHP = challenge?.bossMaxHP ?? 0;
    let myProgress: Doc<"challengeProgress"> | null = null;
    if (challenge) {
      const ch = challenge;
      const rows = await ctx.db
        .query("challengeProgress")
        .withIndex("by_challenge", (q) => q.eq("challengeId", ch._id))
        .collect();
      const totalDamage = rows.reduce((s, r) => s + r.damageContributed, 0);
      currentHP = Math.max(0, ch.bossMaxHP - totalDamage);
      myProgress = rows.find((r) => r.userId === userId) ?? null;
    }

    const stepsToday = await stepsForDate(ctx, userId, date);
    const stepsThisWeek = await stepsForWeek(ctx, userId, weekStart, weekEnd);
    const jobLevel = jobLevelForWeeklySteps(stepsThisWeek);
    const cls = CLASSES[MVP_CLASS];

    // Dual meters: Job XP (weekly cumulative, never spent) + Energy (spendable bank).
    const jobXp = stepsThisWeek * XP_PER_STEP;
    const energy = await energyBalance(ctx, userId);

    // Idle: rate the client uses to extrapolate a live "pending idle" ticker.
    const idleMult =
      myProgress?.idleMultiplierSnapshot ?? multiplierForJobLevel(jobLevel);
    const idle = {
      lastIdleCollectedAt: myProgress?.lastIdleCollectedAt ?? now,
      dph: BASE_IDLE_DPH * idleMult,
      capMs: OFFLINE_CAP_MS,
    };

    // Streak: shown as 0 if the chain is broken (no deploy today or yesterday).
    const yesterday = dayString(now - 86_400_000, tz);
    const rawStreak = user.streakCount ?? 0;
    const deployedToday = user.lastDeployDate === date;
    const streakAlive = deployedToday || user.lastDeployDate === yesterday;
    const shownStreak = streakAlive ? rawStreak : 0;
    // The multiplier PREVIEW reflects the deploy you'd make right now: continuing
    // the chain adds a day (unless you already deployed today). Keeps the button's
    // "×N.NN" readout equal to the damage the deploy will actually apply.
    const prospectiveStreak = deployedToday
      ? rawStreak
      : streakAlive
        ? rawStreak + 1
        : 1;
    const { multiplier: streakMult, avgSteps: streakAvgSteps } =
      await computeStreakMultiplier(ctx, userId, tz, now, prospectiveStreak, jobLevel, date);
    const streak = {
      count: shownStreak,
      longest: user.longestStreak ?? 0,
      deployedToday,
      multiplier: streakMult,
      avgStepsDuringStreak: Math.round(streakAvgSteps),
    };

    const dailyGoal = {
      goal: DAILY_STEP_GOAL,
      steps: stepsToday,
      hit: stepsToday >= DAILY_STEP_GOAL,
    };

    return {
      // server-authoritative time (client uses `now` for idle extrapolation)
      now,
      date,
      weekStart,
      weekEnd,
      devClockOffsetMs: offsetMs,
      player: {
        id: user._id,
        displayName: user.displayName ?? "New Hero",
        className: cls.displayName,
        jobLevel,
        jobName: cls.jobNames[jobLevel - 1],
        idleMultiplier: multiplierForJobLevel(jobLevel),
      },
      guild: group ? { id: group._id, name: group.name } : null,
      boss: challenge
        ? {
            id: challenge._id,
            name: challenge.bossName,
            maxHP: challenge.bossMaxHP,
            currentHP,
            tier: challenge.tier ?? 1,
            status: challenge.status,
            defeated: challenge.status === "won",
            startDate: challenge.startDate,
            endDate: challenge.endDate,
          }
        : null,
      steps: { today: stepsToday, thisWeek: stepsThisWeek },
      meters: {
        energy, // spendable Energy bank
        jobXp, // weekly cumulative Job XP
        jobThreshold: JOB_THRESHOLDS[jobLevel - 1], // XP at the start of this job
        nextJobThreshold: nextJobThreshold(jobLevel), // null if maxed (Job 5)
      },
      idle,
      streak,
      dailyGoal,
    };
  },
});
