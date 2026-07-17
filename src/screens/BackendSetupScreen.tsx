// Shown when EXPO_PUBLIC_CONVEX_URL isn't set yet (i.e. `npx convex dev` hasn't
// been run). Keeps the app from crashing and tells you exactly what to do.
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PALETTE, SIZES } from "../config/assets";

export function BackendSetupScreen() {
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>WALKPG</Text>
      <Text style={styles.subtitle}>Backend not connected yet</Text>

      <View style={styles.card}>
        <Text style={styles.body}>
          The app is running, but it can't reach the Convex backend because{" "}
          <Text style={styles.code}>EXPO_PUBLIC_CONVEX_URL</Text> isn't set.
        </Text>
        <Text style={styles.step}>
          1. Open a terminal in the project folder and run:
        </Text>
        <Text style={styles.code}>npx convex dev</Text>
        <Text style={styles.body}>
          Sign in / create the project when prompted. It writes the URL into{" "}
          <Text style={styles.code}>.env.local</Text> automatically and keeps
          running.
        </Text>
        <Text style={styles.step}>
          2. Stop and restart this app so it picks up the new URL.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.bg },
  content: { padding: SIZES.screenPad, paddingTop: 80, gap: SIZES.gap },
  title: {
    color: PALETTE.accent,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 2,
    textAlign: "center",
  },
  subtitle: {
    color: PALETTE.textDim,
    fontSize: 14,
    textAlign: "center",
    marginBottom: SIZES.gap,
  },
  card: {
    backgroundColor: PALETTE.panel,
    borderColor: PALETTE.panelBorder,
    borderWidth: 1,
    borderRadius: SIZES.radius,
    padding: SIZES.screenPad,
    gap: 10,
  },
  body: { color: PALETTE.text, fontSize: 15, lineHeight: 22 },
  step: { color: PALETTE.accent, fontSize: 15, fontWeight: "700", marginTop: 6 },
  code: {
    color: PALETTE.good,
    fontFamily: "Courier",
    backgroundColor: "#0c0e14",
    fontSize: 14,
  },
});
