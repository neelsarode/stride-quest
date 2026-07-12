// Client-side date helpers. We compute the player's LOCAL day/week here and pass
// the strings to Convex, so the "today" boundary and the Monday weekly reset
// match the player's own timezone (not the server's).

/** Format a Date as a local "YYYY-MM-DD" (no UTC shift). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's local date string. */
export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

/** The Monday…Sunday range containing `now`, as local date strings.
 *  Jobs reset every Monday, so the week starts on Monday. */
export function weekRange(now: Date = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // JS: Sunday=0..Saturday=6. Shift so Monday=0.
  const mondayOffset = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { weekStart: toISODate(monday), weekEnd: toISODate(sunday) };
}
