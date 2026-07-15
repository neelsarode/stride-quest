// =============================================================================
// CommandDock — GameScreen bottom action zone (COLLECT / DEPLOY / steps ring).
// SCAFFOLD STUB (M2.75): positioned empty container only.
// ► Filled by STR-68 (command dock + job strip). DEPLOY is the hero button
// (gold, biggest on screen). Steps ring: GOAL-HIT GLOW is IN SCOPE (owner
// decision, spec §10-Q5) — Reanimated-driven, timings/colors in assets.ts.
// =============================================================================
import { View } from "react-native";
import { GAME_ZONES } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

export function CommandDock() {
  const { bottomPad } = useGameLayout();
  return (
    <View
      testID="zone-command-dock"
      style={[zoneStyles.zone, zoneStyles.fullWidth, { bottom: bottomPad + GAME_ZONES.dockBottom }]}
    >
      {/* STR-68: COLLECT (star + pending chip) · DEPLOY (gold, energy cost +
          streak chip + first-crit hint + first-deploy pulse) · steps ring
          (33-frame) + today/goal + GOAL ✓ chip + goal-hit glow. */}
    </View>
  );
}
