// =============================================================================
// Fuel math — PURE functions only (no Convex imports), like gameConfig.
// =============================================================================
// Steps are fuel (1 step = 1 fuel) for a hero who fights 24/7. The tank drains
// piecewise by hero state:
//   Battling  fuel > windedThreshold   → full burn (300/h)
//   Winded    0 < fuel ≤ threshold     → half burn (150/h), so the last nominal
//                                        6 hours stretch to 12 real hours
//   Resting   fuel = 0                 → no burn. Resting is never punished:
//                                        fuel never goes negative, ever.
// Burn is settled on interaction against the server clock, mirroring idle.ts:
// stored state is just (settled fuel, settle timestamp); elapsed time beyond
// OFFLINE_CAP_HOURS is PAUSED, not burned — absence pauses, never punishes.
//
// NOTE the ".ts" import extension: it lets Node's type-stripping run this file
// directly in tests/fuel.test.mjs (extensionless imports don't resolve in Node).
// =============================================================================
import { FUEL, OFFLINE_CAP_MS } from "./gameConfig.ts";

const HOUR_MS = 3_600_000;

// --- derived constants (all in FUEL units, i.e. steps) -----------------------

/** 14,400 fuel — the most a tank can hold (48h of battling). */
export const TANK_CAP_FUEL = FUEL.tankCapHours * FUEL.burnPerHourBattling;
/** 7,200 fuel — what a brand-new hero starts with (24h of battling). */
export const STARTER_FUEL = FUEL.starterFuelHours * FUEL.burnPerHourBattling;
/** 1,800 fuel — at or below this the hero is Winded. */
export const WINDED_THRESHOLD_FUEL =
  FUEL.windedThresholdHours * FUEL.burnPerHourBattling;
/** 150 fuel/h — the Winded burn rate. */
export const WINDED_BURN_PER_HOUR =
  FUEL.burnPerHourBattling * FUEL.windedBurnMult;

// --- hero state ---------------------------------------------------------------

export type FuelState = "battling" | "winded" | "resting";

/** Battling above the winded threshold, Winded down to empty, Resting at 0. */
export function fuelStateFor(fuel: number): FuelState {
  if (fuel > WINDED_THRESHOLD_FUEL) return "battling";
  if (fuel > 0) return "winded";
  return "resting";
}

/** Fuel burned per hour in a given state. */
export function burnRateForState(state: FuelState): number {
  if (state === "battling") return FUEL.burnPerHourBattling;
  if (state === "winded") return WINDED_BURN_PER_HOUR;
  return 0;
}

/** Idle-damage multiplier applied by a state (STR-7 prices damage with this). */
export function damageMultForState(state: FuelState): number {
  if (state === "battling") return 1;
  if (state === "winded") return FUEL.windedDamageMult;
  return 0;
}

// --- the piecewise walk --------------------------------------------------------

export type FuelSegment = {
  state: FuelState;
  /** How long the hero spent in this state within the window (fractional hours). */
  hours: number;
  startFuel: number;
  endFuel: number;
};

/**
 * Walk the tank forward through `elapsedMs` of ACTIVE time (cap it with
 * cappedElapsedMs first). Splits the window into per-state segments — battling
 * until the winded threshold, winded until empty, resting for whatever remains —
 * so a caller can price both burn AND idle damage from the exact same windows.
 * Fuel floors at 0 by construction (never negative).
 */
export function walkFuel(
  startFuel: number,
  elapsedMs: number,
): { endFuel: number; burned: number; segments: FuelSegment[] } {
  let fuel = Math.max(0, startFuel);
  let hoursLeft = Math.max(0, elapsedMs) / HOUR_MS;
  const segments: FuelSegment[] = [];

  while (hoursLeft > 0) {
    const state = fuelStateFor(fuel);
    const rate = burnRateForState(state);
    if (rate === 0) {
      // Resting: the rest of the window passes cozily, nothing burns.
      segments.push({ state, hours: hoursLeft, startFuel: fuel, endFuel: fuel });
      hoursLeft = 0;
      break;
    }
    // How long until this state's floor (threshold for battling, empty for winded)?
    const floor = state === "battling" ? WINDED_THRESHOLD_FUEL : 0;
    const hoursToFloor = (fuel - floor) / rate;
    const hours = Math.min(hoursLeft, hoursToFloor);
    const endFuel = fuel - rate * hours;
    segments.push({ state, hours, startFuel: fuel, endFuel });
    fuel = endFuel;
    hoursLeft -= hours;
  }

  return {
    endFuel: fuel,
    burned: Math.max(0, startFuel) - fuel,
    segments,
  };
}

/** Active elapsed ms since the last settle — mirrors idle.ts's offline cap:
 *  time beyond OFFLINE_CAP_HOURS is paused (neither burn nor damage), so being
 *  unable to open the app never wastes the tank. */
export function cappedElapsedMs(lastSettledAt: number, now: number): number {
  return Math.min(Math.max(0, now - lastSettledAt), OFFLINE_CAP_MS);
}

/** Add fuel to a settled tank, clamped to [0, TANK_CAP_FUEL]. Overflow past the
 *  cap is simply lost (a full tank is full). */
export function addFuel(fuel: number, amount: number): number {
  return Math.min(Math.max(0, fuel + Math.max(0, amount)), TANK_CAP_FUEL);
}

/** REAL hours of fighting left in the tank from this level ("your hero can
 *  fight for 9 more hours") — the winded stretch burns at half rate, so the
 *  last 1,800 nominal fuel lasts 12 real hours, not 6. */
export function hoursToEmpty(fuel: number): number {
  const f = Math.max(0, fuel);
  const battlingHours =
    Math.max(0, f - WINDED_THRESHOLD_FUEL) / FUEL.burnPerHourBattling;
  const windedHours = Math.min(f, WINDED_THRESHOLD_FUEL) / WINDED_BURN_PER_HOUR;
  return battlingHours + windedHours;
}
