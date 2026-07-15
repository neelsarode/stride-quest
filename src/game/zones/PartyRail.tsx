// =============================================================================
// PartyRail — GameScreen party zone (STR-69). A horizontal row of 18-art
// portrait tiles from guild.overview (1–8 members, me included): each tile is a
// portrait + status dot + a fuel sliver, with a gold rally BEACON + red dot on
// a RESTING teammate (the at-a-glance "go rally them" call — not self-shame, so
// my own resting stays the dignified sky dot with no beacon). An invite (+) slot
// caps the row while there's an open seat. NAMES ARE HIDDEN until tap (owner
// decision, spec §10-Q2) — tapping a tile opens its member popover, tapping the
// (+) opens the invite popover (both hosted by ../Overlays).
// =============================================================================
import { useRef } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Beacon,
  Portrait,
  StatusDot,
  UIScaleProvider,
  type HeroState,
} from "../../ui";
import { BakedImage } from "../../ui/Baked";
import { UI_FILLS, UI_PALETTE } from "../../ui/theme";
import { GUILD } from "../../../convex/gameConfig";
import { GAME_ZONES, portraitSpriteFor } from "../../config/assets";
import { useGameLayout } from "../useGameLayout";
import { toggleInvite, toggleMember, type AnchorRect } from "../Overlays";
import { zoneStyles } from "./zoneStyle";

// Full-body portrait sprites (class × job south.png) now live in the shared
// visual config (src/config/assets.ts PORTRAIT_SPRITES / portraitSpriteFor),
// consolidated in STR-71 out of this zone's former local map.

// Fuel-sliver proxy per hero state — overview carries heroState, not a raw fuel
// value for teammates, so the sliver reads the state (battling = a full green
// bar, winded = a short amber one, resting = empty → "rally me").
const SLIVER: Record<HeroState, { frac: number; fam: { mid: string } } | null> = {
  battling: { frac: 1, fam: UI_FILLS.green },
  winded: { frac: 0.34, fam: UI_FILLS.yellow },
  resting: null,
  rally: null,
};

type Member = {
  userId: string;
  displayName: string;
  class: string;
  isMe: boolean;
  jobLevel: number;
  heroState: HeroState;
};

export function PartyRail() {
  const { topPad, artScale } = useGameLayout();
  const overview = useQuery(api.guild.overview, {});
  const members = (overview?.members ?? []) as Member[];
  const showInvite =
    overview?.inviteCode != null && members.length < GUILD.maxMembers;

  return (
    <View
      testID="zone-party-rail"
      style={[
        zoneStyles.zone,
        zoneStyles.centeredRow,
        { top: topPad + GAME_ZONES.partyRailTop },
      ]}
    >
      <UIScaleProvider value={artScale}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 3 * artScale }}>
          {members.map((m) => (
            <PartyTile key={m.userId} member={m} scale={artScale} />
          ))}
          {showInvite && <InviteSlot scale={artScale} />}
        </View>
      </UIScaleProvider>
    </View>
  );
}

function PartyTile({ member, scale }: { member: Member; scale: number }) {
  const ref = useRef<View>(null);
  const restingMate = member.heroState === "resting" && !member.isMe;
  const dotState: HeroState = restingMate ? "rally" : member.heroState;
  const sprite = portraitSpriteFor(member.class, member.jobLevel);

  const onPress = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      const rect: AnchorRect = { x, y, width, height };
      toggleMember(member.userId, rect);
    });
  };

  return (
    <Pressable ref={ref} onPress={onPress} style={{ alignItems: "center" }}>
      <View style={{ width: 18 * scale, height: 18 * scale }}>
        {/* Beacon drawn first so the portrait paints over its centre, leaving
            the 1-art-px gold ring showing as a border (battlefield-ui recipe). */}
        {restingMate && (
          <View style={{ position: "absolute", left: -1 * scale, top: -1 * scale }}>
            <Beacon active scale={scale} />
          </View>
        )}
        <Portrait
          size={18}
          source={sprite.src}
          sourceSize={sprite.size}
          cropKey={member.class}
          scale={scale}
        />
        <View style={{ position: "absolute", right: 0, bottom: 0 }}>
          <StatusDot state={dotState} scale={scale} />
        </View>
      </View>
      <FuelSliver state={member.heroState} scale={scale} />
    </Pressable>
  );
}

function FuelSliver({ state, scale }: { state: HeroState; scale: number }) {
  const s = SLIVER[state];
  return (
    <View
      style={{
        width: 18 * scale,
        height: 5 * scale,
        marginTop: 1 * scale,
        borderRadius: 2 * scale,
        backgroundColor: UI_PALETTE.outline,
        overflow: "hidden",
      }}
    >
      {s && (
        <View
          style={{
            position: "absolute",
            left: 1 * scale,
            top: 1 * scale,
            width: Math.max(1, Math.round(16 * s.frac)) * scale,
            height: 3 * scale,
            backgroundColor: s.fam.mid,
          }}
        />
      )}
    </View>
  );
}

function InviteSlot({ scale }: { scale: number }) {
  const ref = useRef<View>(null);
  const onPress = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      toggleInvite({ x, y, width, height });
    });
  };
  return (
    <Pressable ref={ref} onPress={onPress} style={{ alignItems: "center" }}>
      <View style={{ width: 18 * scale, height: 18 * scale }}>
        <BakedImage name="portrait_18" scale={scale} />
        {/* chunky + centred in the 18-art-px well (silver, all-even geometry) */}
        <View
          style={{
            position: "absolute",
            left: 6 * scale,
            top: 8 * scale,
            width: 6 * scale,
            height: 2 * scale,
            backgroundColor: UI_PALETTE.silver_rim,
          }}
        />
        <View
          style={{
            position: "absolute",
            left: 8 * scale,
            top: 6 * scale,
            width: 2 * scale,
            height: 6 * scale,
            backgroundColor: UI_PALETTE.silver_rim,
          }}
        />
      </View>
      {/* spacer matching the mates' fuel-sliver row so tops align */}
      <View style={{ width: 18 * scale, height: 5 * scale, marginTop: 1 * scale }} />
    </Pressable>
  );
}
