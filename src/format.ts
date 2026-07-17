// =============================================================================
// Number formatting helpers.
//
// fmtCompact — compact DAMAGE formatting for tiny on-screen labels. Small hits
// stay fully grouped ("17", "8,431"); large ones abbreviate ("412K", "1.4M") so
// a scaled-up Super Attack (millions of damage — see gameConfig DAMAGE_SCALE)
// can't run off the pixel-font floating numbers / impact labels, which have no
// width guard. Magnitude only — callers prepend any sign ("−", "+").
//
// Use it for DAMAGE / HP figures on space-constrained surfaces. Do NOT use it
// for STEP counts (step space is unscaled and reads better grouped) or for the
// boss HP bar label (which wants full digits so its live per-second tick shows).
// =============================================================================

/** One decimal place, with a trailing ".0" dropped ("15M" not "15.0M"; "1.4M"). */
function trimUnit(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs < 10_000) return Math.round(n).toLocaleString("en-US");
  // < 999,500 so values that would round to "1000K" tip into "1M" instead.
  if (abs < 999_500) return `${trimUnit(n / 1_000)}K`;
  return `${trimUnit(n / 1_000_000)}M`;
}
