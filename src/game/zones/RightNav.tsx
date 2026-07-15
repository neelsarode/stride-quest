// =============================================================================
// RightNav — GameScreen right nav column (STR-69). Three silver 18-art nav
// buttons (emblems baked / drawn on the face) that open the slide-up sheets and
// the help modal via the ../Overlays store: guild banner → GuildSheet, bar chart
// → StatsSheet, "?" → help modal. Ported from battlefield-ui's right-nav column.
// =============================================================================
import { View } from "react-native";
import { Button, UIScaleProvider } from "../../ui";
import { BakedImage } from "../../ui/Baked";
import { UI_PALETTE } from "../../ui/theme";
import { GAME_ZONES } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { openGuild, openHelp, openStats } from "../Overlays";
import { zoneStyles } from "./zoneStyle";

export function RightNav() {
  const { topPad, artScale } = useGameLayout();
  return (
    <View
      testID="zone-right-nav"
      style={[
        zoneStyles.zone,
        { top: topPad + GAME_ZONES.rightNavTop, right: GAME_ZONES.rightNavRight },
      ]}
    >
      <UIScaleProvider value={artScale}>
        <View style={{ gap: Math.round(4.5 * artScale) }}>
          <Button asset="btn_nav_silver" onPress={openGuild} scale={artScale}>
            <BakedImage name="icon_banner" scale={artScale} />
          </Button>
          <Button asset="btn_nav_silver" onPress={openStats} scale={artScale}>
            <ChartGlyph scale={artScale} />
          </Button>
          <Button
            asset="btn_nav_silver"
            label="?"
            labelScale={2}
            onPress={openHelp}
            scale={artScale}
          />
        </View>
      </UIScaleProvider>
    </View>
  );
}

// A 3-bar chart emblem (stats) — battlefield-ui's chartDraw: three outlined
// bars of heights 5 / 10 / 7 art px, the middle one gold, bottoms aligned.
function ChartGlyph({ scale }: { scale: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 10 * scale }}>
      <ChartBar h={5} color={UI_PALETTE.silver_rim} scale={scale} />
      <ChartBar h={10} color={UI_PALETTE.gold_mid} scale={scale} />
      <ChartBar h={7} color={UI_PALETTE.silver_rim} scale={scale} />
    </View>
  );
}

function ChartBar({ h, color, scale }: { h: number; color: string; scale: number }) {
  return (
    <View
      style={{
        width: 4 * scale,
        height: h * scale,
        backgroundColor: UI_PALETTE.outline,
        justifyContent: "flex-start",
        alignItems: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          left: 1 * scale,
          top: 1 * scale,
          width: 2 * scale,
          height: (h - 2) * scale,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
