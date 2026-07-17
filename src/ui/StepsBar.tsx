// =============================================================================
// StepsBar — the daily steps / goal indicator as a VERTICAL SEGMENTED bar
// (owner-picked "variant A", replaces the circular Ring next to SUPER ATTACK).
//
// Drawn fillRect-style in the procedural kit look — NO baked asset, just crisp
// Views sized in ART px × scale like every primitive (same technique as
// RightNav's ChartGlyph / the fuel sliver): a silver slim frame (outline → lit
// silver bevel → inner outline → recessed dark well) with N green "power cells"
// filling BOTTOM-UP (light top / mid body / dark bottom per cell), 1px outline
// separators between cells. Height is passed by the dock so it matches the
// SUPER button exactly. The goal-hit celebration (bloom) stays in the dock, on
// a shared value — this component is a pure reactive read of `value`.
// =============================================================================
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { UI_FILLS, UI_PALETTE } from "./theme";
import { useResolvedScale } from "./scale";

const CELLS = 7; // "power cells" (variant A)
const GAP = 1; // art px between cells
const FRAME = 3; // slim frame thickness (art px)
const RADIUS = 6; // corner radius (art px) — matches the SUPER button face (kit hifiFace r)

// Silver frame ramp — matches the baked bar_slim silver material (S8 HUD).
const F_OUT = UI_PALETTE.outline; // outer + inner outline (near-black)
const F_RIM = UI_PALETTE.silver_rim; // lit top edge
const F_BODY = "#98a5b3"; // silver body / sides (kit silver "m")
const F_SHADOW = "#3f4854"; // dark bottom edge (kit silver "dp")
const WELL = "#131f33"; // recessed dark well (HUD night well)

export interface StepsBarProps {
  /** Fill fraction 0..1. */
  value?: number;
  /** Bar width in ART px (default 24). */
  width?: number;
  /** Bar height in ART px — the dock passes the SUPER button height (35). */
  height?: number;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function StepsBar({
  value = 0,
  width = 24,
  height = 35,
  scale,
  style,
}: StepsBarProps) {
  const s = useResolvedScale(scale);
  const W = width;
  const H = height;
  const wellW = W - 2 * FRAME;
  const wellH = H - 2 * FRAME;

  // Cell layout: N cells + (N-1) 1px gaps tile the WHOLE well (float cell height,
  // boundaries rounded per cell → cells differ by ≤1px but leave no gap at the
  // top, so a full bar reads completely full). i = 0 is the bottom cell.
  const ch = (wellH - (CELLS - 1) * GAP) / CELLS;
  const filled = Math.max(0, Math.min(1, value)) * CELLS;

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < CELLS; i++) {
    const cellBottom = Math.round(wellH - i * (ch + GAP)); // coords within the well
    const cellTop = Math.round(cellBottom - ch);
    const cellSpan = cellBottom - cellTop;
    // 1px outline separator in the gap above this cell (all but the top cell).
    if (i < CELLS - 1) {
      cells.push(
        <View
          key={`sep${i}`}
          style={{
            position: "absolute",
            left: 0,
            top: (cellTop - GAP) * s,
            width: wellW * s,
            height: GAP * s,
            backgroundColor: F_OUT,
          }}
        />,
      );
    }
    const rem = Math.max(0, Math.min(1, filled - i));
    if (rem <= 0) continue;
    const fh = Math.max(1, Math.round(rem * cellSpan)); // partial fill of the active cell
    const fillTop = cellBottom - fh;
    cells.push(
      <View
        key={`c${i}`}
        style={{
          position: "absolute",
          left: 0,
          top: fillTop * s,
          width: wellW * s,
          height: fh * s,
          backgroundColor: UI_FILLS.green.mid,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: wellW * s,
            height: s,
            backgroundColor: UI_FILLS.green.light,
          }}
        />
        {fh > 1 && (
          <View
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              width: wellW * s,
              height: s,
              backgroundColor: UI_FILLS.green.dark,
            }}
          />
        )}
      </View>,
    );
  }

  return (
    <View style={[{ width: W * s, height: H * s }, style]}>
      {/* outline */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W * s,
          height: H * s,
          borderRadius: RADIUS * s,
          backgroundColor: F_OUT,
        }}
      />
      {/* silver bevel band (lit top edge, dark bottom edge) */}
      <View
        style={{
          position: "absolute",
          left: s,
          top: s,
          width: (W - 2) * s,
          height: (H - 2) * s,
          borderRadius: (RADIUS - 1) * s,
          overflow: "hidden",
          backgroundColor: F_BODY,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            height: s,
            backgroundColor: F_RIM,
          }}
        />
        <View
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            right: 0,
            height: s,
            backgroundColor: F_SHADOW,
          }}
        />
      </View>
      {/* inner outline */}
      <View
        style={{
          position: "absolute",
          left: 2 * s,
          top: 2 * s,
          width: (W - 4) * s,
          height: (H - 4) * s,
          borderRadius: (RADIUS - 2) * s,
          backgroundColor: F_OUT,
        }}
      />
      {/* recessed well + the green power cells */}
      <View
        style={{
          position: "absolute",
          left: FRAME * s,
          top: FRAME * s,
          width: wellW * s,
          height: wellH * s,
          borderRadius: (RADIUS - 3) * s,
          backgroundColor: WELL,
          overflow: "hidden",
        }}
      >
        {cells}
      </View>
    </View>
  );
}

export default StepsBar;
