// =============================================================================
// FuelGauge — GameScreen fuel-tank zone (slim sky bar + FUEL label + state chip).
// STR-67 (top HUD). Owns this file — full content + position within it.
//
// Layout target: dashboard-ui.html #fuelwrap (slim bar, "Fights 21h more",
// FUEL + BATTLING/WINDED/RESTING). Reuses the fuel snapshot the classic screen
// reads (data.fuel) and the SAME time copy (fmtFightShort) — swapping only the
// render to the baked S8 kit. Reactive read of api.game.dashboard; no engine
// effects (see TopBar note).
//
// LAYOUT NOTE: rendered as a COMPACT SINGLE ROW ([FUEL] [bar] [state chip])
// rather than the mock's stacked bar+meta, because the current GAME_ZONES
// starting offsets (fuel +52, boss +56, party +146) leave too little vertical
// room for a stacked gauge AND the full boss plate above the party rail. Single-
// row keeps every element the mock lists while freeing that band. (TODO: once
// the offsets settle in STR-71 integration, revisit stacked meta.)
//
// HARD GUARDRAIL (fuel-hybrid spec §3): RESTING stays DIGNIFIED — calm neutrals
// (theme STATE_COLORS.resting = sky, never red), never shame copy. The bar just
// reads empty; the chip says RESTING; nothing scolds.
// =============================================================================
import { StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { GAME_ZONES } from "../../config/assets";
import { fmtFightShort } from "../../fuelCopy";
import { Bar, PixelText, UIScaleProvider } from "../../ui";
import { STATE_COLORS } from "../../ui/theme";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

// --- local layout feel (component-local by design — the slim gauge's own
// widths/gaps; the shared fuel-time copy now lives in src/fuelCopy.ts, imported
// above so the gauge and the classic card read byte-identical strings).
const FUEL_BAR_ART_W = 64; // slim bar width (art px) — leaves room for label + chip
const ROW_GAP = 6; // dp between FUEL label / bar / state chip
const LABEL_COLOR = "#cdb98a"; // dashboard-ui #fuellabel parchment

type FuelState = "battling" | "winded" | "resting";

export function FuelGauge() {
  const { topPad, artScale } = useGameLayout();
  const data = useQuery(api.game.dashboard, {});
  if (!data) return null;

  const fuel = data.fuel;
  const state = fuel.state as FuelState;
  const resting = state === "resting";
  const value = fuel.tankCap > 0 ? fuel.current / fuel.tankCap : 0;
  // On-bar label: fight time in every fighting state; a dignified word when the
  // tank is empty (never "0H", never shame). Font is caps-only for the atlas.
  const barLabel = resting
    ? "RESTING"
    : `FIGHTS ${fmtFightShort(fuel.hoursToEmpty).toUpperCase()}`;
  const stateColor = STATE_COLORS[state];

  return (
    <View
      testID="zone-fuel"
      style={[zoneStyles.zone, { top: topPad + GAME_ZONES.fuelTop, left: GAME_ZONES.fuelLeft }]}
    >
      <UIScaleProvider value={artScale}>
        <View style={styles.row}>
          <PixelText text="FUEL" color={LABEL_COLOR} />
          <Bar variant="slim" width={FUEL_BAR_ART_W} value={value} fill="accent" label={barLabel} />
          {/* State chip — custom small pill (no baked state-chip asset; the kit
              Chip is only green/red/gold and resting must never read red). */}
          <View style={[styles.stateChip, { borderColor: stateColor }]}>
            <PixelText text={state.toUpperCase()} color={stateColor} />
          </View>
        </View>
      </UIScaleProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: ROW_GAP },
  stateChip: {
    borderWidth: 1,
    borderRadius: 7,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: "rgba(10,14,22,0.82)",
  },
});

export default FuelGauge;
