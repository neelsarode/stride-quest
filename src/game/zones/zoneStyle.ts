// =============================================================================
// zoneStyle — shared absolute-positioning base for every GameScreen HUD zone
// (M2.75 scaffold). Each zone component in src/game/zones/ is a self-positioning
// container that floats ABOVE the battle scene's FX layer (scene FX are z60–62,
// kit convention → HUD is z100+). `box-none` keeps empty/gap areas touch-
// transparent so taps still reach the heroes in the scene beneath (spec §7:
// scene taps fire ultimates). Import read-only; do not edit per-ticket.
// =============================================================================
import { StyleSheet } from "react-native";

export const zoneStyles = StyleSheet.create({
  zone: { position: "absolute", zIndex: 100, pointerEvents: "box-none" },
  fullWidth: { left: 0, right: 0 },
  centeredRow: { left: 0, right: 0, alignItems: "center" },
});
