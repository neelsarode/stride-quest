// =============================================================================
// GuildSheet — the co-op roster as a slide-up sheet (STR-69; owner decision
// spec §10-Q1). Re-skins GuildBoard's content in the src/ui pixel chrome:
// per-member contributions + fuel-state, improvement-based recognition badges,
// the shared boost chip, the SEND RALLY surface (same real mutation + friendly
// rejections as the board), the invite code + COPY, AND a join-by-code row —
// which closes the CLAUDE.md note that joinGuildByCode's solo-switch branch had
// no post-onboarding UI. Recognition stays improvement/consistency-based, never
// a raw-step leaderboard (the fairness guardrail carries over verbatim).
// =============================================================================
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FUEL, RALLY } from "../../../convex/gameConfig";
import {
  Button,
  Chip,
  PixelText,
  Sheet,
  StatusDot,
  type ChipColor,
  type HeroState,
} from "../../ui";
import { UI_PALETTE } from "../../ui/theme";
import { useGameLayout } from "../useGameLayout";
import { useFeedback } from "../../feedback/FeedbackProvider";
import { friendlyError } from "../../feedback/errors";

type Member = {
  userId: string;
  displayName: string;
  class: string;
  isMe: boolean;
  isSimulated: boolean;
  damage: number;
  bonusDamage: number;
  todaySteps: number;
  jobLevel: number;
  heroState: HeroState;
  displayStreak: number;
  improvementPct: number;
};
type Recognition = {
  mvpUserId: string | null;
  mostImprovedUserId: string | null;
  longestStreakUserId: string | null;
};
type Overview = {
  members: Member[];
  recognition: Recognition;
  inviteCode: string | null;
  maxMembers: number;
};
type RallyInfo = {
  sentToday: boolean;
  energyCost: number;
  eligibleTeammates: { userId: string }[];
};

const STATE_CHIP: Record<HeroState, ChipColor> = {
  battling: "green",
  winded: "gold",
  resting: "red",
  rally: "red",
};
const DIVIDER = "#26324a";

export function GuildSheet({
  overview,
  rally,
  boost,
  onClose,
  onToast,
}: {
  overview: Overview;
  rally?: RallyInfo;
  boost?: { mult: number } | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const { artScale, height } = useGameLayout();
  const s = artScale;
  const { members, recognition, inviteCode, maxMembers } = overview;
  const sendRally = useMutation(api.rally.sendRally);
  const joinByCode = useMutation(api.guild.joinGuildByCode);
  const { emit } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const eligible = new Set(rally?.eligibleTeammates.map((t) => t.userId) ?? []);

  async function onSendRally(m: Member) {
    if (busy || rally?.sentToday) return;
    setBusy(true);
    try {
      const r = await sendRally({ receiverId: m.userId as Id<"users"> });
      emit({
        type: "rallySent",
        receiverName: m.displayName,
        hours: Math.round(r.fuelGiven / FUEL.burnPerHourBattling),
      });
    } catch (e) {
      emit({ type: "actionRejected", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    const code = joinCode.trim();
    if (busy || code.length === 0) return;
    setBusy(true);
    try {
      const r = await joinByCode({ code });
      emit({
        type: "guildJoined",
        guildName: r.guildName,
        memberCount: r.memberCount,
      });
      setJoinCode("");
      onClose();
    } catch (e) {
      emit({ type: "actionRejected", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible onClose={onClose} height={Math.round(height * 0.66)} scale={s}>
      <ScrollView showsVerticalScrollIndicator style={{ flex: 1 }}>
        {/* header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 * s }}>
          <PixelText
            text={`GUILD - ${members.length} ${members.length === 1 ? "HERO" : "HEROES"}`}
            color={UI_PALETTE.gold_mid}
            scale={s}
          />
          {boost ? <Chip label={`X${boost.mult} CREW`} color="gold" scale={s} /> : null}
        </View>

        {members.map((m) => {
          const restingMate = m.heroState === "resting" && !m.isMe;
          const dotState: HeroState = restingMate ? "rally" : m.heroState;
          const canRally = rally && !m.isMe && eligible.has(m.userId);
          const sign = m.improvementPct >= 0 ? "+" : "";
          const badges: string[] = [];
          if (recognition.mvpUserId === m.userId) badges.push("MVP");
          if (recognition.mostImprovedUserId === m.userId) badges.push("IMPROVED");
          if (recognition.longestStreakUserId === m.userId) badges.push("STREAK");
          return (
            <View
              key={m.userId}
              style={{
                gap: 3 * s,
                paddingVertical: 5 * s,
                borderBottomWidth: 1,
                borderBottomColor: DIVIDER,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 * s, flexShrink: 1 }}>
                  <StatusDot state={dotState} scale={s} />
                  <PixelText
                    text={`${m.displayName}${m.isMe ? " -YOU" : ""}${m.isSimulated ? " BOT" : ""}`}
                    color={UI_PALETTE.silver_rim}
                    scale={s}
                  />
                  <Chip label={m.heroState} color={STATE_CHIP[m.heroState]} scale={s} />
                </View>
                <PixelText text={`${m.damage.toLocaleString()}`} color={UI_PALETTE.gold_light} scale={s} />
              </View>
              <PixelText
                text={`${m.todaySteps.toLocaleString()} TODAY - JOB ${m.jobLevel} - ${m.displayStreak}D - ${sign}${m.improvementPct}%${m.bonusDamage > 0 ? ` - ${m.bonusDamage.toLocaleString()} BONUS` : ""}`}
                color={UI_PALETTE.sky_mid}
                scale={s}
              />
              {badges.length > 0 && (
                <View style={{ flexDirection: "row", gap: 4 * s }}>
                  {badges.map((b) => (
                    <Chip key={b} label={b} color="gold" scale={s} />
                  ))}
                </View>
              )}
              {canRally && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 * s }}>
                  <Button
                    material="gold"
                    label={`RALLY ${RALLY.energyCost}`}
                    disabled={busy || rally!.sentToday}
                    onPress={() => onSendRally(m)}
                    scale={s}
                    style={rally!.sentToday ? { opacity: 0.4 } : undefined}
                  />
                  <PixelText
                    text={
                      rally!.sentToday
                        ? "RALLY SENT - MORE TOMORROW"
                        : `GIVES ${RALLY.fuelHoursGiven}H OF FIGHT`
                    }
                    color={UI_PALETTE.silver_dark}
                    scale={s}
                  />
                </View>
              )}
            </View>
          );
        })}

        {/* invite code + COPY */}
        {inviteCode ? (
          <View style={{ marginTop: 8 * s, gap: 4 * s }}>
            <PixelText text="INVITE CODE" color={UI_PALETTE.sky_mid} scale={s} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <PixelText text={inviteCode} color={UI_PALETTE.gold_light} scale={s + 1} />
              <Button
                material="silver"
                label="COPY"
                onPress={() => onToast("CODE COPIED!")}
                scale={s}
              />
            </View>
            <PixelText
              text={`${members.length} OF ${maxMembers} SPOTS FILLED`}
              color={UI_PALETTE.silver_dark}
              scale={s}
            />
          </View>
        ) : null}

        {/* join-by-code (closes the joinGuildByCode UI gap) */}
        <View style={{ marginTop: 10 * s, gap: 4 * s }}>
          <PixelText text="JOIN ANOTHER GUILD" color={UI_PALETTE.sky_mid} scale={s} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 * s }}>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="XX-XXXX"
              placeholderTextColor={UI_PALETTE.silver_dark}
              autoCapitalize="characters"
              autoCorrect={false}
              style={{
                flex: 1,
                color: UI_PALETTE.silver_rim,
                backgroundColor: "#0c1320",
                borderColor: DIVIDER,
                borderWidth: 1,
                borderRadius: 4 * s,
                paddingVertical: 6 * s,
                paddingHorizontal: 8 * s,
                fontFamily: "Courier",
                letterSpacing: 2,
                fontSize: 7 * s,
              }}
            />
            <Button
              material="gold"
              label="JOIN"
              disabled={busy || joinCode.trim().length === 0}
              onPress={onJoin}
              scale={s}
              style={joinCode.trim().length === 0 ? { opacity: 0.4 } : undefined}
            />
          </View>
        </View>
      </ScrollView>
    </Sheet>
  );
}
