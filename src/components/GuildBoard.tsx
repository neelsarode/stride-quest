// The co-op roster: who's in the guild and what each member has contributed to
// the shared boss, plus the fairness recognition badges. All members' damage
// sums to the boss HP shown in the boss card. Also the standing invite surface
// (STR-47, spec Beat 2a: "your code lives on the guild board too") — the code
// + native Share replace the old dev-panel copy leak.
//
// STR-15: each member wears their fuel-state chip, and a Winded/Resting
// teammate grows the gold SEND RALLY action right on their row (spec §5: the
// giver spends 500 Energy, the receiver wakes — peer nudge > app nudge).
// Eligibility comes from the server's rally.eligibleTeammates, so the button
// can never show for someone the mutation would reject as "still battling".
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FUEL, RALLY } from "../../convex/gameConfig";
import { HERO_STATE_STYLE, PALETTE, SIZES } from "../config/assets";
import { useFeedback } from "../feedback/FeedbackProvider";
import { friendlyError } from "../feedback/errors";
import { shareInviteCode } from "../screens/onboarding/GuildStepScreens";

type Member = {
  userId: string;
  displayName: string;
  isMe: boolean;
  isSimulated: boolean;
  damage: number;
  todaySteps: number;
  weeklySteps: number;
  jobLevel: number;
  jobName: string;
  heroState: keyof typeof HERO_STATE_STYLE;
  bonusDamage: number;
  displayStreak: number;
  improvementPct: number;
};

/** The dashboard's rally payload (STR-11): can-I-send + who needs one. */
type RallyInfo = {
  sentToday: boolean;
  energyCost: number;
  eligibleTeammates: { userId: string }[];
};
type Overview = {
  members: Member[];
  recognition: {
    mvpUserId: string | null;
    mostImprovedUserId: string | null;
    longestStreakUserId: string | null;
  };
  memberCount: number;
  // STR-47 invite surface (null only for legacy guilds until their next
  // ensureSession backfills a code).
  inviteCode: string | null;
  maxMembers: number;
};

export function GuildBoard({
  overview,
  rally,
  boost,
}: {
  overview: Overview;
  rally?: RallyInfo;
  /** This week's guild-wide reward (STR-57) — the shared payoff is visible on
   *  the crew view too. null/absent = ×1.0 floor, no chip, ever. */
  boost?: { mult: number } | null;
}) {
  const { members, recognition, inviteCode, maxMembers } = overview;
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [rallyBusy, setRallyBusy] = useState(false);
  const sendRally = useMutation(api.rally.sendRally);
  const { emit } = useFeedback();

  // Send a rally (STR-15): success = generous-giver toast (the RECEIVER's
  // celebration banner plays on their screen via rally.unseen); rejection =
  // the server's friendly ConvexError message as a calm toast.
  async function onSendRally(m: Member) {
    setRallyBusy(true);
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
      setRallyBusy(false);
    }
  }

  const eligible = new Set(rally?.eligibleTeammates.map((t) => t.userId) ?? []);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.cardLabel}>
          GUILD · {members.length} {members.length === 1 ? "member" : "members"}
        </Text>
        {boost ? (
          <View style={styles.boostChip}>
            <Text style={styles.boostChipText}>⚡ ×{boost.mult} CREW POWER</Text>
          </View>
        ) : null}
      </View>
      {members.map((m) => {
        const badges: string[] = [];
        if (recognition.mvpUserId === m.userId) badges.push("👑 MVP");
        if (recognition.mostImprovedUserId === m.userId) badges.push("📈 Most Improved");
        if (recognition.longestStreakUserId === m.userId) badges.push("🔥 Longest Streak");
        const hs = HERO_STATE_STYLE[m.heroState];
        const canRally = rally && !m.isMe && eligible.has(m.userId);
        return (
          <View key={m.userId} style={[styles.row, m.isMe && styles.meRow]}>
            <View style={styles.rowTop}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>
                  {m.displayName}
                  {m.isMe ? " (you)" : ""}
                  {m.isSimulated ? " 🤖" : ""}
                </Text>
                <View style={[styles.stateChip, { backgroundColor: hs.bg, borderColor: hs.color }]}>
                  <Text style={[styles.stateChipText, { color: hs.color }]}>{hs.label}</Text>
                </View>
              </View>
              <Text style={styles.dmg}>{m.damage.toLocaleString()} dmg</Text>
            </View>
            <Text style={styles.sub}>
              {m.todaySteps.toLocaleString()} today · Job {m.jobLevel} · 🔥{m.displayStreak} ·{" "}
              {m.improvementPct >= 0 ? "+" : ""}
              {m.improvementPct}% vs avg
              {/* Bonus contribution (STR-57): shown ALONGSIDE weekly damage —
                  recognition badges stay improvement-based, so this never
                  becomes a raw-output leaderboard. */}
              {m.bonusDamage > 0 ? ` · 👑 ${m.bonusDamage.toLocaleString()} bonus` : ""}
            </Text>
            {badges.length > 0 ? <Text style={styles.badges}>{badges.join("   ")}</Text> : null}
            {/* Rally action (STR-15): only on server-eligible teammates. One
                send per day — after it's spent, the button dims with a warm
                "tomorrow" note (never a scold). */}
            {canRally ? (
              <View style={styles.rallyRow}>
                <Pressable
                  onPress={() => onSendRally(m)}
                  disabled={rallyBusy || rally.sentToday}
                  style={[styles.rallyBtn, (rallyBusy || rally.sentToday) && styles.rallyBtnSpent]}
                >
                  <Text style={styles.rallyBtnText}>
                    📣 SEND RALLY · ⚡{rally.energyCost.toLocaleString()}
                  </Text>
                </Pressable>
                {rally.sentToday ? (
                  <Text style={styles.rallyNote}>
                    Today's rally is sent — tomorrow brings another.
                  </Text>
                ) : (
                  <Text style={styles.rallyNote}>
                    Gift {m.displayName} {RALLY.fuelHoursGiven} hours of fight time.
                  </Text>
                )}
              </View>
            ) : null}
          </View>
        );
      })}
      {/* Invite surface (STR-47): the code every member can read aloud or
          share, with the open-seat count. Warm CTA, never a gate. */}
      {inviteCode ? (
        <View style={styles.inviteBlock}>
          <View style={styles.inviteRow}>
            <View>
              <Text style={styles.inviteLabel}>INVITE CODE</Text>
              <Text style={styles.inviteCode}>{inviteCode}</Text>
            </View>
            <Pressable
              onPress={async () => setShareNote(await shareInviteCode(inviteCode))}
              style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]}
            >
              <Text style={styles.shareBtnText}>SHARE</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            {members.length} of {maxMembers} spots filled — friends join with
            this code any time.
          </Text>
          {shareNote ? <Text style={styles.hint}>{shareNote}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PALETTE.panel,
    borderColor: PALETTE.panelBorder,
    borderWidth: 1,
    borderRadius: SIZES.radius,
    padding: SIZES.screenPad,
    gap: 10,
  },
  cardLabel: { color: PALETTE.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  // Shared boost chip (STR-57) — same gold treatment as the boss card's.
  boostChip: {
    backgroundColor: "#241a04",
    borderColor: PALETTE.accent,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  boostChipText: { color: PALETTE.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  row: { gap: 2, paddingVertical: 6, borderBottomColor: PALETTE.panelBorder, borderBottomWidth: 1 },
  meRow: { backgroundColor: "#12161f", borderRadius: 8, paddingHorizontal: 8 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  name: { color: PALETTE.text, fontSize: 15, fontWeight: "700" },
  // Fuel-state chip (STR-15) — same HERO_STATE_STYLE palette as the fuel card.
  stateChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  stateChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  // The gold SEND RALLY action (dashboard-ui.html mock: gold chip on the
  // resting friend's row — generosity is high-hierarchy).
  rallyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  rallyBtn: {
    backgroundColor: PALETTE.accent,
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rallyBtnSpent: { opacity: 0.35 },
  rallyBtnText: { color: "#241a04", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  rallyNote: { color: PALETTE.textDim, fontSize: 11, fontStyle: "italic", flexShrink: 1 },
  dmg: { color: PALETTE.hp, fontSize: 14, fontWeight: "800" },
  sub: { color: PALETTE.textDim, fontSize: 12 },
  badges: { color: PALETTE.accent, fontSize: 12, fontWeight: "700", marginTop: 2 },
  hint: { color: PALETTE.textDim, fontSize: 12, fontStyle: "italic" },
  inviteBlock: { gap: 6, marginTop: 4 },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inviteLabel: {
    color: PALETTE.textDim,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  inviteCode: {
    color: PALETTE.accent,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 4,
  },
  shareBtn: {
    backgroundColor: PALETTE.accent,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  pressed: { opacity: 0.55 },
  shareBtnText: { color: "#11131a", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
});
