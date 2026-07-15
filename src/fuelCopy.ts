// =============================================================================
// Fuel-time copy (STR-13). The tank speaks in REAL fight time (hoursToEmpty
// already stretches the winded tail). One shared home so the classic dashboard
// card and the game-screen FuelGauge read byte-identical strings — consolidated
// in STR-71 out of the duplicate that had been copied into FuelGauge.tsx.
//
//   fmtFightShort — compact gauge form   ("21h" / "9.5h" / "40m")
//   fmtFightTime  — sentence form        ("21 hours" / "9.5 hours" / "40 minutes")
//   fmtMoreTime   — "…more" sentence form ("21 more hours" / "40 more minutes")
//
// Pure functions, no imports — safe for any screen/zone to import.
// =============================================================================

export function fmtFightShort(hours: number): string {
  if (hours >= 10) return `${Math.round(hours)}h`;
  if (hours >= 1) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.max(1, Math.round(hours * 60))}m`;
}

export function fmtFightTime(hours: number): string {
  if (hours >= 10) return `${Math.round(hours)} hours`;
  if (hours >= 1) {
    const h = Math.round(hours * 10) / 10;
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  const mins = Math.max(1, Math.round(hours * 60));
  return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
}

export function fmtMoreTime(hours: number): string {
  if (hours >= 10) return `${Math.round(hours)} more hours`;
  if (hours >= 1) {
    const h = Math.round(hours * 10) / 10;
    return `${h} more ${h === 1 ? "hour" : "hours"}`;
  }
  const mins = Math.max(1, Math.round(hours * 60));
  return `${mins} more ${mins === 1 ? "minute" : "minutes"}`;
}
