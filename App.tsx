// =============================================================================
// STRIDE QUEST — app root.
// =============================================================================
// Wires the Convex auth provider, auto-signs each player in anonymously (no
// login screen), then routes on SERVER state (STR-45, onboarding spec §Flow):
// the DB's routing keys (class → hasGuild → onboardedAt) say which beat comes
// next, so the flow is resume-safe by construction. If the backend URL isn't
// configured yet we show a setup screen instead of crashing.
// =============================================================================
import {
  Component,
  Fragment,
  useEffect,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";

import { api } from "./convex/_generated/api";
import { convex } from "./src/convex";
import { secureStorage } from "./src/secureStorage";
import { DEV_FLAGS } from "./src/devConfig";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { GameScreen } from "./src/game/GameScreen";
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
      {/* SafeAreaProvider feeds the game screen's scale/safe-area hook
          (STR-66). Harmless to the classic dashboard, which ignores insets. */}
      <SafeAreaProvider>
        {/* Root ErrorBoundary (STR-86): INSIDE the Convex provider — a retry
            remounts the screen tree against the SAME live client/auth session —
            and OUTSIDE FeedbackProvider, so a crash anywhere in the screen tree
            (a query-throwing screen, a feedback overlay bug) shows the calm
            retry surface instead of a white screen. */}
        <RootErrorBoundary>
          <FeedbackProvider>
            <AuthGate />
          </FeedbackProvider>
        </RootErrorBoundary>
        <StatusBar style="light" />
      </SafeAreaProvider>
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

  // The home screen: classic DashboardScreen, or the new full-screen GameScreen
  // behind DEV_FLAGS.useGameScreen (STR-66 / M2.75). Both share useGameEngine,
  // so flipping the flag re-skins the presentation without forking behavior.
  return DEV_FLAGS.useGameScreen ? <GameScreen /> : <DashboardScreen />;
}

// =============================================================================
// RootErrorBoundary (STR-86) — catches RENDER errors anywhere in the screen
// tree and shows a calm full-screen fallback in the app's voice instead of a
// white screen. TAP TO RETRY clears the error and remounts the children fresh
// (the `attempt` key). Deliberately plain <Text> on a dark background — NOT
// PixelText: the pixel font works outside UIScaleProvider (it defaults to
// scale 2), but it depends on the baked-asset pipeline, and if THAT is what
// threw, a PixelText fallback would crash the boundary's own render (which no
// boundary can catch) — the fallback must be the most boring tree in the app.
// =============================================================================
class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; attempt: number }
> {
  state: { error: Error | null; attempt: number } = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary] render error:", error, info.componentStack);
  }

  private retry = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <View style={boundaryStyles.root}>
          <Text style={boundaryStyles.title}>THE BATTLE HIT A SNAG</Text>
          <Text style={boundaryStyles.sub}>
            Your steps and progress are safe on the server.
          </Text>
          <Pressable
            onPress={this.retry}
            style={({ pressed }) => [
              boundaryStyles.btn,
              pressed && boundaryStyles.btnPressed,
            ]}
          >
            <Text style={boundaryStyles.btnText}>TAP TO RETRY</Text>
          </Pressable>
        </View>
      );
    }
    // Keyed by attempt so a retry remounts the whole screen tree fresh; a
    // Fragment adds no layout node (the tree renders exactly as before).
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

const boundaryStyles = StyleSheet.create({
  // Palette mirrors src/config/assets.ts PALETTE (bg/text/dim/accent) without
  // importing app modules — the boundary must not depend on anything that can
  // itself fail to load.
  root: {
    flex: 1,
    backgroundColor: "#11131a",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 32,
  },
  title: {
    color: "#e8ecf4",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 2,
    textAlign: "center",
  },
  sub: { color: "#8a93a6", fontSize: 13, textAlign: "center", lineHeight: 19 },
  btn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#ffd166",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  btnPressed: { opacity: 0.55 },
  btnText: {
    color: "#ffd166",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
});
