// =============================================================================
// STRIDE QUEST — app root.
// =============================================================================
// Wires the Convex auth provider, auto-signs each player in anonymously (no login
// screen), then shows the dashboard. If the backend URL isn't configured yet we
// show a setup screen instead of crashing.
// =============================================================================
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";

import { convex } from "./src/convex";
import { secureStorage } from "./src/secureStorage";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { BackendSetupScreen } from "./src/screens/BackendSetupScreen";
import { FeedbackProvider } from "./src/feedback/FeedbackProvider";
import { PALETTE } from "./src/config/assets";

export default function App() {
  // No backend URL yet -> guide the user instead of crashing.
  if (!convex) {
    return (
      <>
        <BackendSetupScreen />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <FeedbackProvider>
        <AuthGate />
      </FeedbackProvider>
      <StatusBar style="light" />
    </ConvexAuthProvider>
  );
}

/** Ensures every player has an anonymous identity, then renders the app. */
function AuthGate() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void signIn("anonymous");
    }
  }, [isLoading, isAuthenticated, signIn]);

  if (isLoading || !isAuthenticated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PALETTE.accent} />
        <Text style={styles.dim}>Summoning your hero…</Text>
      </View>
    );
  }

  return <DashboardScreen />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: PALETTE.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  dim: { color: PALETTE.textDim, fontSize: 14 },
});
