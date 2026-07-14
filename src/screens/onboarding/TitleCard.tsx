// =============================================================================
// Beat 0 — "Summoning." (STR-45; onboarding spec §Flow Beat 0; comp TITLE beat)
// =============================================================================
// The old sign-in spinner grown into the game's opening scene: wordmark +
// tagline while anonymous sign-in (and, at the end of the flow, the
// completeOnboarding stamp) runs behind it. Under ~2s, nothing to tap — it
// routes itself away when the server state settles. Placeholder fidelity:
// flat dark instead of the comp's battlefield background; the pixel-art skin
// swap happens through src/config/assets.ts later, per the brief.
// =============================================================================
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { PALETTE } from "../../config/assets";

export function TitleCard() {
  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.wordmark}>STRIDE{"\n"}QUEST</Text>
        <Text style={styles.tagline}>WALK TOGETHER. FIGHT TOGETHER.</Text>
        <View style={styles.summon}>
          <ActivityIndicator color={PALETTE.accent} />
          <Text style={styles.summonText}>Summoning your hero…</Text>
        </View>
      </View>
      <Text style={styles.footer}>No account needed — just walk.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PALETTE.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  center: { alignItems: "center", gap: 18 },
  wordmark: {
    color: PALETTE.accent,
    fontSize: 52,
    lineHeight: 58,
    fontWeight: "900",
    letterSpacing: 8,
    textAlign: "center",
  },
  tagline: {
    color: PALETTE.text,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    textAlign: "center",
  },
  summon: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 26 },
  summonText: { color: PALETTE.textDim, fontSize: 14 },
  footer: {
    position: "absolute",
    bottom: 48,
    color: PALETTE.textDim,
    fontSize: 12,
    letterSpacing: 1,
  },
});
