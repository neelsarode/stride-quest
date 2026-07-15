// =============================================================================
// TopBar — GameScreen top HUD zone (identity + week/day + reset countdown).
// SCAFFOLD STUB (M2.75): renders the positioned empty container only.
// ► Filled by STR-67 (top HUD zones). Owns this file — position + content.
// Spec §6 (top bar zone) + §7. Wire live data via useGameEngine.
// =============================================================================
import { View } from "react-native";
import { GAME_ZONES } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

export function TopBar() {
  const { topPad } = useGameLayout();
  return (
    <View
      testID="zone-top-bar"
      style={[zoneStyles.zone, zoneStyles.fullWidth, { top: topPad + GAME_ZONES.topBarTop }]}
    >
      {/* STR-67: portrait + name + class/job + streak/shield chips; right:
          WEEK N · DAY + boss-reset countdown; scrim gradient; CONNECT HEALTH chip. */}
    </View>
  );
}
