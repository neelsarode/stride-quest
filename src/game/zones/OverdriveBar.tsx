// =============================================================================
// OverdriveBar — GameScreen overdrive zone (slim charge bar above the dock).
// SCAFFOLD STUB (M2.75): positioned empty container only.
// ► Filled by STR-68 (command dock + job strip). 62% → glowing ACTIVATE at
// 100%, countdown while active. Disabled while Resting/uncharged (calm copy).
// =============================================================================
import { View } from "react-native";
import { GAME_ZONES } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

export function OverdriveBar() {
  const { bottomPad } = useGameLayout();
  return (
    <View
      testID="zone-overdrive"
      style={[zoneStyles.zone, zoneStyles.centeredRow, { bottom: bottomPad + GAME_ZONES.overdriveBottom }]}
    >
      {/* STR-68: overdrive charge bar + ACTIVATE (reuse OverdriveMeter logic). */}
    </View>
  );
}
