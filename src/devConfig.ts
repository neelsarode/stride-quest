// Dev-only feature flags. `__DEV__` is true in development, false in a released
// build — so the dev panel never ships to real users. (The backend is ALSO gated
// by the ENABLE_DEV_TOOLS env var, which is the real security boundary.)

export const DEV_FLAGS = {
  /** Show the dev control panel (clock time-travel, step injector, teammates). */
  showDevPanel: __DEV__,
  /** Route the home to the new full-screen GameScreen (STR-66 / M2.75) instead
   *  of the classic DashboardScreen. Default ON as of STR-71 — M2.75 verified the
   *  full-screen HUD loop end-to-end (8 scenarios) and flipped this to the
   *  milestone deliverable; App.tsx picks the screen by it. DashboardScreen stays
   *  behind the flag as the fallback for one milestone (its deletion is an M4
   *  cleanup line). Set false here to fall back to the classic dashboard. */
  useGameScreen: true,
  /** Preview the HealthKit beat (STR-48) where HealthKit doesn't exist: flip to
   *  true to see Beat 3 in onboarding + the CONNECT HEALTH chip in the browser.
   *  The web stub has no data, so "connect" lands on the gentle no-data state —
   *  design review only; the real permission sheet needs an iOS device. */
  forceHealthBeat: false,
};

/** Preset amounts for the self step-injector buttons. */
export const INJECTOR_AMOUNTS = [500, 1_000, 2_500, 10_000] as const;

/** Preset amounts for giving a simulated teammate steps. */
export const TEAMMATE_STEP_AMOUNTS = [2_000, 8_000] as const;
