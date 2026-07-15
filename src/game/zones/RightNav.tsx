// =============================================================================
// RightNav — GameScreen right nav column (guild / stats / help buttons).
// SCAFFOLD STUB (M2.75): positioned empty container only.
// ► Filled by STR-69. Buttons open the guild sheet / stats sheet / help modal
// (via the overlay mechanism STR-69 defines in ../Overlays.tsx — same ticket).
// =============================================================================
import { View } from "react-native";
import { GAME_ZONES } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

export function RightNav() {
  const { topPad } = useGameLayout();
  return (
    <View
      testID="zone-right-nav"
      style={[zoneStyles.zone, { top: topPad + GAME_ZONES.rightNavTop, right: GAME_ZONES.rightNavRight }]}
    >
      {/* STR-69: 3 silver 18-art buttons → guild sheet / stats sheet / help modal. */}
    </View>
  );
}
