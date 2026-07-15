// =============================================================================
// PartyRail — GameScreen party zone (horizontal portrait row + invite slot).
// SCAFFOLD STUB (M2.75): positioned empty container only.
// ► Filled by STR-69 (party rail + right nav + popovers + sheets). Names hidden
// until tap (owner decision — spec §10-Q2); tap a portrait → member popover.
// =============================================================================
import { View } from "react-native";
import { GAME_ZONES } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

export function PartyRail() {
  const { topPad } = useGameLayout();
  return (
    <View
      testID="zone-party-rail"
      style={[zoneStyles.zone, zoneStyles.centeredRow, { top: topPad + GAME_ZONES.partyRailTop }]}
    >
      {/* STR-69: 18-art portrait tiles from guild.overview (1–8, me incl.), fuel
          sliver + status dot + rally beacon on resting mates, invite (+) slot at end. */}
    </View>
  );
}
