// =============================================================================
// JobStrip — GameScreen bottom zone (job badge roundel + full-width XP bar).
// STR-68. The weekly job ladder as a single slim gold bar: a silver badge
// roundel engraved with the job number on the left, then a full-width XP bar
// ("12,000 / 25,000 XP", or "MAX JOB" at the top of the ladder). Re-skins the
// dashboard's JOB XP AnimatedMeter — the <Bar> primitive springs its fill on a
// Reanimated shared value, so it moves with ZERO per-frame re-renders (spec §12).
//
// Data mirrors the effect-free parts of useGameEngine (see CommandDock's note on
// why zones read useQuery directly instead of calling the hook). Sits at the very
// bottom pad; the command dock rides above it (GAME_ZONES.dockBottom) so the two
// never collide.
// =============================================================================
import React from "react";
import { View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { DOCK, GAME_ZONES } from "../../config/assets";
import { Badge, Bar, UIScaleProvider } from "../../ui";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

const BADGE_W = 18; // badge_silver art width

export function JobStrip() {
  const { bottomPad, artScale: s, width } = useGameLayout();
  const data = useQuery(api.game.dashboard, {});

  const outer = [
    zoneStyles.zone,
    zoneStyles.fullWidth,
    { bottom: bottomPad + GAME_ZONES.jobStripBottom },
  ];
  if (!data) return <View testID="zone-job-strip" style={outer} />;

  const m = data.meters;
  const jobLevel = data.player.jobLevel;
  const jobProgress = m.jobXp - m.jobThreshold;
  const jobSpan = m.nextJobThreshold != null ? m.nextJobThreshold - m.jobThreshold : 1;
  const jobMaxed = m.nextJobThreshold == null;
  const value = jobMaxed ? 1 : jobSpan > 0 ? jobProgress / jobSpan : 0;
  const label = jobMaxed
    ? "MAX JOB"
    : `${jobProgress.toLocaleString()} / ${jobSpan.toLocaleString()} XP`;

  // Lay the strip out in ART px derived from the device width, then hand the
  // XP bar its exact width (a full-width 3-slice bar).
  const gap = DOCK.jobStripBadgeGap;
  const totalArt = width / s;
  const barW = Math.max(
    2 * 9 + 1,
    Math.round(totalArt - 2 * DOCK.sidePad - BADGE_W - gap),
  );

  return (
    <View testID="zone-job-strip" style={outer}>
      <UIScaleProvider value={s}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: DOCK.sidePad * s,
          }}
        >
          <Badge label={String(jobLevel)} />
          <Bar
            variant="slim"
            fill="gold"
            width={barW}
            value={value}
            label={label}
            style={{ marginLeft: gap * s }}
          />
        </View>
      </UIScaleProvider>
    </View>
  );
}
