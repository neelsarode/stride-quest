// =============================================================================
// Invite-code tests — pure functions, no Convex. Run with:
//   node --experimental-strip-types --test tests/
// (the flag lets Node load the .ts modules directly; they use erasable-types-
// only syntax). Expected values below are hand-derived from the tunables:
//   length 6 · alphabet "23456789ABCDEFGHJKMNPQRSTUVWXYZ" (31 chars, no 0/O/1/I/L)
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  generateInviteCode,
  normalizeInviteCode,
  isValidInviteCode,
} from "../convex/inviteCode.ts";
import { GUILD } from "../convex/gameConfig.ts";

// --- the alphabet itself is the anti-typo feature ------------------------------

test("alphabet drops every look-alike character (0/O, 1/I/L)", () => {
  for (const ch of "0O1IL") {
    assert.ok(
      !GUILD.inviteCodeAlphabet.includes(ch),
      `look-alike "${ch}" must not be issuable`,
    );
  }
  // 9-2+1 digits + 26 letters − O/I/L = 8 + 23 = 31 characters.
  assert.equal(GUILD.inviteCodeAlphabet.length, 31);
  // No duplicates — every character is a distinct symbol.
  assert.equal(new Set(GUILD.inviteCodeAlphabet).size, 31);
});

// --- generation -----------------------------------------------------------------

test("generated codes have the configured length and only alphabet characters", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateInviteCode();
    assert.equal(code.length, GUILD.inviteCodeLength);
    for (const ch of code) {
      assert.ok(GUILD.inviteCodeAlphabet.includes(ch), `bad char "${ch}" in ${code}`);
    }
    // Round trip: everything we issue passes our own format check.
    assert.ok(isValidInviteCode(code));
  }
});

test("generation is deterministic under an injected random source", () => {
  // random() = 0 → always index 0 → first alphabet char ("2") six times.
  assert.equal(generateInviteCode(() => 0), "222222");
  // random() just under 1 → always the last char ("Z") six times.
  assert.equal(generateInviteCode(() => 0.999999), "ZZZZZZ");
  // A random source that (illegally) returns exactly 1 is clamped to the last
  // character instead of producing "undefined" — defensive, tested on purpose.
  assert.equal(generateInviteCode(() => 1), "ZZZZZZ");
  // A cycling source picks predictable indexes: 0 → "2", 0.5 → floor(15.5)=15
  // → alphabet[15] ("H": 8 digits then A..H is index 8..15).
  let flip = false;
  const cycling = () => ((flip = !flip) ? 0 : 0.5);
  assert.equal(generateInviteCode(cycling), "2H2H2H");
});

// --- normalization (what hand-typed input goes through before lookup) ----------

test("normalize uppercases and strips spaces/dashes", () => {
  assert.equal(normalizeInviteCode("abc234"), "ABC234");
  assert.equal(normalizeInviteCode("  AB-C2 34  "), "ABC234");
  assert.equal(normalizeInviteCode("a b c 2 3 4"), "ABC234");
  // Already-clean codes pass through untouched.
  assert.equal(normalizeInviteCode("QWERTY"), "QWERTY");
});

// --- format validation ----------------------------------------------------------

test("format check: correct length + alphabet membership, nothing else", () => {
  assert.ok(isValidInviteCode("ABC234"));
  assert.ok(isValidInviteCode("ZZZZZZ"));
  // Wrong length.
  assert.ok(!isValidInviteCode(""));
  assert.ok(!isValidInviteCode("ABC23"));
  assert.ok(!isValidInviteCode("ABC2345"));
  // Look-alikes can never appear in an issued code.
  assert.ok(!isValidInviteCode("ABC230")); // 0
  assert.ok(!isValidInviteCode("ABCO34")); // O
  assert.ok(!isValidInviteCode("ABC134")); // 1
  assert.ok(!isValidInviteCode("ABCI34")); // I
  assert.ok(!isValidInviteCode("ABCL34")); // L
  // Lowercase fails raw — callers must normalize first (join/preview both do).
  assert.ok(!isValidInviteCode("abc234"));
  assert.ok(isValidInviteCode(normalizeInviteCode("abc234")));
});
