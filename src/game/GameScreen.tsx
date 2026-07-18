// =============================================================================
// GameScreen — the M2.75 full-screen pixel HUD (spec §6/§9).
//
// The live battle scene is a full-bleed stage; the stone-and-gold HUD floats
// above it as a set of ZONE components (src/game/zones/*) plus an overlay host
// (Overlays: sheets, popovers, help modal). Renders behind
// DEV_FLAGS.useGameScreen (default off) so the classic DashboardScreen keeps
// shipping untouched.
//
// TWO INVARIANTS:
//   1. It calls the SAME useGameEngine() the dashboard calls, so every game
//      effect runs identically here — behavior cannot fork (§9.2).
//   2. The scene fills the whole stage (absoluteFill); its own layout math
//      turns the full viewport into the battlefield-ui parity composition.
//      Zones float ABOVE it (zIndex 100+; scene FX are z60–62).
//
// ZONE OWNERSHIP (each is a self-positioning component; fill its OWN file, not
// this one — that's what keeps STR-67/68/69 parallel-safe):
//   TopBar / FuelGauge / BossPlate ................ STR-67 (top HUD)
//   CommandDock / JobStrip ........................ STR-68 (bottom dock; the
//     Overdrive status now lives INSIDE the SUPER plate — the floating
//     OverdriveBar strip was retired 2026-07-16, approved od-super-lab.html A)
//   PartyRail / RightNav / Overlays / sheets/* .... STR-69 (rail + nav + sheets)
// =============================================================================
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ConnectedBattleScene } from "../battle/ConnectedBattleScene";
import {
  RevealGate,
  UIThemeProvider,
  UI_FONT_ATLASES,
  prefetchUiChrome,
  themeForClass,
  useDevThemeOverride,
} from "../ui";
import { useGameEngine } from "./useGameEngine";
import { TopBar } from "./zones/TopBar";
import { FuelGauge } from "./zones/FuelGauge";
import { BossPlate } from "./zones/BossPlate";
import { PartyRail } from "./zones/PartyRail";
import { RightNav } from "./zones/RightNav";
import { CommandDock } from "./zones/CommandDock";
import { JobStrip } from "./zones/JobStrip";
import { Overlays } from "./Overlays";

export function GameScreen() {
  // Run the shared brain — this is what guarantees the game logic runs when the
  // flag is on; the dashboard and this screen share ONE engine and can't drift.
  useGameEngine();

  // Per-class UI accent (Approach 1): resolve the theme from the player's class
  // and provide it to every zone. Reactive — a class change re-themes the HUD.
  // (Same dashboard query the zones read; Convex dedupes it to one subscription.)
  const data = useQuery(api.game.dashboard, {});
  // A dev override (the DevPanel theme cycler) wins over the real class; null =
  // honor the player's class. No-op in production (nothing sets it).
  const devThemeOverride = useDevThemeOverride();
  const theme = themeForClass(devThemeOverride ?? data?.player?.classKey);

  // Warm this class's chrome cache so the HUD (and its modals/sheets) mount with
  // decoded art — no progressive "types-in" paint. Re-warms on a class switch.
  useEffect(() => {
    prefetchUiChrome(theme.classKey);
  }, [theme.classKey]);

  return (
    <View style={styles.root}>
      {/* THE STAGE — the scene IS the screen (spec §6): full-bleed, edge to
          edge. A full-viewport box is exactly the battlefield-ui parity math. */}
      <ConnectedBattleScene style={StyleSheet.absoluteFill} />

      {/* HUD ZONES — each self-positions off useGameLayout + the GAME_ZONES
          table, above the scene FX layer. Wrapped in the theme provider (a
          Context, no layout node) so every zone reads the class accent, and in a
          RevealGate so the whole HUD comes up as ONE unit over the scene — the
          glyph/chrome <Image> loads resolve during the hold, so it never decodes
          in letter-by-letter (the "typing" effect). */}
      <UIThemeProvider theme={theme}>
        <RevealGate
          waitFor={UI_FONT_ATLASES}
          minHold={700}
          style={StyleSheet.absoluteFill}
        >
          <TopBar />
          <FuelGauge />
          <BossPlate />
          <PartyRail />
          <RightNav />
          <CommandDock />
          <JobStrip />

          {/* Overlay host — sheets / popovers / help modal, above all zones. */}
          <Overlays />
        </RevealGate>
      </UIThemeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
});

export default GameScreen;
