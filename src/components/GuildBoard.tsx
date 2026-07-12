// The co-op roster: who's in the guild and what each member has contributed to
// the shared boss, plus the fairness recognition badges. All members' damage
// sums to the boss HP shown in the boss card.
import { StyleSheet, Text, View } from "react-native";
import { PALETTE, SIZES } from "../config/assets";

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
};

export function GuildBoard({ overview }: { overview: Overview }) {
  const { members, recognition } = overview;
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
      {members.length === 1 ? (
        <Text style={styles.hint}>
          Add a teammate in the dev panel to test the shared boss + recognition.
        </Text>
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
});
