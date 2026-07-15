// =============================================================================
// Fuel math — PURE functions only (no Convex imports), like gameConfig.
// =============================================================================
// Steps are fuel (1 step = 1 fuel) for a hero who fights 24/7. The tank drains
// piecewise by hero state (rates re-anchored for Core Loop v2, spec §6):
//   Battling  fuel > windedThreshold   → full burn (225/h)
//   Winded    0 < fuel ≤ threshold     → half burn (112.5/h), so the last nominal
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
import {
  BASE_IDLE_DPH,
  DAILY_STEP_GOAL,
  FUEL,
  OFFLINE_CAP_MS,
  OVERDRIVE,
  RALLY,
} from "./gameConfig.ts";

const HOUR_MS = 3_600_000;

// --- derived constants (all in FUEL units, i.e. steps) -----------------------

/** 10,800 fuel — the most a tank can hold (48h of battling, at 225/h). */
export const TANK_CAP_FUEL = FUEL.tankCapHours * FUEL.burnPerHourBattling;
/** 5,400 fuel — what a brand-new hero starts with (24h of battling, at 225/h). */
export const STARTER_FUEL = FUEL.starterFuelHours * FUEL.burnPerHourBattling;
/** 1,350 fuel — at or below this the hero is Winded (6h × 225/h). */
export const WINDED_THRESHOLD_FUEL =
  FUEL.windedThresholdHours * FUEL.burnPerHourBattling;
/** 112.5 fuel/h — the Winded burn rate (225 × 0.5). */
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

/** Fuel one Rally grants (STR-9): 6 hours at the battling rate = 1,350, PLUS a
 *  1-fuel wake margin. Why the margin: the state boundary puts the threshold
 *  itself in the Winded band (fuel must be STRICTLY above 1,350 to Battle), and
 *  a fully-drained tank sits at exactly 0 — so a bare 1,350 grant would land an
 *  empty receiver exactly ON the threshold, still Winded. A rally is a WAKE-UP
 *  (spec §5): the +1 (≈16 seconds of battling at 225/h) guarantees every rallied
 *  hero comes back Battling. */
export const RALLY_FUEL_GRANT =
  RALLY.fuelHoursGiven * FUEL.burnPerHourBattling + 1;

/** NOMINAL battling-hours worth of a fuel amount (fuel ÷ 225/h) — the unit the
 *  spec sizes everything in ("48h tank", "6h rally"). Display-oriented: a rally
 *  row's `fuelGiven` reads back as "≈6 hours". For REAL time-to-empty (which
 *  stretches the winded tail) use hoursToEmpty. */
export function battlingHoursForFuel(fuel: number): number {
  return Math.max(0, fuel) / FUEL.burnPerHourBattling;
}

/** The inverse: a tank level for N nominal battling-hours, clamped to
 *  [0, TANK_CAP_FUEL] like every other way fuel enters the tank. Used by the
 *  dev "set fuel to N hours" control (STR-12). */
export function fuelForBattlingHours(hours: number): number {
  return Math.min(
    Math.max(0, hours) * FUEL.burnPerHourBattling,
    TANK_CAP_FUEL,
  );
}

/** REAL hours of fighting left in the tank from this level ("your hero can
 *  fight for 9 more hours") — the winded stretch burns at half rate, so the
 *  last 1,350 nominal fuel lasts 12 real hours, not 6. */
export function hoursToEmpty(fuel: number): number {
  const f = Math.max(0, fuel);
  const battlingHours =
    Math.max(0, f - WINDED_THRESHOLD_FUEL) / FUEL.burnPerHourBattling;
  const windedHours = Math.min(f, WINDED_THRESHOLD_FUEL) / WINDED_BURN_PER_HOUR;
  return battlingHours + windedHours;
}

// --- fuel-driven idle damage (STR-7) -------------------------------------------

/** Idle damage-per-hour in a state at a job multiplier: the hero only fights
 *  while fueled — Battling at full rate, Winded at half, Resting at zero. */
export function idleDphFor(state: FuelState, jobMult: number): number {
  return BASE_IDLE_DPH * jobMult * damageMultForState(state);
}

/** Price idle damage over EXACTLY the segments a fuel walk produced, so burn
 *  and damage always come from the same clock windows (unfloored — callers
 *  floor once, at the end of a settle).
 *
 *  `overdriveHours` (STR-8): how many hours of Overdrive remain at the START of
 *  this window. Overdrive adds a TIME boundary on top of the fuel-state
 *  boundaries: inside it, damage is ×OVERDRIVE.idleDamageMult; burn is
 *  untouched (Overdrive is a pure reward, never a cost). The Winded ×0.5 is
 *  already inside idleDphFor, so it stacks multiplicatively per the spec. */
export function idleDamageForSegments(
  segments: FuelSegment[],
  jobMult: number,
  overdriveHours = 0,
): number {
  let damage = 0;
  let odLeft = Math.max(0, overdriveHours);
  for (const s of segments) {
    const odHours = Math.min(s.hours, odLeft);
    odLeft -= odHours;
    const dph = idleDphFor(s.state, jobMult);
    damage +=
      odHours * dph * OVERDRIVE.idleDamageMult + (s.hours - odHours) * dph;
  }
  return damage;
}

// --- Overdrive charge + window math (STR-8) ------------------------------------

/** Overdrive charge earned by a set of per-day step totals: every step ABOVE
 *  the daily goal charges the meter (per-day excess, never negative). */
export function overdriveExcessFromDayTotals(
  dayTotals: Iterable<number>,
): number {
  let excess = 0;
  for (const t of dayTotals) excess += Math.max(0, t - DAILY_STEP_GOAL);
  return excess;
}

/** Charge meter fraction in [0, 1]: (excess earned − excess consumed) / full
 *  charge, clamped. Holds at 1 until used; partial charge persists across days
 *  by construction (it's derived, nothing decays it). */
export function overdriveChargeFraction(
  excessEarned: number,
  excessSpent: number,
): number {
  return Math.min(
    Math.max(0, excessEarned - excessSpent) / OVERDRIVE.fullChargeExcessSteps,
    1,
  );
}

/** Hours of Overdrive remaining at a window's start, given the wall-clock
 *  active-until stamp. The settled window is anchored at the last settle stamp
 *  (the hero fights the FIRST cappedElapsed hours after it, then pauses), so
 *  Overdrive always occupies the front of the window — the offline-cap pause
 *  truncates the far end and can never eat the ×2 hours. Combined with
 *  activation itself settling, every charge yields EXACTLY durationHours of
 *  effective ×2 across settles. (Multiplier is OVERDRIVE.idleDamageMult, now 2
 *  per Core Loop v2 §6 — this window helper is unchanged.) */
export function overdriveHoursAt(
  windowStartMs: number,
  overdriveUntil: number | undefined,
): number {
  if (overdriveUntil === undefined) return 0;
  return Math.max(0, overdriveUntil - windowStartMs) / HOUR_MS;
}

/**
 * The ONE shared settle: walk the piecewise fuel segments once and price both
 * the burn and the idle damage off the same walk, so they can never disagree.
 *
 * Takes the two stored stamps (users.fuelSettledAt, progress.lastIdleCollectedAt).
 * In normal operation every settle stamps both, so they're equal, and the whole
 * window earns burn + damage together. When they diverge the mismatched lead-in
 * is settled one-sided first:
 *  - fuel stamp older (e.g. a fresh progress row after the weekly boss spawn):
 *    the lead-in burns fuel but deals NO damage — there was no current boss to
 *    hit during it.
 *  - idle stamp older (defensive; shouldn't happen once every settle is shared):
 *    the lead-in deals damage at the CURRENT settled level's state — the fuel
 *    trajectory before its own stamp is already settled and unknowable.
 * Each stamp anchors its own OFFLINE_CAP window (absence pauses both).
 *
 * `overdriveUntil` (STR-8, optional): wall-clock effective-ms when Overdrive
 * ends. Damage inside it is ×OVERDRIVE.idleDamageMult; burn never changes.
 * Every sub-window anchors the ×2 boundary at its own start stamp, so an
 * expired stamp simply contributes zero overdrive hours.
 */
export function settleFuelAndIdleWindow(args: {
  fuel: number;
  fuelLastAt: number;
  idleLastAt: number;
  now: number;
  jobMult: number;
  overdriveUntil?: number;
}): { fuel: number; burned: number; damage: number } {
  const { now, jobMult, overdriveUntil } = args;
  let fuel = Math.max(0, args.fuel);
  let burned = 0;
  let damage = 0;
  let fuelLastAt = args.fuelLastAt;
  let idleLastAt = args.idleLastAt;

  if (fuelLastAt < idleLastAt) {
    // Burn-only lead-in (no damage: the current boss didn't exist yet).
    // Overdrive is irrelevant here — it multiplies damage, never burn.
    const w = walkFuel(fuel, cappedElapsedMs(fuelLastAt, Math.min(idleLastAt, now)));
    fuel = w.endFuel;
    burned += w.burned;
    fuelLastAt = idleLastAt;
  } else if (idleLastAt < fuelLastAt) {
    // Damage-only lead-in at the current settled level's state (defensive path).
    const ms = cappedElapsedMs(idleLastAt, Math.min(fuelLastAt, now));
    const odMs = Math.min(
      overdriveHoursAt(idleLastAt, overdriveUntil) * HOUR_MS,
      ms,
    );
    const dph = idleDphFor(fuelStateFor(fuel), jobMult);
    damage +=
      (odMs / HOUR_MS) * dph * OVERDRIVE.idleDamageMult +
      ((ms - odMs) / HOUR_MS) * dph;
    idleLastAt = fuelLastAt;
  }

  // The shared window: one walk prices burn AND damage from the same segments.
  const sharedStart = Math.max(fuelLastAt, idleLastAt);
  const shared = walkFuel(fuel, cappedElapsedMs(sharedStart, now));
  fuel = shared.endFuel;
  burned += shared.burned;
  damage += idleDamageForSegments(
    shared.segments,
    jobMult,
    overdriveHoursAt(sharedStart, overdriveUntil),
  );

  return { fuel, burned, damage: Math.floor(damage) };
}
