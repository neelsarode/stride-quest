// Dev-only feature flags. `__DEV__` is true in development, false in a released
// build — so the dev panel never ships to real users. (The backend is ALSO gated
// by the ENABLE_DEV_TOOLS env var, which is the real security boundary.)

export const DEV_FLAGS = {
  /** Show the dev control panel (clock time-travel, step injector, teammates). */
  showDevPanel: __DEV__,
};

/** Preset amounts for the self step-injector buttons. */
export const INJECTOR_AMOUNTS = [500, 1_000, 2_500, 10_000] as const;

/** Preset amounts for giving a simulated teammate steps. */
export const TEAMMATE_STEP_AMOUNTS = [2_000, 8_000] as const;
