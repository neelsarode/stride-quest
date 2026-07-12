// =============================================================================
// HealthKit reader — DEFAULT stub (web + Android).
// =============================================================================
// HealthKit is iOS-only. On every non-iOS platform Metro loads THIS file, which
// never imports the native module — so the web preview bundles and runs cleanly.
// The real implementation lives in healthkit.ios.ts.
//
// This is the "step source" seam: real steps come through here on a device, and
// the dev injector (a button that writes fake steps) covers every other case.
// =============================================================================

/** Is reading steps from HealthKit possible on this platform/device? */
export function isAvailable(): boolean {
  return false;
}

/** Ask the OS for permission to read step count. */
export async function requestStepPermission(): Promise<boolean> {
  return false;
}

/** Read today's cumulative step total. Returns null when unavailable. */
export async function readTodaySteps(): Promise<number | null> {
  return null;
}
