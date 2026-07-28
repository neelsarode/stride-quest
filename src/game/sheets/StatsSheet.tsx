// =============================================================================
// StatsSheet — the detail panel for everything that didn't become a HUD element
// (STR-69, spec §7): the meters in full (Job XP + Energy), steps today/week and
// the daily goal, the idle-combat rate, and the streak breakdown. Slide-up Sheet
// chrome; numbers straight off the shared dashboard query (read-only).
// =============================================================================
import { ScrollView, View } from "react-native";
import { DAILY_STEP_GOAL } from "../../../convex/gameConfig";
import { Bar, Chip, PixelText, Sheet, useUITheme } from "../../ui";
import { UI_PALETTE } from "../../ui/theme";
import { useGameLayout } from "../useGameLayout";

type StatsData = {
  player: { jobLevel: number; idleMultiplier: number };
  meters: {
    energy: number;
    jobXp: number;
    jobThreshold: number;
    nextJobThreshold: number | null;
  };
  steps: { today: number; thisWeek: number };
  idle: { dph: number; capMs: number };
  streak: {
    count: number;
    multiplier: number;
    longest: number;
    avgStepsDuringStreak: number;
  };
  dailyGoal: { goal: number; steps: number; hit: boolean };
};

export function StatsSheet({
  data,
  onClose,
}: {
  data: StatsData;
  onClose: () => void;
}) {
  const { artScale, width, height } = useGameLayout();
  const theme = useUITheme();
  const s = artScale;
  const barW = Math.floor((width - 24) / s); // art px, fits the sheet content well

  const { meters, steps, idle, streak, dailyGoal, player } = data;
  const jobMaxed = meters.nextJobThreshold == null;
  const jobProgress = meters.jobXp - meters.jobThreshold;
  const jobSpan = jobMaxed ? 1 : meters.nextJobThreshold! - meters.jobThreshold;
  const jobFrac = jobMaxed ? 1 : Math.max(0, Math.min(1, jobProgress / jobSpan));
  const energyFrac = Math.max(0, Math.min(1, meters.energy / DAILY_STEP_GOAL));
  const idleCapH = Math.round(idle.capMs / 3_600_000);

  return (
    <Sheet visible onClose={onClose} height={Math.round(height * 0.56)} scale={s}>
      <ScrollView showsVerticalScrollIndicator style={{ flex: 1 }}>
        <PixelText text="STATS" color={UI_PALETTE.gold_mid} scale={s} />

        {/* Job XP */}
        <View style={{ marginTop: 8 * s, gap: 3 * s }}>
          <PixelText text={`JOB XP - JOB ${player.jobLevel}`} color={theme.accent.mid} scale={s} />
          <Bar
            variant="slim"
            width={barW}
            value={jobFrac}
            fill="gold"
            label={
              jobMaxed
                ? "MAX JOB"
                : `${jobProgress.toLocaleString()} / ${jobSpan.toLocaleString()} XP`
            }
            scale={s}
          />
        </View>

        {/* Energy */}
        <View style={{ marginTop: 8 * s, gap: 3 * s }}>
          <PixelText text="ENERGY - SUPER ATTACK FUEL" color={theme.accent.mid} scale={s} />
          <Bar
            variant="slim"
            width={barW}
            value={energyFrac}
            fill="accent"
            label={`${meters.energy.toLocaleString()} ENERGY`}
            scale={s}
          />
        </View>

        {/* Steps + goal */}
        <View style={{ marginTop: 10 * s, gap: 4 * s }}>
          <StatLine label="STEPS TODAY" value={steps.today.toLocaleString()} scale={s} />
          <StatLine label="STEPS THIS WEEK" value={steps.thisWeek.toLocaleString()} scale={s} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <PixelText text="DAILY GOAL" color={theme.accent.mid} scale={s} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 * s }}>
              <PixelText
                text={`${dailyGoal.steps.toLocaleString()} / ${dailyGoal.goal.toLocaleString()}`}
                color={UI_PALETTE.silver_rim}
                scale={s}
              />
              {dailyGoal.hit && <Chip label="GOAL" color="green" scale={s} />}
            </View>
          </View>
        </View>

        {/* Idle combat */}
        <View style={{ marginTop: 10 * s, gap: 4 * s }}>
          <PixelText text="IDLE COMBAT" color={UI_PALETTE.gold_mid} scale={s} />
          <StatLine label="AUTO-ATTACK" value={`X${player.idleMultiplier}`} scale={s} />
          <StatLine
            label="DAMAGE / HOUR"
            value={Math.round(idle.dph).toLocaleString()}
            scale={s}
          />
          <StatLine label="OFFLINE CAP" value={`${idleCapH}H`} scale={s} />
        </View>

        {/* Streak */}
        <View style={{ marginTop: 10 * s, gap: 4 * s }}>
          <PixelText text="STREAK" color={UI_PALETTE.gold_mid} scale={s} />
          <StatLine label="CURRENT" value={`${streak.count} DAYS`} scale={s} />
          <StatLine label="SUPER ATTACK POWER" value={`X${streak.multiplier.toFixed(2)}`} scale={s} />
          <StatLine label="LONGEST EVER" value={`${streak.longest} DAYS`} scale={s} />
          <StatLine
            label="AVG STEPS / DAY"
            value={streak.avgStepsDuringStreak.toLocaleString()}
            scale={s}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

function StatLine({
  label,
  value,
  scale,
}: {
  label: string;
  value: string;
  scale: number;
}) {
  const theme = useUITheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <PixelText text={label} color={theme.accent.mid} scale={scale} />
      <PixelText text={value} color={UI_PALETTE.silver_rim} scale={scale} />
    </View>
  );
}
