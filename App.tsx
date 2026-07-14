// =============================================================================
// STRIDE QUEST — app root.
// =============================================================================
// Wires the Convex auth provider, auto-signs each player in anonymously (no
// login screen), then routes on SERVER state (STR-45, onboarding spec §Flow):
// the DB's routing keys (class → hasGuild → onboardedAt) say which beat comes
// next, so the flow is resume-safe by construction. If the backend URL isn't
// configured yet we show a setup screen instead of crashing.
// =============================================================================
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";

import { api } from "./convex/_generated/api";
import { convex } from "./src/convex";
import { secureStorage } from "./src/secureStorage";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { BackendSetupScreen } from "./src/screens/BackendSetupScreen";
import { FeedbackProvider } from "./src/feedback/FeedbackProvider";
import { TitleCard } from "./src/screens/onboarding/TitleCard";
import { OnboardingFlow } from "./src/screens/onboarding/OnboardingFlow";

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

/**
 * Ensures every player has an anonymous identity, then routes purely from
 * server state — the onboarding state machine (spec §Flow: "no router"):
 *   signing in / loading      → Beat 0 title card (sign-in runs behind it)
 *   no `onboardedAt` stamp    → OnboardingFlow (hero → guild → stamp)
 *   stamped                   → the game (dashboard)
 * Kill the app at any beat and it reopens exactly there: every routing key
 * lives in the DB, never in local state. This also kills the old dead-end
 * where a fresh account sat on "Setting up your guild…" forever — a guild-less
 * account now routes INTO the flow instead of past it.
 */
function AuthGate() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void signIn("anonymous");
    }
  }, [isLoading, isAuthenticated, signIn]);

  // The routing keys, straight from the server (skip until the token exists).
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");

  // Beat 0 — covers anonymous sign-in AND the first viewer load, so there is
  // exactly one pre-game surface (<2s, nothing to tap).
  if (isLoading || !isAuthenticated || viewer === undefined || viewer === null) {
    return <TitleCard />;
  }

  if (viewer.onboardedAt === null) {
    return <OnboardingFlow viewer={viewer} />;
  }

  return <DashboardScreen />;
}
