// =============================================================================
// Invite-code math — PURE functions only (no Convex imports), like fuelMath.
// =============================================================================
// Guild invite codes (M2.5 onboarding, STR-44) are 6 characters from a
// deliberately shrunken alphabet (gameConfig.GUILD) — friends read these aloud
// and type them by hand, so the look-alike characters (0/O, 1/I/L) don't exist
// in ANY valid code. Normalization is therefore purely cosmetic (case, spacing);
// we never have to guess whether a typed "0" meant "O".
//
// Uniqueness is NOT this module's job: the DB owns that (generate →
// by_invite_code lookup → retry, inside one serializable Convex mutation in
// guild.ts). This module only makes candidate codes and cleans up typed input,
// so it stays testable with zero mocks.
//
// NOTE the ".ts" import extension: it lets Node's type-stripping run this file
// directly in tests/inviteCode.test.mjs (extensionless imports don't resolve in
// Node) — same trick as fuelMath.ts.
// =============================================================================
import { GUILD } from "./gameConfig.ts";

/** One candidate invite code (uniqueness is checked against the DB by the
 *  caller). `random` is injectable so tests are deterministic; it must return
 *  a number in [0, 1) like Math.random — a value of exactly 1 is clamped to
 *  the last alphabet character rather than reading past the end. */
export function generateInviteCode(
  random: () => number = Math.random,
): string {
  const alphabet = GUILD.inviteCodeAlphabet;
  let code = "";
  for (let i = 0; i < GUILD.inviteCodeLength; i++) {
    const idx = Math.min(
      Math.floor(random() * alphabet.length),
      alphabet.length - 1,
    );
    code += alphabet[idx];
  }
  return code;
}

/** Clean up hand-typed input: uppercase, and drop the separators people
 *  naturally add when reading a code aloud (spaces, dashes). The six-box entry
 *  UI auto-uppercases too — this makes the server forgiving even when the
 *  client isn't. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

/** True iff `code` (already normalized) could have been issued: exactly
 *  inviteCodeLength characters, all from the alphabet. Look-alikes (0/O/1/I/L)
 *  fail here by construction, which lets joinGuildByCode short-circuit to
 *  not_found without a DB read. */
export function isValidInviteCode(code: string): boolean {
  if (code.length !== GUILD.inviteCodeLength) return false;
  for (const ch of code) {
    if (!GUILD.inviteCodeAlphabet.includes(ch)) return false;
  }
  return true;
}
