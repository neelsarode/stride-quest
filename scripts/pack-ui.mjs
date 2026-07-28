#!/usr/bin/env node
/**
 * pack-ui.mjs — the packing half of the UI bake pipeline (Approach 2: per-class).
 *
 * capture-ui-export.mjs drives the rig to dump every class kit's chrome to
 * ui-export-all.json; this script decodes it into the RN app's runtime asset set:
 *   src/ui/assets/<name>__<hash8>.png   baked chrome @1x (+ @2x/@3x), CONTENT-
 *                                       DEDUPED into a shared pool — class-
 *                                       invariant art (fonts, gold ring, chips,
 *                                       icons, beacons, dots) collapses to one
 *                                       file; only material-varying frames/wells/
 *                                       faces multiply. A class points at pool
 *                                       entries by key.
 *   src/ui/uiMap.ts   UI_POOL (poolKey → require) + UI_MAPS (class → name →
 *                     poolKey) + uiAsset(cls,name) resolver + warrior-default
 *                     UI_ASSETS (back-compat until the primitives read the class
 *                     context) + SpriteKey / ClassKey unions.
 *   src/ui/theme.ts   UI_THEMES (class → palette/fills/stateColors) + shared
 *                     geometry (slices/dims/insets/scrim/crops/font) + warrior-
 *                     default statics (UI_PALETTE/UI_FILLS/STATE_COLORS).
 *
 * WHY a browser + a script (unchanged philosophy): RN has no canvas, ui-kit.js is
 * deterministic, so the HTML rig renders and this script packs. A kit change =
 * rerun `node scripts/capture-ui-export.mjs && npm run pack-ui`, then diff PNGs.
 *
 * INPUT (source of truth — never hand-edited):
 *   ui-export-all.json  { <class>: { files:{"<name>.png":dataURL(@1x)}, dims,
 *                         slices, cats, theme } }  — one payload per class kit.
 *   (Falls back to wrapping a legacy single-kit ui-export.json as {warrior}.)
 *
 * SCALE / LOSSLESSNESS / "never bake text": all exactly as before — @1x from the
 * JSON, @2x(×2)/@3x(×3) by integer nearest-neighbour, every PNG round-trip byte-
 * verified, only FRAMES / FACES / GLYPHS ever written.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IN_ALL = path.join(ROOT, "ui-export-all.json");
const IN_SINGLE = path.join(ROOT, "ui-export.json"); // legacy single-kit fallback
const OUT_DIR = path.join(ROOT, "src", "ui");
const OUT_ASSETS = path.join(OUT_DIR, "assets");
const OUT_UIMAP = path.join(OUT_DIR, "uiMap.ts");
const OUT_THEME = path.join(OUT_DIR, "theme.ts");

const GEN_HEADER =
  "// GENERATED — regen via `node scripts/capture-ui-export.mjs && npm run pack-ui`,\n" +
  "// never hand-edit. Single source of truth is the procedural kit assets/ui-kit.js\n" +
  "// + its per-class KITS in ui-export-rig.html. A kit change means: recapture,\n" +
  "// repack, diff. Same house rule as fx-anchors / pack-sprites.\n";

/** BASE components PER KIT (each ships @1x+@2x+@3x). A drift fails the run. */
const EXPECTED = {
  bar: 6, button: 4, buttonface: 21, banner: 3, chip: 9, toast: 3, tooltip: 4,
  badge: 1, portrait: 4, dot: 4, beacon: 3, ring: 1, popover: 5, modal: 3,
  invite: 1, seg: 1, icon: 11, font: 2,
};
const SCALES = [1, 2, 3];
const DEFAULT_CLASS = "warrior"; // KITS[0] — the shipped default / back-compat base

/* ------------------------------------------------------------------ *
 * Load ui-export-all.json (or wrap a legacy single-kit export)        *
 * ------------------------------------------------------------------ */
let kits;
if (fs.existsSync(IN_ALL)) {
  kits = JSON.parse(fs.readFileSync(IN_ALL, "utf8"));
  if (typeof kits === "string") kits = JSON.parse(kits);
} else if (fs.existsSync(IN_SINGLE)) {
  let one = JSON.parse(fs.readFileSync(IN_SINGLE, "utf8"));
  if (typeof one === "string") one = JSON.parse(one);
  kits = { [DEFAULT_CLASS]: one };
  console.log("pack-ui: no ui-export-all.json — wrapping legacy ui-export.json as {warrior}.");
} else {
  console.error(
    "pack-ui: no input. Produce it first:\n" +
      "  node scripts/capture-ui-export.mjs   (writes ui-export-all.json)\n" +
      "then re-run `npm run pack-ui`."
  );
  process.exit(1);
}

const classKeys = Object.keys(kits);
if (!classKeys.includes(DEFAULT_CLASS)) {
  throw new Error(`ui-export-all.json is missing the '${DEFAULT_CLASS}' kit (the default).`);
}
// Put the default first so it owns the earliest pool entries (stable diffs).
classKeys.sort((a, b) => (a === DEFAULT_CLASS ? -1 : b === DEFAULT_CLASS ? 1 : a.localeCompare(b)));

for (const c of classKeys) {
  const p = kits[c];
  if (!p.files || !p.dims || !p.slices || !p.cats || !p.theme) {
    throw new Error(`kit '${c}' is missing one of: files, dims, slices, cats, theme`);
  }
}

// Every kit must expose the SAME component name set + geometry (only colour
// differs). Assert against the default so a drift is caught, not silently packed.
const baseNames = Object.keys(kits[DEFAULT_CLASS].files).map((f) => f.replace(/\.png$/, "")).sort();
const nameSet = new Set(baseNames);
for (const c of classKeys) {
  const names = Object.keys(kits[c].files).map((f) => f.replace(/\.png$/, "")).sort();
  if (names.length !== baseNames.length || names.some((n) => !nameSet.has(n))) {
    throw new Error(`kit '${c}' has a different component set than '${DEFAULT_CLASS}'`);
  }
  if (JSON.stringify(kits[c].dims) !== JSON.stringify(kits[DEFAULT_CLASS].dims)) {
    throw new Error(`kit '${c}' dims differ from '${DEFAULT_CLASS}' (geometry must be class-invariant)`);
  }
  if (JSON.stringify(kits[c].slices) !== JSON.stringify(kits[DEFAULT_CLASS].slices)) {
    throw new Error(`kit '${c}' slices differ from '${DEFAULT_CLASS}' (geometry must be class-invariant)`);
  }
}

/* ------------------------------------------------------------------ *
 * Raw-pixel helpers (unchanged)                                       *
 * ------------------------------------------------------------------ */
async function dataUrlToRaw(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const png = Buffer.from(b64, "base64");
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
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
async function encodeVerified(raw, label) {
  const png = await sharp(raw.data, { raw: { width: raw.w, height: raw.h, channels: raw.ch } })
    .png({ compressionLevel: 9 }).toBuffer();
  const back = await sharp(png).ensureAlpha().raw().toBuffer();
  if (Buffer.compare(back, raw.data) !== 0) throw new Error(`${label}: PNG round-trip not pixel-exact — aborting`);
  return png;
}

/* ------------------------------------------------------------------ *
 * 1. Content-dedupe every (class,name) @1x into a shared pool         *
 * ------------------------------------------------------------------ */
fs.mkdirSync(OUT_ASSETS, { recursive: true });

// pool: poolKey → { raw1, name }.  maps: class → name → poolKey.
const pool = new Map();
const maps = {};
const dp = kits[DEFAULT_CLASS].meta.dpPerArt;

for (const c of classKeys) {
  maps[c] = {};
  const { files, dims } = kits[c];
  for (const name of baseNames) {
    const raw1 = await dataUrlToRaw(files[name + ".png"]);
    const expW = dims[name].w * dp, expH = dims[name].h * dp;
    if (raw1.w !== expW || raw1.h !== expH) {
      throw new Error(`${c}/${name}: @1x ${raw1.w}x${raw1.h}, expected ${expW}x${expH}`);
    }
    const hash8 = crypto.createHash("sha256").update(raw1.data).digest("hex").slice(0, 8);
    const poolKey = `${name}__${hash8}`;
    const existing = pool.get(poolKey);
    if (existing) {
      // Same key ⇒ must be byte-identical (else an 8-hex collision — widen it).
      if (Buffer.compare(existing.raw1.data, raw1.data) !== 0) {
        throw new Error(`hash8 collision on ${poolKey} — widen the pool hash length`);
      }
    } else {
      pool.set(poolKey, { raw1, name });
    }
    maps[c][name] = poolKey;
  }
}

// Write each unique pool entry at @1x/@2x/@3x, byte-verified.
let totalBytes = 0;
const writtenFiles = new Set();
for (const [poolKey, { raw1 }] of pool) {
  for (const s of SCALES) {
    const raw = nearestUpscale(raw1, s);
    const png = await encodeVerified(raw, `${poolKey}@${s}x`);
    const file = `${poolKey}${s > 1 ? "@" + s + "x" : ""}.png`;
    fs.writeFileSync(path.join(OUT_ASSETS, file), png);
    writtenFiles.add(file);
    totalBytes += png.length;
  }
}
// Remove stale PNGs (renamed/retinted components from an earlier run).
for (const f of fs.readdirSync(OUT_ASSETS)) {
  if (f.endsWith(".png") && !writtenFiles.has(f)) {
    fs.rmSync(path.join(OUT_ASSETS, f));
    console.log(`removed stale: ${f}`);
  }
}

/* ------------------------------------------------------------------ *
 * 2. Emit src/ui/uiMap.ts                                             *
 * ------------------------------------------------------------------ */
const poolKeys = [...pool.keys()].sort();
const poolLines = poolKeys.map((k) => `  "${k}": require("./assets/${k}.png"),`);
const mapLines = classKeys
  .map((c) => `  ${c}: {\n${baseNames.map((n) => `    "${n}": "${maps[c][n]}",`).join("\n")}\n  },`)
  .join("\n");
// Warrior-default flat map — every current consumer (UI_ASSETS[name]) keeps
// working, rendering the default kit, until Phase 3 routes them through uiAsset().
const warriorAssetLines = baseNames.map((n) => `  "${n}": UI_POOL["${maps[DEFAULT_CLASS][n]}"],`);

fs.writeFileSync(
  OUT_UIMAP,
  `${GEN_HEADER}//
// Per-class baked HUD chrome, content-deduped. UI_POOL holds every UNIQUE PNG
// (class-invariant art appears once); UI_MAPS routes each class's component name
// to its pool entry. RN's asset resolver picks the @2x/@3x sibling automatically.

/* eslint-disable */
export const UI_POOL = {
${poolLines.join("\n")}
} as const;
export type PoolKey = keyof typeof UI_POOL;

/** class → component name → pool key. Every class shares the SAME name set. */
export const UI_MAPS = {
${mapLines}
} as const;

/** Themeable class keys (the dev cycler + player.classKey index these). */
export type ClassKey = keyof typeof UI_MAPS;
/** Every baked HUD sprite key (3-slice parts are "<name>_left|_mid|_right", …). */
export type UiAssetKey = keyof typeof UI_MAPS["${DEFAULT_CLASS}"];

/** Resolve a class + component name to its require()'d asset (Phase 3 primitives
 *  call this via the UI theme context; falls back to the default class). */
export function uiAsset(cls: ClassKey | undefined, name: UiAssetKey) {
  const m = (cls && UI_MAPS[cls]) || UI_MAPS.${DEFAULT_CLASS};
  return UI_POOL[m[name] as PoolKey];
}

/** Back-compat flat map = the '${DEFAULT_CLASS}' kit. Consumers that import
 *  UI_ASSETS directly render the default until they migrate to uiAsset(). */
export const UI_ASSETS = {
${warriorAssetLines.join("\n")}
} as const;

export default UI_ASSETS;
`
);

/* ------------------------------------------------------------------ *
 * 3. Emit src/ui/theme.ts                                             *
 * ------------------------------------------------------------------ */
const def = kits[DEFAULT_CLASS].theme;
const j = (v) => JSON.stringify(v, null, 2);
// Per-class colour block (palette/fills/stateColors); geometry is shared.
const themeLines = classKeys
  .map((c) => {
    const t = kits[c].theme;
    return `  ${c}: {\n` +
      `    palette: ${j(t.palette).replace(/\n/g, "\n    ")},\n` +
      `    fills: ${j(t.fills).replace(/\n/g, "\n    ")},\n` +
      `    stateColors: ${j(t.stateColors).replace(/\n/g, "\n    ")},\n` +
      `  },`;
  })
  .join("\n");

fs.writeFileSync(
  OUT_THEME,
  `${GEN_HEADER}//
// Everything the runtime primitives need that is NOT a PNG. Colour (palette /
// fills / stateColors) is PER CLASS in UI_THEMES; geometry (slices / dims /
// insets / crops / font metrics / scrim) is class-invariant and shared. Wells
// bake dark into the PNG; these fills overlay INSIDE them at runtime.

/** Per-class colour themes. The UI theme context selects one by player class.
 *  Emitted \`as const\` so every fill family keeps its precise {light,mid,dark}
 *  shape (consumers read .light/.mid/.dark; ghost/flash are plain strings). */
export const UI_THEMES = {
${themeLines}
} as const;

/** One class's baked colour set (palette + fills + stateColors). Named to avoid
 *  clashing with theme-context's UITheme (the runtime context value). */
export type UIThemeColors = (typeof UI_THEMES)[keyof typeof UI_THEMES];

/* ---- warrior-default statics (back-compat: non-context consumers) --------- */
/** Hexes for plain View fills / borders that pair with the baked chrome. */
export const UI_PALETTE = UI_THEMES.${DEFAULT_CLASS}.palette;
/** Bar-fill families (light/mid/dark) + ghost & flash. */
export const UI_FILLS = UI_THEMES.${DEFAULT_CLASS}.fills;
/** Hero fuel-state dot/label colours (resting = dignified accent, never red). */
export const STATE_COLORS = UI_THEMES.${DEFAULT_CLASS}.stateColors;

/* ---- shared geometry (class-invariant) ------------------------------------ */
/** Inset a fill View into a baked well: x/y offset, dw/dh shrink, corner radius. */
export const WELL_INSETS = ${j(def.wellInsets)} as const;
/** Dim behind popovers / sheets / modals. */
export const SCRIM = ${j(def.scrim)} as const;
/** Full-body sprite crops (source px) so a character fills a portrait well. */
export const PORTRAIT_CROPS: Record<string, { x: number; y: number; s: number }> =
  ${j(def.portraitCrops)};

export interface FontAtlasMetrics {
  glyphs: Record<string, { x: number; w: number }>;
  letterSpacing: number;
  lineHeight: number;
  pad: number;
}
export const FONT_METRICS: { white: FontAtlasMetrics; outlined: FontAtlasMetrics } =
  ${j(def.fontMetrics)};

/** 3-slice / ring assembly metadata (class-invariant geometry). */
export const UI_SLICES = ${j(kits[DEFAULT_CLASS].slices)} as const;
/** Art-pixel dimensions of every baked component (before device scale). */
export const UI_DIMS = ${j(kits[DEFAULT_CLASS].dims)} as const;
`
);

/* ------------------------------------------------------------------ *
 * 4. Verify + summary                                                 *
 * ------------------------------------------------------------------ */
let failed = false;

// Per-kit category counts must all equal EXPECTED.
console.log("\nper-kit category counts (each kit must match EXPECTED):");
console.log("category     | expected | " + classKeys.map((c) => c.slice(0, 4).padStart(4)).join(" | "));
const allCats = [...new Set([...Object.keys(EXPECTED), ...Object.values(kits[DEFAULT_CLASS].cats)])].sort();
for (const cat of allCats) {
  const exp = EXPECTED[cat] ?? "—";
  const counts = classKeys.map((c) => {
    let n = 0;
    for (const name of baseNames) if (kits[c].cats[name] === cat) n++;
    if (n !== exp) failed = true;
    return String(n).padStart(4);
  });
  console.log(`${cat.padEnd(12)} | ${String(exp).padStart(8)} | ${counts.join(" | ")}`);
}
const expBase = Object.values(EXPECTED).reduce((s, n) => s + n, 0);
if (baseNames.length !== expBase) { failed = true; console.error(`base count ${baseNames.length} != expected ${expBase}`); }

const naive = classKeys.length * baseNames.length; // if we wrote every class separately
console.log(
  `\n${classKeys.length} kits × ${baseNames.length} components = ${naive} (name,class) pairs → ` +
    `${pool.size} unique pooled (${(100 - (pool.size / naive) * 100).toFixed(0)}% deduped).\n` +
    `${writtenFiles.size} PNGs (${pool.size} pool × ${SCALES.length} scales), ` +
    `${(totalBytes / 1024).toFixed(0)} KB total (+ uiMap.ts, theme.ts). All round-trips pixel-exact.`
);
if (pool.size * SCALES.length !== writtenFiles.size) { failed = true; console.error("file count != pool × scales"); }

if (failed) {
  console.error("\npack-ui: VERIFICATION FAILED — see lines above.");
  process.exit(1);
}
console.log("pack-ui: all checks passed.");
