// =============================================================================
// useAppVisible — the app-wide foreground/visibility signal: true while the app
// is foregrounded (native AppState "active") / the tab visible (web
// document.visibilityState). Extracted VERBATIM from ConnectedBattleScene in
// STR-86 so useGameEngine's foreground refresh can share it with STR-85's
// ambient-loop background pause (both call sites import from here now).
// =============================================================================
import { useEffect, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

export function useAppVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (Platform.OS === "web") {
      // react-native-web ships an AppState shim, but the DOM API is the exact
      // signal we mean on web — use it directly (SSR-guarded).
      if (typeof document === "undefined") return;
      const onChange = () => setVisible(document.visibilityState !== "hidden");
      onChange();
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    }
    const onChange = (s: AppStateStatus) => setVisible(s === "active");
    onChange(AppState.currentState);
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);
  return visible;
}

export default useAppVisible;
