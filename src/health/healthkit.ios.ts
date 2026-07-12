// =============================================================================
// HealthKit reader — REAL iOS implementation.
// =============================================================================
// Metro loads this file only on iOS. API verified against
// @kingstinct/react-native-healthkit v14.0.2.
//
// NOTE: the iOS Simulator has the HealthKit framework but NO real step data, so
// readTodaySteps() returns 0 there. Real numbers require a physical iPhone (which
// also needs the paid Apple Developer account — deferred for now). Until then the
// dev injector drives the whole loop.
// =============================================================================
import {
  isHealthDataAvailable,
  requestAuthorization,
  queryStatisticsForQuantity,
} from "@kingstinct/react-native-healthkit";

const STEP_COUNT = "HKQuantityTypeIdentifierStepCount" as const;

export function isAvailable(): boolean {
  return isHealthDataAvailable();
}

export async function requestStepPermission(): Promise<boolean> {
  if (!isHealthDataAvailable()) return false;
  try {
    // Apple never reveals whether READ access was granted (privacy by design);
    // this resolves true once the prompt is handled. We just try to read after.
    return await requestAuthorization({ toRead: [STEP_COUNT] });
  } catch {
    return false;
  }
}

export async function readTodaySteps(): Promise<number | null> {
  if (!isHealthDataAvailable()) return null;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const now = new Date();
  try {
    const stats = await queryStatisticsForQuantity(STEP_COUNT, ["cumulativeSum"], {
      filter: { date: { startDate: startOfDay, endDate: now } },
      unit: "count",
    });
    return Math.round(stats.sumQuantity?.quantity ?? 0);
  } catch {
    return null;
  }
}
