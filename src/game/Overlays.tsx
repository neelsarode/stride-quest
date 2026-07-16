// =============================================================================
// Overlays — GameScreen overlay host + open-state mechanism (STR-69).
//
// This module owns the small store that PartyRail + RightNav dispatch into and
// that this host renders from. It cannot be a plain React context: GameScreen
// mounts PartyRail / RightNav / Overlays as SIBLINGS, so a provider here could
// never wrap its siblings. Instead a tiny module-level store (useSyncExternal
// store) is the shared channel — the zones call the imperative openers, this
// host subscribes and renders the one active overlay.
//
// Mounts: the party-member popover (SEND RALLY), the invite popover (COPY CODE),
// the guild sheet, the stats sheet, the help modal, plus a dev-only DEV chip
// that opens the (unchanged) DevPanel in a bottom sheet. Every surface closes on
// scrim / outside tap (the primitives own their own scrims). Rendered LAST in
// GameScreen and pinned to a high zIndex so it stacks above every zone.
// =============================================================================
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FUEL, RALLY } from "../../convex/gameConfig";
import {
  Button,
  Frame,
  Modal,
  PixelText,
  Popover,
  Sheet,
  UIScaleProvider,
} from "../ui";
import { STATE_COLORS, UI_PALETTE } from "../ui/theme";
import { useFeedback } from "../feedback/FeedbackProvider";
import { friendlyError } from "../feedback/errors";
import { DEV_FLAGS } from "../devConfig";
import { DevPanel } from "../components/DevPanel";
import { useGameLayout } from "./useGameLayout";
import {
  CODE_COPIED_TOAST,
  COPY_FAILED_TOAST,
  copyToClipboard,
} from "./clipboard";
import { GuildSheet } from "./sheets/GuildSheet";
import { StatsSheet } from "./sheets/StatsSheet";

// =============================================================================
// The overlay store (module-level; consumed by PartyRail + RightNav).
// =============================================================================
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Overlay =
  | { kind: "none" }
  | { kind: "member"; userId: string; rect: AnchorRect }
  | { kind: "invite"; rect: AnchorRect }
  | { kind: "guild" }
  | { kind: "stats" }
  | { kind: "help" }
  | { kind: "dev" };

let overlayState: Overlay = { kind: "none" };
const overlayListeners = new Set<() => void>();

function setOverlay(next: Overlay) {
  overlayState = next;
  overlayListeners.forEach((l) => l());
}

/** Close any open popover / sheet / modal. */
export function closeOverlay() {
  setOverlay({ kind: "none" });
}

/** Tap a party tile: open its member popover, or close it if already open on
 *  that same member (battlefield-ui toggle). `rect` is the tile's window box. */
export function toggleMember(userId: string, rect: AnchorRect) {
  setOverlay(
    overlayState.kind === "member" && overlayState.userId === userId
      ? { kind: "none" }
      : { kind: "member", userId, rect },
  );
}

/** Tap the invite (+) slot: open the invite popover (toggle). */
export function toggleInvite(rect: AnchorRect) {
  setOverlay(
    overlayState.kind === "invite" ? { kind: "none" } : { kind: "invite", rect },
  );
}

export function openGuild() {
  setOverlay({ kind: "guild" });
}
export function openStats() {
  setOverlay({ kind: "stats" });
}
export function openHelp() {
  setOverlay({ kind: "help" });
}
export function openDev() {
  setOverlay({ kind: "dev" });
}

function subscribeOverlay(cb: () => void) {
  overlayListeners.add(cb);
  return () => {
    overlayListeners.delete(cb);
  };
}

/** Subscribe to the active overlay (the host renders from this). */
export function useOverlay(): Overlay {
  return useSyncExternalStore(
    subscribeOverlay,
    () => overlayState,
    () => overlayState,
  );
}

// =============================================================================
// Popover geometry — the battlefield-ui `openPopover` clamp math, in dp.
// The panel is a fixed 132 art px wide; it hangs BELOW its tile and the arrow
// tracks the tile centre, clamped to the panel edges.
// =============================================================================
const POP_W_ART = 132;
const POP_WELL_ART = POP_W_ART - 6; // slim frame → 3px inset each side

function computePopover(rect: AnchorRect, s: number, winW: number) {
  const popW = POP_W_ART * s;
  const anchorMidX = rect.x + rect.width / 2;
  // Desired left puts the arrow's default 15-art-px offset under the anchor,
  // then clamp so the whole panel stays on screen (8dp margins).
  const desiredLeft = anchorMidX - 15 * s;
  const left = Math.max(8, Math.min(desiredLeft, winW - popW - 8));
  const arrowAt = Math.max(8, Math.min(Math.round((anchorMidX - left) / s), 124));
  const top = rect.y + rect.height + 4;
  return { left, top, arrowAt };
}

// (copyToClipboard moved to ./clipboard — shared with GuildSheet's COPY, STR-86.)

// =============================================================================
// The host.
// =============================================================================
export function Overlays() {
  const { artScale, width, topPad } = useGameLayout();
  const overlay = useOverlay();
  const dashboard = useQuery(api.game.dashboard, {});
  const overview = useQuery(api.guild.overview, {});

  // A small local toast (COPY CODE / generic confirmations), ported 1:1 from
  // battlefield-ui's showToast — the rally SUCCESS uses the real feedback layer.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  return (
    <View style={styles.host} pointerEvents="box-none">
      <UIScaleProvider value={artScale}>
        {/* Dev tooling stays reachable on the game screen (spec §7). */}
        {DEV_FLAGS.showDevPanel && <DevChip scale={artScale} />}

        {overlay.kind === "member" && overview && dashboard && (
          <MemberPopover
            userId={overlay.userId}
            rect={overlay.rect}
            members={overview.members}
            rally={dashboard.rally}
            scale={artScale}
            winW={width}
          />
        )}

        {overlay.kind === "invite" && overview?.inviteCode && (
          <InvitePopover
            code={overview.inviteCode}
            rect={overlay.rect}
            scale={artScale}
            winW={width}
            onCopied={(ok) => showToast(ok ? CODE_COPIED_TOAST : COPY_FAILED_TOAST)}
          />
        )}

        {overlay.kind === "guild" && overview && (
          <GuildSheet
            overview={overview}
            rally={dashboard?.rally}
            boost={dashboard?.boost ?? null}
            onClose={closeOverlay}
            onToast={showToast}
          />
        )}

        {overlay.kind === "stats" && dashboard && (
          <StatsSheet data={dashboard} onClose={closeOverlay} />
        )}

        {overlay.kind === "help" && <HelpModal onClose={closeOverlay} />}

        {overlay.kind === "dev" && (
          <DevSheet scale={artScale} stepsToday={dashboard?.steps.today ?? 0} />
        )}

        {/* Toast rides above every zone, below nothing it needs to block. */}
        {toast != null && (
          <View
            style={[styles.toastWrap, { top: topPad + 200 }]}
            pointerEvents="none"
          >
            <Frame slice="toast_silver" length={pixelWidthOf(toast) + 12} scale={artScale}>
              <View style={styles.toastLabel}>
                <PixelText text={toast} color={UI_PALETTE.gold_light} scale={artScale} />
              </View>
            </Frame>
          </View>
        )}
      </UIScaleProvider>
    </View>
  );
}

// Rough advance width for centring the toast label (kit font: ~4 art px/char).
function pixelWidthOf(text: string): number {
  return text.length * 4;
}

// =============================================================================
// Member popover — name/class, state, steps today, dmg week, streak, fuel +
// SEND RALLY (real mutation) on server-eligible mates. Arrow tracks the tile.
// =============================================================================
type Member = {
  userId: string;
  displayName: string;
  class: string;
  isMe: boolean;
  isSimulated: boolean;
  damage: number;
  todaySteps: number;
  jobLevel: number;
  jobName: string;
  heroState: "battling" | "winded" | "resting";
  displayStreak: number;
};
type RallyInfo = {
  sentToday: boolean;
  energyCost: number;
  eligibleTeammates: { userId: string }[];
};

const FUEL_LABEL: Record<Member["heroState"], string> = {
  battling: "FULL",
  winded: "LOW",
  resting: "EMPTY",
};

function MemberPopover({
  userId,
  rect,
  members,
  rally,
  scale,
  winW,
}: {
  userId: string;
  rect: AnchorRect;
  members: Member[];
  rally: RallyInfo;
  scale: number;
  winW: number;
}) {
  const sendRally = useMutation(api.rally.sendRally);
  const { emit } = useFeedback();
  const [busy, setBusy] = useState(false);

  const member = members.find((m) => m.userId === userId);
  if (!member) return null;

  const eligible = new Set(rally.eligibleTeammates.map((t) => t.userId));
  const canRally = !member.isMe && eligible.has(member.userId);
  const { left, top, arrowAt } = computePopover(rect, scale, winW);
  const H = canRally ? 73 : 55;
  const stateColor = STATE_COLORS[member.heroState];

  async function onSendRally() {
    if (busy || rally.sentToday || !member) return;
    setBusy(true);
    try {
      const r = await sendRally({ receiverId: member.userId as Id<"users"> });
      emit({
        type: "rallySent",
        receiverName: member.displayName,
        hours: Math.round(r.fuelGiven / FUEL.burnPerHourBattling),
      });
      closeOverlay();
    } catch (e) {
      emit({ type: "actionRejected", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover
      height={H}
      side="top"
      arrowOffset={arrowAt}
      onClose={closeOverlay}
      scale={scale}
      style={{ position: "absolute", left, top }}
    >
      {/* header: NAME - CLASS (left), state (right) */}
      <View style={styles.popHeader}>
        <PixelText
          text={`${member.displayName}${member.isMe ? " -YOU" : ""} - ${member.class}`}
          color={UI_PALETTE.silver_rim}
          scale={scale}
        />
        <PixelText text={member.heroState} color={stateColor} scale={scale} />
      </View>
      <PopStat label="STEPS TODAY" value={member.todaySteps.toLocaleString()} top={12} scale={scale} />
      <PopStat label="DMG WEEK" value={member.damage.toLocaleString()} top={21} scale={scale} />
      <PopStat label="STREAK" value={`${member.displayStreak} DAYS`} top={30} scale={scale} />
      <PopStat label="FUEL" value={FUEL_LABEL[member.heroState]} top={39} scale={scale} />
      {canRally && (
        <View style={{ position: "absolute", left: 0, top: 51 * scale }}>
          <Button
            material="silver"
            label={`SEND RALLY ${RALLY.energyCost}`}
            width={POP_WELL_ART}
            disabled={busy || rally.sentToday}
            onPress={onSendRally}
            style={rally.sentToday ? { opacity: 0.4 } : undefined}
          />
        </View>
      )}
    </Popover>
  );
}

function PopStat({
  label,
  value,
  top,
  scale,
}: {
  label: string;
  value: string;
  top: number;
  scale: number;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        top: top * scale,
        width: POP_WELL_ART * scale,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <PixelText text={label} color={UI_PALETTE.sky_mid} scale={scale} />
      <PixelText text={value} color={UI_PALETTE.silver_rim} scale={scale} />
    </View>
  );
}

// =============================================================================
// Invite popover — guild code + COPY CODE (Clipboard) + toast.
// =============================================================================
function InvitePopover({
  code,
  rect,
  scale,
  winW,
  onCopied,
}: {
  code: string;
  rect: AnchorRect;
  scale: number;
  winW: number;
  /** Called with whether the clipboard write actually succeeded (STR-86). */
  onCopied: (ok: boolean) => void;
}) {
  const { left, top, arrowAt } = computePopover(rect, scale, winW);

  async function onCopy() {
    const ok = await copyToClipboard(code);
    onCopied(ok);
    closeOverlay();
  }

  return (
    <Popover
      height={62}
      side="top"
      arrowOffset={arrowAt}
      onClose={closeOverlay}
      scale={scale}
      style={{ position: "absolute", left, top }}
    >
      <PixelText text="INVITE A FRIEND" color={UI_PALETTE.silver_rim} scale={scale} />
      <View style={{ position: "absolute", top: 13 * scale }}>
        <PixelText text="SHARE YOUR GUILD CODE" color={UI_PALETTE.sky_mid} scale={scale} />
      </View>
      <View style={{ position: "absolute", top: 24 * scale, left: 0, right: 0, alignItems: "center" }}>
        <PixelText text={code} color={UI_PALETTE.gold_light} scale={scale} />
      </View>
      <View style={{ position: "absolute", left: 0, top: 36 * scale }}>
        <Button material="silver" label="COPY CODE" width={POP_WELL_ART} onPress={onCopy} />
      </View>
    </Popover>
  );
}

// =============================================================================
// Help modal — HOW TO PLAY (battlefield-ui lines), X + OK close.
// Copy reflects Core Loop v2 (STR-86): DEPLOY is the SUPER ATTACK now, and
// Overdrive is automatic on a goal-hit (no charge/activate). Pixel-font
// conventions: caps, "X2" not "×2", short lines that fit the 134-art-px well.
// =============================================================================
const HELP_LINES: [string, string][] = [
  ["WALK EVERY DAY.", UI_PALETTE.silver_rim],
  ["STEPS BECOME ENERGY.", UI_PALETTE.sky_mid],
  ["SUPER ATTACK SPENDS IT", UI_PALETTE.silver_rim],
  ["ON THE WEEKLY BOSS.", UI_PALETTE.sky_mid],
  ["YOUR CREW FIGHTS 24/7.", UI_PALETTE.sky_mid],
  ["HIT YOUR GOAL: X2 OVERDRIVE.", UI_PALETTE.sky_mid],
  ["RALLY RESTING FRIENDS.", UI_PALETTE.sky_mid],
  ["JOBS RESET MONDAYS.", UI_PALETTE.sky_mid],
];

function HelpModal({ onClose }: { onClose: () => void }) {
  const { artScale } = useGameLayout();
  return (
    <Modal visible onClose={onClose} title="HOW TO PLAY" height={120} scale={artScale}>
      <View style={{ gap: 4 * artScale }}>
        {HELP_LINES.map(([line, color]) => (
          <PixelText key={line} text={line} color={color} scale={artScale} />
        ))}
        <View style={{ marginTop: 6 * artScale, alignItems: "center" }}>
          <Button material="silver" label="OK" onPress={onClose} scale={artScale} />
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// DEV chip + sheet — the (unchanged) DevPanel behind a small dev-styled chip
// (spec §7). Deliberately magenta/dashed so it reads as NOT-real UI, like the
// panel it opens. Gated by DEV_FLAGS.showDevPanel by the caller.
// =============================================================================
const DEV_MAGENTA = "#c026d3";

function DevChip({ scale }: { scale: number }) {
  const { bottomPad } = useGameLayout();
  return (
    <Pressable
      onPress={openDev}
      style={({ pressed }) => [
        styles.devChip,
        { bottom: bottomPad + 96, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <PixelText text="DEV" color={DEV_MAGENTA} scale={scale} />
    </Pressable>
  );
}

function DevSheet({ scale, stepsToday }: { scale: number; stepsToday: number }) {
  const { height } = useGameLayout();
  return (
    <Sheet visible onClose={closeOverlay} height={Math.round(height * 0.82)} scale={scale}>
      <ScrollView showsVerticalScrollIndicator style={{ flex: 1 }}>
        <DevPanel stepsToday={stepsToday} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Above every zone (zones are zIndex 100); box-none so idle taps fall through
  // to the scene / zones beneath (scene-tap ultimates stay live).
  host: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 300 },
  popHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toastWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toastLabel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  devChip: {
    position: "absolute",
    left: 8,
    backgroundColor: "#1a0f1d",
    borderColor: DEV_MAGENTA,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
});
