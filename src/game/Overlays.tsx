// =============================================================================
// Overlays — GameScreen overlay host (slide-up sheets + popovers + modal).
// SCAFFOLD STUB (M2.75): renders nothing yet.
// ► Filled by STR-69 (party rail + right nav + popovers + sheets). This is the
// mount point for GuildSheet / StatsSheet (slide-up), the party-member popover
// (SEND RALLY), the invite popover, and the help modal. STR-69 defines the
// overlay open-state mechanism (a context/hook here) that RightNav + PartyRail
// consume — all STR-69-owned, so no cross-ticket coupling. Mounted last in
// GameScreen so it stacks above every zone.
// =============================================================================
export function Overlays() {
  // STR-69: overlay context provider + GuildSheet/StatsSheet/help modal/popovers.
  return null;
}
