// =============================================================================
// TopBar — GameScreen top HUD zone (identity + week/day + reset countdown).
// STR-67 (top HUD). Owns this file — full content + position within it.
//
// Layout target: dashboard-ui.html #ident/#week (phone comp) + battlefield-ui's
// #topbar (the live S8 prototype: portrait + name + WARRIOR - JOB 2 STRIDER +
// streak + WEEK N / DAY). Composited from the STR-64 baked kit primitives at the
// device art scale (spec §6: 1 art px = artScale dp). No game logic here — the
// zone is a pure reactive read of api.game.dashboard (the SAME subscription the
// engine already runs, so this adds a shared cache read, never a duplicate
// effect — we deliberately do NOT call useGameEngine, whose open-effects would
// double-fire).
// =============================================================================
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CLASSES, type ClassKey } from "../../../convex/gameConfig";
import { GAME_ZONES } from "../../config/assets";
import { DEV_FLAGS } from "../../devConfig";
import { isAvailable as healthKitAvailable } from "../../health/healthkit";
import { HealthPermissionScreen } from "../../screens/onboarding/HealthPermissionScreen";
import { SPRITES, type SpriteKey } from "../../battle/spriteMap";
import manifest from "../../battle/sprites/manifest.json";
import {
  BakedImage,
  PixelText,
  Portrait,
  UIScaleProvider,
} from "../../ui";
import { PORTRAIT_CROPS, UI_PALETTE } from "../../ui/theme";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

// --- local tuning (TODO consolidate into assets.ts — STR-68 owns it this round)
const PAD_H = 14; // dashboard-ui #topbar side padding
const NAME_GAP = 6; // dp between portrait and identity column
const ROW_GAP = 3; // dp between identity text lines
const SCRIM_H = 118; // scrim gradient height (dp) behind the top bar
const SCRIM_BANDS = 7; // stacked translucent bands that fake a top-down gradient
// The weekday map (data.date is a local "YYYY-MM-DD"; read as UTC so the tz the
// server already applied is not double-counted).
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

function jobFolderFor(cls: ClassKey, jobLevel: number): string {
  const folders = CLASSES[cls].jobFolders;
  return folders[Math.max(0, Math.min(folders.length - 1, jobLevel - 1))];
}

/** Boss-reset countdown copy ("2D 14H" / "14H 3M" / "9M" / "SOON"). Reset lands
 *  at the start of the day AFTER weekEnd (Monday 00:00 local). We recover the
 *  guild boundary with the client's own tz offset — the same value ensureSession
 *  already reports to the server, so a solo/co-op member reads the same wall. */
function resetCountdown(weekEnd: string, now: number): string {
  const tzMin = new Date().getTimezoneOffset();
  const sundayStart = Date.parse(`${weekEnd}T00:00:00Z`) + tzMin * 60_000;
  const remainingMs = sundayStart + 24 * 3_600_000 - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "SOON";
  const totalMin = Math.floor(remainingMs / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}D ${h}H`;
  if (h > 0) return `${h}H ${m}M`;
  return `${m}M`;
}

function weekdayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return WEEKDAYS[dow] ?? "";
}

/** Cheap cross-platform top scrim: a stack of translucent black bands fading to
 *  transparent (RN native has no CSS gradient; expo-linear-gradient isn't a dep).
 *  Static — zero per-frame work; pointer-transparent so scene taps pass through. */
function Scrim({ topInset }: { topInset: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, height: topInset + SCRIM_H, zIndex: 90 }}
    >
      {Array.from({ length: SCRIM_BANDS }).map((_, i) => {
        const t = i / (SCRIM_BANDS - 1); // 0 (top) → 1 (bottom)
        return (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: `rgba(6,8,12,${(0.62 * (1 - t)).toFixed(3)})`,
            }}
          />
        );
      })}
    </View>
  );
}

export function TopBar() {
  const { topPad, artScale } = useGameLayout();
  const data = useQuery(api.game.dashboard, {});
  // Local mirror of the classic screen's showHealthScreen seam (STR-48): the
  // GameScreen shell does not wire the engine's toggle to any overlay host, so
  // the calm CONNECT HEALTH chip self-hosts its Beat-3 takeover here — exact
  // same gate (HealthKit-capable + not yet connected) and same onDone return.
  const [showHealth, setShowHealth] = useState(false);

  if (!data) return null;
  const { player, boss, streak, shields, weekEnd, now, date } = data;

  // Health takeover (full-screen, above every zone) — identical behaviour to
  // DashboardScreen's early return.
  if (showHealth) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
        <HealthPermissionScreen onDone={() => setShowHealth(false)} />
      </View>
    );
  }

  // Portrait: the viewer's live class/job idle sprite cropped into the silver
  // well. Source is the packed idle strip; the crop key is job-specific when a
  // tuned crop exists (warrior_j2), else the class default (Portrait maps the
  // strip's frame-0 sub-region — sprites carry transparent padding).
  const classKey = player.classKey as ClassKey;
  const spriteKey =
    `${classKey}/${jobFolderFor(classKey, player.jobLevel)}/idle` as SpriteKey;
  const source = SPRITES[spriteKey];
  const mf = (manifest as Record<string, { frames: number; w: number; h: number }>)[spriteKey];
  const sourceSize = mf ? { w: mf.frames * mf.w, h: mf.h } : undefined;
  const jobCropKey = `${classKey}_j${player.jobLevel}`;
  const cropKey = jobCropKey in PORTRAIT_CROPS ? jobCropKey : classKey;

  const metaLine = `${player.className} - JOB ${player.jobLevel} ${player.jobName}`;
  const showHealthChip =
    (healthKitAvailable() || DEV_FLAGS.forceHealthBeat) && !data.health.connected;
  // Small icon scales (integer → crisp): shield/heart art is chunkier than the
  // 5-art-px font, so they ride one scale step down to sit inline with the text.
  const iconScale = Math.max(1, artScale - 1);

  return (
    <>
      <Scrim topInset={topPad} />
      <View
        testID="zone-top-bar"
        style={[zoneStyles.zone, zoneStyles.fullWidth, { top: topPad + GAME_ZONES.topBarTop }]}
      >
        <UIScaleProvider value={artScale}>
          <View style={[styles.row, { paddingHorizontal: PAD_H }]}>
            {/* LEFT — portrait + identity */}
            <View style={styles.identity}>
              <Portrait
                size={20}
                source={source}
                sourceSize={sourceSize}
                cropKey={cropKey}
              />
              <View style={{ marginLeft: NAME_GAP, gap: ROW_GAP }}>
                <PixelText text={player.displayName} color={UI_PALETTE.white} />
                <PixelText text={metaLine} color={UI_PALETTE.sky_mid} />
                <View style={styles.chipRow}>
                  {streak.count > 0 && (
                    <PixelText
                      text={`${streak.count}-DAY STREAK`}
                      color={UI_PALETTE.red_light}
                    />
                  )}
                  {shields.held > 0 && (
                    <View style={styles.shieldChip}>
                      <BakedImage name="icon_shield" scale={iconScale} />
                      <PixelText text={`X${shields.held}`} color={UI_PALETTE.gold_light} />
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* RIGHT — week clock + boss-reset countdown; the quiet CONNECT
                HEALTH chip rides here (above the fuel band, off the identity
                column) when applicable. */}
            <View style={styles.clock}>
              {boss && (
                <>
                  <PixelText
                    text={`WEEK ${boss.tier} - ${weekdayOf(date)}`}
                    color={UI_PALETTE.sky_mid}
                  />
                  <PixelText
                    text={`RESETS ${resetCountdown(weekEnd, now)}`}
                    color={UI_PALETTE.silver_dark}
                  />
                </>
              )}
              {showHealthChip && (
                <Pressable
                  onPress={() => setShowHealth(true)}
                  style={({ pressed }) => [styles.healthChip, pressed && styles.pressed]}
                >
                  <BakedImage name="icon_heart" scale={iconScale} />
                  <PixelText text="CONNECT HEALTH" color={UI_PALETTE.silver_dark} />
                </Pressable>
              )}
            </View>
          </View>
        </UIScaleProvider>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  identity: { flexDirection: "row", alignItems: "flex-start", flexShrink: 1 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  shieldChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  clock: { alignItems: "flex-end", gap: ROW_GAP, marginLeft: 8 },
  healthChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 2,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: UI_PALETTE.silver_dark,
    borderRadius: 999,
  },
  pressed: { opacity: 0.55 },
});

export default TopBar;
