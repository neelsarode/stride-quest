// The co-op roster: who's in the guild and what each member has contributed to
// the shared boss, plus the fairness recognition badges. All members' damage
// sums to the boss HP shown in the boss card. Also the standing invite surface
// (STR-47, spec Beat 2a: "your code lives on the guild board too") — the code
// + native Share replace the old dev-panel copy leak.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PALETTE, SIZES } from "../config/assets";
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
  displayStreak: number;
  improvementPct: number;
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

export function GuildBoard({ overview }: { overview: Overview }) {
  const { members, recognition, inviteCode, maxMembers } = overview;
  const [shareNote, setShareNote] = useState<string | null>(null);
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>
        GUILD · {members.length} {members.length === 1 ? "member" : "members"}
      </Text>
      {members.map((m) => {
        const badges: string[] = [];
        if (recognition.mvpUserId === m.userId) badges.push("👑 MVP");
        if (recognition.mostImprovedUserId === m.userId) badges.push("📈 Most Improved");
        if (recognition.longestStreakUserId === m.userId) badges.push("🔥 Longest Streak");
        return (
          <View key={m.userId} style={[styles.row, m.isMe && styles.meRow]}>
            <View style={styles.rowTop}>
              <Text style={styles.name}>
                {m.displayName}
                {m.isMe ? " (you)" : ""}
                {m.isSimulated ? " 🤖" : ""}
              </Text>
              <Text style={styles.dmg}>{m.damage.toLocaleString()} dmg</Text>
            </View>
            <Text style={styles.sub}>
              {m.todaySteps.toLocaleString()} today · Job {m.jobLevel} · 🔥{m.displayStreak} ·{" "}
              {m.improvementPct >= 0 ? "+" : ""}
              {m.improvementPct}% vs avg
            </Text>
            {badges.length > 0 ? <Text style={styles.badges}>{badges.join("   ")}</Text> : null}
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
  row: { gap: 2, paddingVertical: 6, borderBottomColor: PALETTE.panelBorder, borderBottomWidth: 1 },
  meRow: { backgroundColor: "#12161f", borderRadius: 8, paddingHorizontal: 8 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: PALETTE.text, fontSize: 15, fontWeight: "700" },
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
