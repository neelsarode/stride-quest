// =============================================================================
// FuelGauge — GameScreen fuel-tank zone (slim bar + FUEL label + state chip).
// SCAFFOLD STUB (M2.75): positioned empty container only.
// ► Filled by STR-67 (top HUD zones). Resting stays DIGNIFIED — never red,
// never shame copy (fuel-hybrid spec §guardrails). Reuse fmtFightShort copy.
// =============================================================================
import { View } from "react-native";
import { GAME_ZONES } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

export function FuelGauge() {
  const { topPad } = useGameLayout();
  return (
    <View
      testID="zone-fuel"
      style={[zoneStyles.zone, { top: topPad + GAME_ZONES.fuelTop, left: GAME_ZONES.fuelLeft }]}
    >
      {/* STR-67: slim sky-fill bar ("FIGHTS 21H") + FUEL label + BATTLING/WINDED/RESTING chip. */}
    </View>
  );
}
