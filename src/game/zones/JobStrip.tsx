// =============================================================================
// JobStrip — GameScreen bottom zone (job badge roundel + full-width XP bar).
// SCAFFOLD STUB (M2.75): positioned empty container only.
// ► Filled by STR-68 (command dock + job strip). "12,000 / 25,000 XP".
// =============================================================================
import { View } from "react-native";
import { GAME_ZONES } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

export function JobStrip() {
  const { bottomPad } = useGameLayout();
  return (
    <View
      testID="zone-job-strip"
      style={[zoneStyles.zone, zoneStyles.fullWidth, { bottom: bottomPad + GAME_ZONES.jobStripBottom }]}
    >
      {/* STR-68: job badge roundel (number) + full-width slim XP bar. */}
    </View>
  );
}
