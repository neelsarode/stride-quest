#!/usr/bin/env node
/**
 * pack-ui.mjs — STR-63 (M2.75 Game Screen, full-screen pixel HUD), pipeline step.
 *
 * Decodes ui-export.json (baked by ui-export-rig.html from assets/ui-kit.js) into
 * the React Native app's runtime UI asset set:
 *   src/ui/assets/<name>.png        baked chrome at @1x, plus @2x / @3x siblings
 *   src/ui/uiMap.ts                 static require() map + SpriteKey union type
 *   src/ui/theme.ts                 palette hexes, fills, portrait crops, state
 *                                   colours, scrim, font metrics, slice + ring
 *                                   metadata, art dims — everything the runtime
 *                                   primitives need that is NOT a PNG
 *
 * WHY a browser + a script (spec §2/§3, same philosophy as fx-anchors +
 * pack-sprites): RN has no canvas, but ui-kit.js is fully deterministic, so the
 * HTML rig renders every component once and this script packs the result. The
 * rig is the ONLY renderer; ui-kit.js is the ONLY source of truth. A kit change
 * = rerun the rig + `npm run pack-ui`, then diff the PNGs.
 *
 * INPUT (source of truth — never modified):
 *   ui-export.json  { files:{ "<name>.png": dataURL(@1x) }, dims, slices, cats,
 *                     theme } — produced by ui-export-rig.html (DOWNLOAD button,
 *                     or a headless evaluate of window.__EXPORTS). See that file
 *                     for the exact headless recipe.
 *
 * SCALE (spec §3): the JSON carries ONLY @1x (2 canvas px per art px, i.e. 1 art
 * px = 2dp). This script derives @2x (×2) and @3x (×3) by INTEGER nearest-
 * neighbour upscale of the @1x raw pixels — done here in JS (not sharp resize)
 * so the result is provably exact — then re-encodes every scale through sharp
 * (deterministic PNG, no timestamps). RN's asset suffixes then give every device
 * integer-exact pixels with ZERO runtime scaling.
 *
 * LOSSLESSNESS (hard requirement, pack-sprites tradition): after encoding each
 * PNG it is decoded again and byte-compared to the raw pixels it was built from;
 * any mismatch fails the build. Two runs on the same ui-export.json produce
 * byte-identical files (sharp is deterministic) — the STR-63 idempotency gate.
 *
 * NEVER baked (spec rule 5): text, costs, numbers, names — those are runtime
 * <PixelText>. Wells bake dark; fills overlay inside them at runtime. This
 * script therefore only ever writes FRAMES / FACES / GLYPHS.
 *
 * VERIFICATION printed on every run:
 *   - per-category expected vs actual base-component counts (fails on mismatch)
 *   - total files written vs expected (base × 3 scales)
 *   - total payload size; all round-trips proven pixel-exact
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IN_JSON = path.join(ROOT, "ui-export.json");
const OUT_DIR = path.join(ROOT, "src", "ui");
const OUT_ASSETS = path.join(OUT_DIR, "assets");
const OUT_UIMAP = path.join(OUT_DIR, "uiMap.ts");
const OUT_THEME = path.join(OUT_DIR, "theme.ts");

const GEN_HEADER =
  "// GENERATED — regen via ui-export-rig.html + npm run pack-ui, never hand-edit.\n" +
  "// (scripts/pack-ui.mjs decodes ui-export.json. Single source of truth is the\n" +
  "// procedural kit assets/ui-kit.js — a kit change means: rerun the rig, then\n" +
  "// `npm run pack-ui`, then diff. Same house rule as fx-anchors / pack-sprites.)\n";

/**
 * The M2.75 inventory, pinned (spec §5/§6). A count drift (a component added to
 * or removed from ui-export-rig.html's INVENTORY without updating this) fails
 * the run — the same guard pack-sprites keeps against the MANIFEST.
 * Counts are BASE components (each ships @1x + @2x + @3x). 3-slice families
 * contribute 3 bases (left/mid/right or top/mid/bottom).
 */
const EXPECTED = {
  bar: 6, //         bar_full + bar_slim, each a 3-slice (frames for boss/xp/fuel)
  button: 4, //      deploy 56x37, nav 18x18, collect 24x24, close 15x14 (fixed faces)
  buttonface: 12, // btn_gold + btn_silver + plate_silver + btn_super_gold, each a 3-slice (dynamic labels)
  banner: 3, //      banner_gold 3-slice (JOB UP! etc.)
  chip: 9, //        chip green/red/gold, each a 3-slice
  toast: 3, //       toast_silver 3-slice
  tooltip: 4, //     tooltip_silver 3-slice + tooltip_pointer sprite
  badge: 1, //       badge roundel (job number overlays)
  portrait: 4, //    18 / 20 / 22 / 30 frames
  dot: 4, //         battling / winded / resting / rally
  beacon: 3, //      rally ring dim / mid / bright
  ring: 1, //        steps ring, 33-frame strip
  popover: 5, //     popover 3-slice (top/mid/bottom) + top & left arrows
  modal: 3, //       modal 3-slice (top/mid/bottom)
  invite: 1, //      invite plus (frame reuses portrait_22)
  seg: 1, //         8-cell segment frame
  icon: 11, //       heart/gem/coin/star/shield/swords/banner/arrows ×4
  font: 2, //        font_white + font_white_outlined atlases
};
const SCALES = [1, 2, 3]; // @1x, @2x, @3x → suffixes "", "@2x", "@3x"

/* ------------------------------------------------------------------ *
 * Load + parse ui-export.json                                         *
 * ------------------------------------------------------------------ */
if (!fs.existsSync(IN_JSON)) {
  console.error(
    `pack-ui: ${path.relative(ROOT, IN_JSON)} not found.\n` +
      `Produce it first: serve the repo (python3 -m http.server 8899), open\n` +
      `http://localhost:8899/ui-export-rig.html, click DOWNLOAD (or dump\n` +
      `window.__EXPORTS headlessly), then re-run \`npm run pack-ui\`.`
  );
  process.exit(1);
}
let payload = JSON.parse(fs.readFileSync(IN_JSON, "utf8"));
if (typeof payload === "string") payload = JSON.parse(payload); // tolerate a double-encoded dump
const { files, dims, slices, cats, theme } = payload;
if (!files || !dims || !slices || !cats || !theme) {
  throw new Error("ui-export.json is missing one of: files, dims, slices, cats, theme");
}

/* ------------------------------------------------------------------ *
 * Helpers                                                             *
 * ------------------------------------------------------------------ */

/** Decode a base64 PNG dataURL to raw RGBA pixels + dimensions. */
async function dataUrlToRaw(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const png = Buffer.from(b64, "base64");
  const { data, info } = await sharp(png)
    .ensureAlpha() // guarantee 4 channels so every scale round-trips identically
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

/**
 * Integer nearest-neighbour upscale of raw pixels by factor k. Pure Buffer.copy
 * — every source pixel becomes an exact k×k block, no resampling, no smoothing.
 * (Doing this in JS rather than sharp.resize keeps the pixels provably exact and
 * independent of sharp's kernel implementation.)
 */
function nearestUpscale({ data, w, h, ch }, k) {
  if (k === 1) return { data, w, h, ch };
  const W = w * k, H = h * k;
  const out = Buffer.allocUnsafe(W * H * ch);
  for (let y = 0; y < H; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < W; x++) {
      const sx = (x / k) | 0;
      const src = (sy * w + sx) * ch;
      data.copy(out, (y * W + x) * ch, src, src + ch);
    }
  }
  return { data: out, w: W, h: H, ch };
}

/** Encode raw pixels to a deterministic PNG, then prove the round-trip is exact. */
async function encodeVerified(raw, label) {
  const png = await sharp(raw.data, { raw: { width: raw.w, height: raw.h, channels: raw.ch } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const back = await sharp(png).ensureAlpha().raw().toBuffer();
  if (Buffer.compare(back, raw.data) !== 0) {
    throw new Error(`${label}: PNG round-trip is not pixel-exact — aborting`);
  }
  return png;
}

/* ------------------------------------------------------------------ *
 * 1. Write every PNG (@1x from JSON; @2x/@3x derived)                 *
 * ------------------------------------------------------------------ */
fs.mkdirSync(OUT_ASSETS, { recursive: true });

const baseNames = Object.keys(files)
  .map((f) => f.replace(/\.png$/, ""))
  .sort();

let totalBytes = 0;
const writtenFiles = new Set();
for (const name of baseNames) {
  const raw1 = await dataUrlToRaw(files[name + ".png"]);
  // Cross-check the @1x pixels against the recorded art dims × dpPerArt.
  const dp = payload.meta.dpPerArt;
  const expW = dims[name].w * dp, expH = dims[name].h * dp;
  if (raw1.w !== expW || raw1.h !== expH) {
    throw new Error(
      `${name}: @1x is ${raw1.w}x${raw1.h}, expected ${expW}x${expH} ` +
        `(art ${dims[name].w}x${dims[name].h} × dpPerArt ${dp})`
    );
  }
  for (const s of SCALES) {
    const raw = nearestUpscale(raw1, s);
    const png = await encodeVerified(raw, `${name}@${s}x`);
    const file = `${name}${s > 1 ? "@" + s + "x" : ""}.png`;
    fs.writeFileSync(path.join(OUT_ASSETS, file), png);
    writtenFiles.add(file);
    totalBytes += png.length;
  }
}

// Remove stale PNGs from earlier runs (renamed/removed components) so the assets
// dir is EXACTLY the current export — a requirement for idempotency.
for (const f of fs.readdirSync(OUT_ASSETS)) {
  if (f.endsWith(".png") && !writtenFiles.has(f)) {
    fs.rmSync(path.join(OUT_ASSETS, f));
    console.log(`removed stale: ${f}`);
  }
}

/* ------------------------------------------------------------------ *
 * 2. Emit src/ui/uiMap.ts — static require() map (Metro can't do      *
 *    dynamic require paths; RN auto-resolves @2x/@3x from the base).   *
 * ------------------------------------------------------------------ */
const requireLines = baseNames.map((n) => `  "${n}": require("./assets/${n}.png"),`);
fs.writeFileSync(
  OUT_UIMAP,
  `${GEN_HEADER}//
// Static require() map for every baked HUD component. RN's asset resolver picks
// the @2x / @3x sibling automatically, so each entry points at the @1x file.
// Frame/face art dims (art px) live in ./theme.ts UI_DIMS under the same keys;
// 3-slice assembly + ring metadata live in ./theme.ts UI_SLICES.

export const UI_ASSETS = {
${requireLines.join("\n")}
} as const;

/** Every baked HUD sprite key — 3-slice parts are "<name>_left|_mid|_right"
 *  (horizontal) or "<name>_top|_mid|_bottom" (vertical); see UI_SLICES. */
export type UiAssetKey = keyof typeof UI_ASSETS;

export default UI_ASSETS;
`
);

/* ------------------------------------------------------------------ *
 * 3. Emit src/ui/theme.ts — palette / fills / crops / metrics / slices *
 * ------------------------------------------------------------------ */
const j = (v) => JSON.stringify(v, null, 2);
fs.writeFileSync(
  OUT_THEME,
  `${GEN_HEADER}//
// Everything the runtime primitives (src/ui/*.tsx, built in STR-64) need that is
// NOT a PNG: palette hexes for plain View fills, bar-fill families, well insets,
// state colours, the modal scrim, full-body portrait crops, bitmap-font metrics,
// 3-slice/ring assembly metadata, and art dims. All baked for S8 CELESTIAL
// SILVER (spec §3/§10-Q3). Colour meaning: wells bake dark into the PNG; these
// fills overlay INSIDE them at runtime (spec §5).

/** Hexes for plain View fills / borders that pair with the baked chrome. */
export const UI_PALETTE = ${j(theme.palette)} as const;

/** Bar-fill families (light top / mid body / dark bottom) + ghost & flash.
 *  Which bar uses which family is a zone decision (boss=gold, fuel/xp=sky, …). */
export const UI_FILLS = ${j(theme.fills)} as const;

/** Inset a fill View into a baked well: x/y offset, dw/dh shrink, corner radius
 *  (art px). slim = 3px frame (xp/fuel); full = 6px frame (boss/plate). */
export const WELL_INSETS = ${j(theme.wellInsets)} as const;

/** Hero fuel-state dot / label colours (resting is dignified sky, never red;
 *  a RESTING teammate's rally call-to-action is the separate red 'rally'). */
export const STATE_COLORS = ${j(theme.stateColors)} as const;

/** Dim behind popovers / sheets / modals (tap-to-close surface). */
export const SCRIM = ${j(theme.scrim)} as const;

/** Full-body sprite crops (source px) so a character fills a portrait well —
 *  ported 1:1 from ui-kit's PORTRAIT_CROPS (sprites carry transparent padding;
 *  never assume the character fills the file). Keyed by class + warrior_j2. */
export const PORTRAIT_CROPS: Record<string, { x: number; y: number; s: number }> =
  ${j(theme.portraitCrops)};

/** Bitmap-font metrics for <PixelText> (STR-64). Two atlases:
 *  - white:    5px tall, glyph cell = {x, w} px, advance = w + letterSpacing.
 *  - outlined: 7px tall, glyph cell = {x, w=inkW+2*pad} px with the ink inset by
 *    \`pad\`; render the cell at (cursor - pad) so the baked 1px outline overlaps
 *    the letter-spacing gap → identical visual advance (inkW + letterSpacing). */
export interface FontAtlasMetrics {
  glyphs: Record<string, { x: number; w: number }>;
  letterSpacing: number;
  lineHeight: number;
  pad: number;
}
export const FONT_METRICS: { white: FontAtlasMetrics; outlined: FontAtlasMetrics } =
  ${j(theme.fontMetrics)};

/** 3-slice / ring assembly metadata.
 *  - axis 'h': stretch \`<name>_mid\` (1 art px wide) between \`_left\`/\`_right\`
 *    caps (capW art px each); frame height \`h\`.
 *  - axis 'v': stretch \`<name>_mid\` (1 art px tall) between \`_top\`/\`_bottom\`
 *    caps (capH art px each); fixed frame width \`w\`.
 *  - kind 'ringstrip': \`frames\` cells of \`frameW\`×\`frameH\`, pick cell i for
 *    fill fraction i/(frames-1) (Sprite.tsx strip technique).
 *  Speckles/glint live on the caps only — the stretch mid is uniform (spec §5). */
export const UI_SLICES = ${j(slices)} as const;

/** Art-pixel dimensions of every baked component (before the ×2/×4/×6 device
 *  scale). Slice parts carry their own dims; a mid is 1px on its stretch axis. */
export const UI_DIMS = ${j(dims)} as const;
`
);

/* ------------------------------------------------------------------ *
 * 4. Verify + summary (fails the run on any drift)                    *
 * ------------------------------------------------------------------ */
let failed = false;

const actual = {};
for (const name of baseNames) {
  const cat = cats[name] || "?";
  actual[cat] = (actual[cat] || 0) + 1;
}

console.log("\ncategory     | expected | actual | status");
console.log("-------------+----------+--------+-------");
const allCats = [...new Set([...Object.keys(EXPECTED), ...Object.keys(actual)])].sort();
for (const cat of allCats) {
  const exp = EXPECTED[cat] ?? "—";
  const act = actual[cat] ?? 0;
  const ok = exp === act;
  if (!ok) failed = true;
  console.log(
    `${cat.padEnd(12)} | ${String(exp).padStart(8)} | ${String(act).padStart(6)} | ${ok ? "OK" : "MISMATCH"}`
  );
}
const expBase = Object.values(EXPECTED).reduce((s, n) => s + n, 0);
console.log(
  `${"TOTAL(base)".padEnd(12)} | ${String(expBase).padStart(8)} | ${String(baseNames.length).padStart(6)} | ${
    expBase === baseNames.length ? "OK" : "MISMATCH"
  }`
);
if (expBase !== baseNames.length) failed = true;

const expFiles = expBase * SCALES.length;
console.log(
  `${"TOTAL(files)".padEnd(12)} | ${String(expFiles).padStart(8)} | ${String(writtenFiles.size).padStart(6)} | ${
    expFiles === writtenFiles.size ? "OK" : "MISMATCH"
  }`
);
if (expFiles !== writtenFiles.size) failed = true;

console.log(
  `\n${writtenFiles.size} PNGs (${baseNames.length} components × ${SCALES.length} scales), ` +
    `${(totalBytes / 1024).toFixed(1)} KB total (+ uiMap.ts, theme.ts). ` +
    `All round-trips pixel-exact.`
);

if (failed) {
  console.error("\npack-ui: VERIFICATION FAILED — see MISMATCH lines above.");
  process.exit(1);
}
console.log("pack-ui: all checks passed.");
