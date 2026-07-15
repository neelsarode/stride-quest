// =============================================================================
// GameScreen — the M2.75 full-screen pixel HUD SHELL (STR-66, spec §6/§9).
//
// This ticket builds the SKELETON only: the live battle scene as a full-bleed
// stage, plus the empty, correctly-inset zone containers that later tickets
// (STR-67/68/69) fill with the stone-and-gold HUD chrome. It renders behind
// DEV_FLAGS.useGameScreen (default off) so the classic DashboardScreen keeps
// shipping untouched.
//
// TWO INVARIANTS this shell locks in:
//   1. It calls the SAME useGameEngine() the dashboard calls, so every game
//      effect (auto-collect, ensureSession, rally-seen, boost banner, teaching,
//      health re-sync) runs identically here — behavior cannot fork (§9.2).
//   2. The scene fills the whole stage (StyleSheet.absoluteFill); its own
//      layout math turns the full viewport into the battlefield-ui parity
//      composition. Zones float ABOVE it at zIndex 100+ (scene FX are z60–62,
//      kit convention), positioned off topPad/bottomPad + the GAME_ZONES table.
// =============================================================================
import { StyleSheet, View } from "react-native";
import { GAME_ZONES } from "../config/assets";
import { ConnectedBattleScene } from "../battle/ConnectedBattleScene";
import { useGameEngine } from "./useGameEngine";
import { useGameLayout } from "./useGameLayout";

export function GameScreen() {
  // Run the shared brain. The shell doesn't render its data yet (empty zones),
  // but calling it here is what guarantees the game logic runs when the flag is
  // on — the dashboard and this screen share ONE engine and can't drift.
  useGameEngine();

  const { topPad, bottomPad } = useGameLayout();

  return (
    <View style={styles.root}>
      {/* THE STAGE — the scene IS the screen (spec §6): full-bleed, edge to
          edge. It lays itself out from this box; a full-viewport box is exactly
          the battlefield-ui parity math. */}
      <ConnectedBattleScene style={StyleSheet.absoluteFill} />

      {/* HUD ZONES — empty positioned containers only (STR-66). Later tickets
          fill each; here they just stake out the §6 layout, inset by the safe
          area, above the scene's FX layer. */}

      {/* Top bar — identity + week/day + reset countdown. Full width. */}
      <View
        testID="zone-top-bar"
        style={[styles.zone, styles.fullWidth, { top: topPad + GAME_ZONES.topBarTop }]}
      />

      {/* Fuel gauge — below identity, left-aligned. */}
      <View
        testID="zone-fuel"
        style={[styles.zone, { top: topPad + GAME_ZONES.fuelTop, left: GAME_ZONES.fuelLeft }]}
      />

      {/* Boss plate — centered gold HP bar. */}
      <View
        testID="zone-boss-plate"
        style={[styles.zone, styles.centeredRow, { top: topPad + GAME_ZONES.bossPlateTop }]}
      />

      {/* Party rail — horizontal portrait row, centered. */}
      <View
        testID="zone-party-rail"
        style={[styles.zone, styles.centeredRow, { top: topPad + GAME_ZONES.partyRailTop }]}
      />

      {/* Right nav — guild / stats / help column. */}
      <View
        testID="zone-right-nav"
        style={[styles.zone, { top: topPad + GAME_ZONES.rightNavTop, right: GAME_ZONES.rightNavRight }]}
      />

      {/* Overdrive bar — above the command dock, centered. */}
      <View
        testID="zone-overdrive"
        style={[styles.zone, styles.centeredRow, { bottom: bottomPad + GAME_ZONES.overdriveBottom }]}
      />

      {/* Command dock — DEPLOY / COLLECT / steps ring. Full width. */}
      <View
        testID="zone-command-dock"
        style={[styles.zone, styles.fullWidth, { bottom: bottomPad + GAME_ZONES.dockBottom }]}
      />

      {/* Job strip — job badge + full-width XP bar, at the very bottom pad. */}
      <View
        testID="zone-job-strip"
        style={[styles.zone, styles.fullWidth, { bottom: bottomPad + GAME_ZONES.jobStripBottom }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  // Every zone is an absolutely-positioned container ABOVE the scene FX (z60–62)
  // — the kit's z100+ HUD convention. Empty this round; later tickets fill them.
  // box-none keeps the empty containers touch-transparent, so taps still reach
  // the heroes in the scene beneath (spec §7: scene taps fire ultimates).
  zone: { position: "absolute", zIndex: 100, pointerEvents: "box-none" },
  fullWidth: { left: 0, right: 0 },
  centeredRow: { left: 0, right: 0, alignItems: "center" },
});

export default GameScreen;
