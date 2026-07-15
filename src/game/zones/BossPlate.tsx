// =============================================================================
// BossPlate — GameScreen boss zone (name + gold HP bar; bonus-week crowned
// meter + tier ticks + boost chip). SCAFFOLD STUB (M2.75): positioned empty
// container only.
// ► Filled by STR-67 (top HUD zones). Drive the bar from the same reactive
// values AnimatedHPBar/BonusMeter use today; never render the ×1.0 floor chip.
// =============================================================================
import { View } from "react-native";
import { GAME_ZONES } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

export function BossPlate() {
  const { topPad } = useGameLayout();
  return (
    <View
      testID="zone-boss-plate"
      style={[zoneStyles.zone, zoneStyles.centeredRow, { top: topPad + GAME_ZONES.bossPlateTop }]}
    >
      {/* STR-67: gold name + "WEEKLY BOSS · TIER N" + full-width gold bar (ghost +
          flash). Bonus week: crowned name, accumulating meter, "N TO ×1.2", boost chip. */}
    </View>
  );
}
