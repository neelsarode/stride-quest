// =============================================================================
// atlasText — presentational glyph normaliser for the STR-64 pixel-font atlas.
// =============================================================================
// The baked FONT (assets/ui-kit.js → src/ui/theme.ts FONT_METRICS) carries ONLY:
//   A–Z  0–9  space  . , ! - + / : % ?      (no lowercase, no apostrophe, no
//   ×  ·  —  −).  <PixelText> already toUpperCase()s every label because the FONT
//   has no lowercase; this maps the REMAINING typographic glyphs the semantic
//   feedback copy happens to use onto the same atlas, the same way.
//
// This is a RENDERING transform, not a copy edit: the wording is byte-for-byte
// the words the treatments layer emits — only glyphs the pixel font cannot draw
// are folded to their atlas equivalents, per the conventions already shipped in
// the game screen:
//   ×            → X       (documented in BossPlate.tsx: "multipliers render as X")
//   — – · • −    → -       (matches TopBar's " - " separator; the atlas dash/minus)
//   …            → ...     (three atlas periods)
//   ' ’ ‘ " “ ”  → (dropped) — the universal pixel-font convention for contractions
//                            (DIDN'T → DIDNT); the FONT has no quote/apostrophe glyph.
// Anything still outside the atlas falls through to <PixelText>'s own "?" glyph.
//
// Owned by the feedback re-skin (STR-70). Used ONLY by the overlay's
// presentational components (Banner / Toast / FloatingNumber); the event API,
// treatments copy strings, and timings are untouched.
export function atlasText(s: string): string {
  return s
    .replace(/×/g, "X")
    .replace(/[—–·•−]/g, "-")
    .replace(/…/g, "...")
    .replace(/['’‘"“”]/g, "");
}
