// =============================================================================
// OverdriveMeter — the classic DashboardScreen's Overdrive readout.
// =============================================================================
// Core Loop v2 (spec §5.4, STR-74) RETRIGGERED Overdrive: it is no longer a
// player-ACTIVATED fever mode with a charge meter + ACTIVATE button. Hitting the
// daily step goal auto-enters Overdrive ×N until the next daily reset, boosting
// both idle and Super Attacks. So this component is now a simple STATUS strip:
//   inactive → progress toward the goal that arms it ("4,200 / 6,000")
//   active   → "×2 ACTIVE — until reset" (calm celebratory purple, no button)
// DashboardScreen is the classic fallback screen; the polished GameScreen strip
// is OverdriveBar (STR-79). No interaction here anymore.
// =============================================================================
import { StyleSheet, Text, View } from "react-native";
import { PALETTE } from "../config/assets";
import { AnimatedMeter } from "./AnimatedMeter";

export function OverdriveMeter({
  active,
  mult,
  stepsToday,
  goal,
}: {
  active: boolean;
  mult: number;
  stepsToday: number; // today's steps (goal progress that arms Overdrive)
  goal: number; // DAILY_STEP_GOAL
}) {
  return (
    <View style={styles.wrap}>
      <AnimatedMeter
        label="OVERDRIVE"
        value={active ? goal : Math.min(stepsToday, goal)}
        max={goal}
        color={PALETTE.overdrive}
        valueText={
          active
            ? `×${mult} ACTIVE`
            : `${stepsToday.toLocaleString()} / ${goal.toLocaleString()}`
        }
      />
      <Text style={styles.hint}>
        {active
          ? `Overdrive is live — ×${mult} damage on idle AND your Super Attack until the daily reset.`
          : `Hit your ${goal.toLocaleString()}-step daily goal to auto-enter Overdrive ×${mult} for the rest of the day.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hint: { color: PALETTE.textDim, fontSize: 12, lineHeight: 18 },
});
