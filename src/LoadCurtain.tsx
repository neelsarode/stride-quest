// =============================================================================
// LoadCurtain — the app-level black curtain over SCREEN transitions (STR-94).
//
// The per-surface RevealGates (battle scene, HUD) fix piecemeal decode WITHIN a
// surface, but they reveal independently — so on entry the HUD appeared over a
// still-black battlefield, and the entrance screen hard-cut to black. This
// curtain sits ABOVE the routed screen and sequences the whole entry:
//
//   entrance visible → fade TO black (COVER_MS) → swap the screen underneath →
//   hold black while the new screen's gates get ready → fade OUT (REVEAL_MS).
//
// "Ready" for the game screen = BOTH its RevealGates have revealed (they report
// via markGateRevealed through a module store, same pattern as Overlays'
// toggle* store). Non-game screens are ready immediately (quick black dip).
// A hard cap guarantees the curtain always lifts.
// =============================================================================
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Animated, StyleSheet } from "react-native";

const COVER_MS = 220; // entrance → black
const REVEAL_MS = 320; // black → new screen
const READY_CAP_MS = 5000; // lift even if a gate never reports (offline etc.)

// --- gate store: which game surfaces have revealed -------------------------
export type GateName = "scene" | "hud";
const revealedGates = new Set<GateName>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

/** RevealGates report here (via onRevealed) — module-stable callbacks. */
export function markGateRevealed(name: GateName) {
  if (revealedGates.has(name)) return;
  revealedGates.add(name);
  notify();
}
export const markSceneRevealed = () => markGateRevealed("scene");
export const markHudRevealed = () => markGateRevealed("hud");

/** GameScreen clears the slate on mount (re-entry after sign-out/reset). */
export function resetGateReveals() {
  if (revealedGates.size === 0) return;
  revealedGates.clear();
  notify();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useGameSurfacesRevealed(): boolean {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return revealedGates.has("scene") && revealedGates.has("hud");
}

// --- the curtain ------------------------------------------------------------
export interface FadeThroughProps {
  /** Identity of the routed screen ("title" | "onboarding" | "game" | …). */
  screenKey: string;
  /** The new screen may be revealed (game: both gates reported). */
  ready: boolean;
  children: ReactNode;
}

export function FadeThrough({ screenKey, ready, children }: FadeThroughProps) {
  // The screen actually on stage — lags `screenKey` until the curtain is black.
  const [displayKey, setDisplayKey] = useState(screenKey);
  const displayNode = useRef(children);
  if (displayKey === screenKey) displayNode.current = children;

  const cover = useRef(new Animated.Value(0)).current; // 0 = clear, 1 = black
  // Curtain must be up before the new screen may fade in (initial mount shows
  // the first screen immediately — no cold-open black flash).
  const covered = useRef(false);
  const [waiting, setWaiting] = useState(false);
  const [capped, setCapped] = useState(false);

  // PHASE 1 — screen changed: fade the OLD screen to black, then swap.
  useEffect(() => {
    if (screenKey === displayKey) return;
    let cancelled = false;
    Animated.timing(cover, {
      toValue: 1,
      duration: COVER_MS,
      useNativeDriver: true,
    }).start(() => {
      if (cancelled) return;
      covered.current = true;
      setCapped(false);
      setWaiting(true);
      setDisplayKey(screenKey);
    });
    return () => {
      cancelled = true;
    };
  }, [screenKey, displayKey, cover]);

  // Ready cap: never hold black forever.
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setCapped(true), READY_CAP_MS);
    return () => clearTimeout(t);
  }, [waiting]);

  // PHASE 2 — new screen on stage + ready (or capped): lift the curtain.
  useEffect(() => {
    if (!waiting || screenKey !== displayKey) return;
    if (!ready && !capped) return;
    setWaiting(false);
    covered.current = false;
    Animated.timing(cover, {
      toValue: 0,
      duration: REVEAL_MS,
      useNativeDriver: true,
    }).start();
  }, [waiting, ready, capped, screenKey, displayKey, cover]);

  // The curtain only intercepts touches while it is actually up.
  const blocking = waiting || screenKey !== displayKey;

  return (
    <>
      {displayNode.current}
      <Animated.View
        testID="load-curtain"
        pointerEvents={blocking ? "auto" : "none"}
        style={[StyleSheet.absoluteFill, styles.curtain, { opacity: cover }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  curtain: { backgroundColor: "#000", zIndex: 99999, elevation: 99999 },
});

export default FadeThrough;
