// =============================================================================
// Dashboard — the single reactive query the home screen subscribes to.
// =============================================================================
// SERVER owns the clock now: it computes the effective date/week (honoring the
// guild timezone + the dev clock offset) and returns them. Because it reads the
// dev clock, advancing the clock reactively re-runs this query on every screen.
// Boss HP is derived: maxHP − Σ(damage from all members).
// =============================================================================
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
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
  OFFLINE_CAP_MS,
  DAILY_STEP_GOAL,
  OVERDRIVE,
  RALLY,
  STREAK_SHIELD,
  jobLevelForWeeklySteps,
  multiplierForJobLevel,
  nextJobThreshold,
} from "./gameConfig";
import { computeStreakMultiplier } from "./streak";
import { continueStreak } from "./streakMath";
import { fuelSnapshot, currentBurnPerHour } from "./fuel";
import { overdriveStatus } from "./overdrive";
import {
  TANK_CAP_FUEL,
  WINDED_THRESHOLD_FUEL,
  battlingHoursForFuel,
  hoursToEmpty,
  idleDphFor,
  settleFuelAndIdleWindow,
  type FuelState,
} from "./fuelMath";

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
    let bonusDamageTotal = 0;
    let myProgress: Doc<"challengeProgress"> | null = null;
    if (challenge) {
      const ch = challenge;
      const rows = await ctx.db
        .query("challengeProgress")
        .withIndex("by_challenge", (q) => q.eq("challengeId", ch._id))
        .collect();
      const totalDamage = rows.reduce((s, r) => s + r.damageContributed, 0);
      currentHP = Math.max(0, ch.bossMaxHP - totalDamage);
      // Bonus meter (M1.5): Σ bonusDamageContributed across members — the
      // accumulating party total while the challenge is "won" (0 otherwise).
      bonusDamageTotal = rows.reduce(
        (s, r) => s + (r.bonusDamageContributed ?? 0),
        0,
      );
      myProgress = rows.find((r) => r.userId === userId) ?? null;
    }

    const stepsToday = await stepsForDate(ctx, userId, date);
    const stepsThisWeek = await stepsForWeek(ctx, userId, weekStart, weekEnd);
    const jobLevel = jobLevelForWeeklySteps(stepsThisWeek);
    // Class registry entry — class-less users (mid-onboarding, legacy) fall
    // back to the warrior MVP class, so a missing pick is never an error.
    const cls = CLASSES[user.class ?? MVP_CLASS];

    // Dual meters: Job XP (weekly cumulative, never spent) + Energy (spendable bank).
    const jobXp = stepsThisWeek * XP_PER_STEP;
    const energy = await energyBalance(ctx, userId);

    // Fuel tank: read-only snapshot (the pending burn window is walked but not
    // written — settling happens in mutations). Drives the hero-state display.
    const tank = fuelSnapshot(user, now);
    const fuel = {
      current: Math.floor(tank.fuel),
      state: tank.state, // "battling" | "winded" | "resting"
      burnPerHour: currentBurnPerHour(tank),
      hoursToEmpty: hoursToEmpty(tank.fuel),
      tankCap: TANK_CAP_FUEL,
      windedThreshold: WINDED_THRESHOLD_FUEL,
      settledAt: user.fuelSettledAt ?? now,
    };

    // Overdrive (STR-8 exposure): charge is DERIVED from the ledger (excess
    // earned − spent). Remaining time is computed SERVER-side — the raw
    // activeUntil stamp rides along for display formatting only, never for
    // client date math.
    const od = await overdriveStatus(ctx, user, now);
    const overdrive = {
      charge: od.charge, // 0..1
      chargePct: Math.round(od.charge * 100), // 0..100 for the meter label
      ready: od.ready, // the button lights up
      active: od.active, // the ×3 window is running
      remainingSeconds: od.active
        ? Math.max(0, Math.ceil((od.activeUntil! - now) / 1000))
        : 0,
      activeUntil: od.activeUntil, // raw effective-ms (display formatting only)
      durationHours: OVERDRIVE.durationHours,
      idleDamageMult: OVERDRIVE.idleDamageMult,
    };

    // Idle: fuel-driven (STR-7). `dph` is the rate at the tank's CURRENT state
    // (Battling full, Winded half, Resting zero — ×3 while Overdrive runs) for
    // the client's live ticker; `pending` is the exact uncollected damage,
    // priced over the same piecewise windows the settle will use (so the
    // preview equals what lands).
    const idleMult =
      myProgress?.idleMultiplierSnapshot ?? multiplierForJobLevel(jobLevel);
    const pendingIdle = myProgress
      ? settleFuelAndIdleWindow({
          fuel: user.fuel ?? 0,
          fuelLastAt: user.fuelSettledAt ?? now,
          idleLastAt: myProgress.lastIdleCollectedAt ?? now,
          now,
          jobMult: idleMult,
          // Overdrive-aware (STR-8) so the preview equals what the settle lands.
          overdriveUntil: user.overdriveActiveUntil,
        }).damage
      : 0;
    const idle = {
      lastIdleCollectedAt: myProgress?.lastIdleCollectedAt ?? now,
      dph:
        idleDphFor(tank.state, idleMult) *
        (od.active ? OVERDRIVE.idleDamageMult : 1),
      pending: pendingIdle,
      capMs: OFFLINE_CAP_MS,
    };

    // Streak: shown as 0 only if the chain is truly lost. Shield-aware (STR-10):
    // a missed day the pocketed Shields would silently bridge is NOT broken —
    // the streak survives at the same count. Uses the SAME continuation rule the
    // deploy applies (streakMath.continueStreak), so the shown streak and the
    // button's "×N.NN" preview equal what a deploy right now actually lands.
    // (Exposing shieldsHeld itself on the dashboard is STR-11.)
    const rawStreak = user.streakCount ?? 0;
    const deployedToday = user.lastDeployDate === date;
    const streakCont = continueStreak({
      prevStreak: rawStreak,
      shieldsHeld: user.shieldsHeld ?? 0,
      lastDeployDate: user.lastDeployDate,
      today: date,
    });
    const shownStreak = deployedToday || !streakCont.broken ? rawStreak : 0;
    const prospectiveStreak = streakCont.streak;
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

    // Streak Shields (STR-10 exposure): the pocket, plus the deploy preview —
    // `wouldConsumeOnDeploy` is how many shields a deploy RIGHT NOW would
    // silently burn to bridge missed days (0 when the chain is intact or
    // unsalvageable), from the SAME continuation rule the deploy applies.
    const shields = {
      held: user.shieldsHeld ?? 0,
      max: STREAK_SHIELD.maxHeld,
      wouldConsumeOnDeploy: streakCont.shieldsConsumed,
    };

    // Rally (STR-9 exposure): can-I-send state + who needs one + unseen
    // received rallies (the STR-15 celebration moment — sender name + hours).
    // Teammate hero states are DERIVED at read time by the same pure walk a
    // settle runs (fuelSnapshot writes nothing; queries can't write anyway).
    let rallySentToday = false;
    const rallyEligible: Array<{
      userId: Id<"users">;
      displayName: string;
      state: FuelState; // "winded" | "resting" here by construction
    }> = [];
    if (group) {
      const sent = await ctx.db
        .query("rallies")
        .withIndex("by_giver_and_date", (q) =>
          q.eq("giverId", userId).eq("date", date),
        )
        .take(1);
      rallySentToday = sent.length > 0;
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect();
      for (const m of memberships) {
        if (m.userId === userId) continue;
        const u = await ctx.db.get(m.userId);
        if (!u) continue;
        const state = fuelSnapshot(u, now).state;
        if (state !== "battling") {
          rallyEligible.push({
            userId: m.userId,
            displayName: u.displayName ?? "Hero",
            state,
          });
        }
      }
    }
    const unseenRows = await ctx.db
      .query("rallies")
      .withIndex("by_receiver_and_seen", (q) =>
        q.eq("receiverId", userId).eq("seen", false),
      )
      .take(20);
    const unseenRallies = [];
    for (const r of unseenRows) {
      const sender = await ctx.db.get(r.giverId);
      unseenRallies.push({
        rallyId: r._id,
        senderId: r.giverId,
        senderName: sender?.displayName ?? "A teammate",
        fuelGiven: r.fuelGiven,
        hours: battlingHoursForFuel(r.fuelGiven), // ≈6 (post tank-cap clamp)
        sentAt: r.createdAt,
      });
    }
    const rally = {
      sentToday: rallySentToday,
      energyCost: RALLY.energyCost,
      eligibleTeammates: rallyEligible,
      unseen: unseenRallies, // STR-15 plays these, then calls rally.markRalliesSeen
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
            // --- Bonus Boss, MINIMAL exposure (STR-55): just enough for the
            // DevPanel readout to verify the phase. The full bonus/boost UI
            // payload (tiers, currentMult, nextTier preview) is STR-56.
            // bonusBossName is only ever stamped by the kill write, so it's
            // null exactly until status === "won".
            bonusBossName: challenge.bonusBossName ?? null,
            bonusDamageTotal,
          }
        : null,
      steps: { today: stepsToday, thisWeek: stepsThisWeek },
      fuel,
      meters: {
        energy, // spendable Energy bank
        jobXp, // weekly cumulative Job XP
        jobThreshold: JOB_THRESHOLDS[jobLevel - 1], // XP at the start of this job
        nextJobThreshold: nextJobThreshold(jobLevel), // null if maxed (Job 5)
      },
      idle,
      overdrive,
      streak,
      // First-deploy hint (M2.5 teaching layer): lastDeployDate is only ever
      // written by a deploy, so its absence means this account has never hit
      // the button — the DeployButton pulses until they do.
      hasEverDeployed: user.lastDeployDate !== undefined,
      shields,
      rally,
      dailyGoal,
    };
  },
});
