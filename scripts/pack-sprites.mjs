#!/usr/bin/env node
/**
 * pack-sprites.mjs — STR-17 (battle-scene port, step 1 of docs/fx-rn-port-plan.md)
 *
 * Packs every battle animation's loose frame PNGs into ONE horizontal strip PNG
 * per animation, plus a JSON manifest and two generated TS modules. This exists
 * because of plan decision D1: Metro can't bundle ~4,300 loose frames (bundle
 * bloat, per-file decode, and `require()` can't take dynamic paths), so we ship
 * strips + a static require() map instead. The loose frame dirs stay in the
 * repo as the source of truth — this script is pure derivation and is safe to
 * re-run any time (idempotent: identical inputs → byte-identical outputs).
 *
 * INPUTS (source of truth — never modified):
 *   characters/<class>/<jobN_name>/animations/<anim>/frame_*.png
 *     40 jobs × { idle(4f), attack(7–17f), special(13/17f), rest(6f) }
 *     + evolution(13f) on jobs 1–4 only (32 dirs). See characters/MANIFEST.md.
 *   assets/effects/<class>/{basic,special,impact}/frame_*.png   (8 classes × 3)
 *   characters/bosses/horse_256/ + characters/bosses/horse_crowned_256/
 *     (idle/idle_alt/hurt/attack dirs + crowned static.png)
 *   assets/fx-anchors.js + assets/fx-special-anchors.js
 *     (GENERATED anchor data from fx-test.html?scan=1 — converted, not edited)
 *
 * NOT EVERY INPUT SHIPS: the SHIPPED-ANIMS FILTER below (STR-85) decides what
 * actually gets packed — currently idle/attack/special/rest per job, the 24
 * effect strips, and boss idles only (evolution + extra boss anims stay on
 * disk as frames but add zero bundle bytes).
 *
 * OUTPUTS (all generated — regenerate via `npm run pack-sprites`):
 *   src/battle/sprites/<key with '/'→'_'>.png   one horizontal strip per anim
 *   src/battle/sprites/manifest.json            { "<key>": { frames, w, h, file } }
 *   src/battle/spriteMap.ts                     static require() map (plan D1)
 *   src/battle/anchors.ts                       typed anchor constants (plan D3)
 *
 * Manifest keys:
 *   characters  "<class>/<job>/<anim>"      e.g. "warrior/5_warlord/attack"
 *   effects     "effects/<class>/<anim>"    e.g. "effects/warrior/basic"
 *   bosses      "bosses/<boss>/<anim>"      e.g. "bosses/horse_crowned_256/idle"
 *
 * LOSSLESSNESS (hard requirement): strips are built by concatenating the RAW
 * RGBA rows of each decoded frame — no compositing, no resizing, no resampling
 * — then encoding once as PNG. sharp's `composite()` is deliberately avoided
 * because it premultiplies alpha (which perturbs RGB values of semi-transparent
 * pixels). After encoding, every strip is decoded again and byte-compared
 * against the raw concatenation to PROVE the round-trip is exact; any mismatch
 * fails the build.
 *
 * VERIFICATION printed on every run:
 *   - per-category expected vs actual strip counts (fails on mismatch)
 *   - anchor frame counts (fx-anchors/fx-special-anchors) vs the actual frame
 *     dirs (fails on mismatch — stale anchors would break choreography)
 *   - total payload size of all strips
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAR_DIR = path.join(ROOT, "characters");
const FX_DIR = path.join(ROOT, "assets", "effects");
const BOSS_DIR = path.join(ROOT, "characters", "bosses");
const OUT_SPRITES = path.join(ROOT, "src", "battle", "sprites");
const OUT_MANIFEST = path.join(OUT_SPRITES, "manifest.json");
const OUT_SPRITEMAP = path.join(ROOT, "src", "battle", "spriteMap.ts");
const OUT_ANCHORS = path.join(ROOT, "src", "battle", "anchors.ts");

/* ==================================================================== *
 * SHIPPED-ANIMS FILTER (STR-85 sprite trim) — THE one place to edit    *
 * ==================================================================== *
 * Only the animations listed here are packed into the app bundle
 * (src/battle/sprites/ + manifest.json + spriteMap.ts). Everything else
 * stays in the repo as loose frames (characters/, assets/effects/ — the
 * source of truth is never touched) but ships ZERO bytes: the 2026-07-16
 * audit found ~3.5MB of packed strips with no code path that plays them
 * (32 `evolution` strips + 5 boss strips beyond `idle`).
 *
 * To RE-ENABLE an animation later, this list is the one edit:
 *   • evolution:   add "evolution" to SHIPPED_CHARACTER_ANIMS below,
 *   • boss anims:  add e.g. "hurt"/"attack"/"idle_alt" to a BOSS_SCOPE
 *     anims array (or includeStatic: true for the crowned static pose),
 * then re-run `npm run pack-sprites` (it also updates the count table's
 * expectations — see `expected` in step 6b).
 */

/** Character anims that ship (all 40 jobs). On disk but unshipped: evolution. */
const SHIPPED_CHARACTER_ANIMS = ["idle", "attack", "special", "rest"];

/**
 * Boss packing scope. Boss.tsx plays `idle` only (the hit reaction is flash +
 * bump per fx-engine, not a strip) — the other dirs (horse attack/hurt/
 * idle_alt, crowned hurt/static) exist on disk but are unshipped (STR-85).
 * armored_cat_256 is intentionally excluded — boss variety is deferred
 * (plan "Explicitly deferred"); it was the format prototype, not a shipping boss.
 */
const BOSS_SCOPE = {
  horse_256: { anims: ["idle"], includeStatic: false },
  horse_crowned_256: { anims: ["idle"], includeStatic: false },
};

/* ------------------------------------------------------------------ *
 * Small helpers                                                       *
 * ------------------------------------------------------------------ */

/** Sorted subdirectory names (stable ordering => idempotent output). */
function subdirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Sorted frame paths for one animation dir. Only `frame_*.png` counts —
 * zero-padded names make lexicographic sort == play order; junk like
 * .DS_Store is ignored.
 */
function framePaths(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^frame_\d+\.png$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

/* ------------------------------------------------------------------ *
 * 1. Collect every animation to pack                                  *
 * ------------------------------------------------------------------ */

/** @type {Array<{key: string, category: string, frames: string[]}>} */
const animations = [];

// -- Characters: characters/<class>/<job>/animations/<anim>/ ----------
// Only SHIPPED_CHARACTER_ANIMS are packed (see the filter block up top —
// evolution exists on disk but ships zero bytes, STR-85); the count table
// below still pins the shipped set.
const classes = subdirs(CHAR_DIR).filter((c) => c !== "bosses");
for (const cls of classes) {
  for (const job of subdirs(path.join(CHAR_DIR, cls))) {
    const animRoot = path.join(CHAR_DIR, cls, job, "animations");
    if (!fs.existsSync(animRoot)) continue;
    for (const anim of subdirs(animRoot)) {
      if (!SHIPPED_CHARACTER_ANIMS.includes(anim)) continue; // unshipped (STR-85)
      animations.push({
        key: `${cls}/${job}/${anim}`,
        category: anim, // idle | attack | special | rest | evolution
        frames: framePaths(path.join(animRoot, anim)),
      });
    }
  }
}

// -- Effects: assets/effects/<class>/{basic,special,impact}/ ----------
// Per-CLASS shared VFX (user-approved budget decision — per-job feel comes
// from the per-job anchors, not per-job art).
for (const cls of subdirs(FX_DIR)) {
  for (const anim of subdirs(path.join(FX_DIR, cls))) {
    animations.push({
      key: `effects/${cls}/${anim}`,
      category: "effects",
      frames: framePaths(path.join(FX_DIR, cls, anim)),
    });
  }
}

// -- Bosses (see BOSS_SCOPE above) -------------------------------------
for (const [boss, scope] of Object.entries(BOSS_SCOPE)) {
  const bossRoot = path.join(BOSS_DIR, boss);
  const anims = scope.anims === "all" ? subdirs(bossRoot) : scope.anims;
  for (const anim of [...anims].sort()) {
    animations.push({
      key: `bosses/${boss}/${anim}`,
      category: "boss",
      frames: framePaths(path.join(bossRoot, anim)),
    });
  }
  if (scope.includeStatic) {
    // The static pose rides through the same pipeline as a 1-frame strip so
    // the manifest/spriteMap stay uniform for consumers.
    animations.push({
      key: `bosses/${boss}/static`,
      category: "boss",
      frames: [path.join(bossRoot, "static.png")],
    });
  }
}

// Stable global ordering — the single source of manifest/spriteMap order.
animations.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

const dupes = animations.filter((a, i) => i > 0 && animations[i - 1].key === a.key);
if (dupes.length) {
  throw new Error(`Duplicate animation keys: ${dupes.map((d) => d.key).join(", ")}`);
}

/* ------------------------------------------------------------------ *
 * 2. Pack each animation into a horizontal strip (lossless)           *
 * ------------------------------------------------------------------ */

/**
 * Decode frames to raw RGBA, concatenate row-by-row into one wide raw image,
 * encode as PNG once, then decode the PNG and byte-compare to prove the
 * round-trip is pixel-exact. Returns the manifest entry.
 */
async function packStrip({ key, frames }) {
  if (frames.length === 0) throw new Error(`${key}: no frame_*.png files found`);

  // Decode every frame to raw RGBA (ensureAlpha only ADDS an opaque alpha
  // channel to RGB inputs — it never touches existing pixel values).
  const decoded = [];
  for (const file of frames) {
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    decoded.push({ file, data, w: info.width, h: info.height, ch: info.channels });
  }

  // All frames of one animation must share dimensions (frame sizes DO vary
  // across animations — e.g. 124px idles next to 128px attacks — which is why
  // dims are read per-animation, never assumed).
  const { w, h, ch } = decoded[0];
  for (const d of decoded) {
    if (d.w !== w || d.h !== h || d.ch !== ch) {
      throw new Error(
        `${key}: inconsistent frame size — ${path.basename(d.file)} is ` +
          `${d.w}x${d.h}x${d.ch}, expected ${w}x${h}x${ch}`
      );
    }
  }

  // Row-wise concatenation: strip row y = frame0 row y | frame1 row y | ...
  // Pure Buffer.copy — nothing can resample or blend.
  const stripW = w * decoded.length;
  const rowBytes = w * ch;
  const strip = Buffer.allocUnsafe(stripW * h * ch);
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < decoded.length; i++) {
      decoded[i].data.copy(
        strip,
        (y * stripW + i * w) * ch, // dest offset in the wide strip row
        y * rowBytes, //             src row start in frame i
        (y + 1) * rowBytes //        src row end
      );
    }
  }

  // Encode once. compressionLevel 9 = smallest; PNG is lossless by definition,
  // and sharp's encoder is deterministic (no timestamps) => idempotent bytes.
  const png = await sharp(strip, { raw: { width: stripW, height: h, channels: ch } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  // PROOF of losslessness: decode what we just encoded, byte-compare.
  const roundTrip = await sharp(png).raw().toBuffer();
  if (Buffer.compare(roundTrip, strip) !== 0) {
    throw new Error(`${key}: PNG round-trip is not pixel-exact — aborting`);
  }

  const file = key.replaceAll("/", "_") + ".png";
  fs.writeFileSync(path.join(OUT_SPRITES, file), png);
  return { key, entry: { frames: frames.length, w, h, file }, bytes: png.length };
}

fs.mkdirSync(OUT_SPRITES, { recursive: true });

const results = [];
for (const anim of animations) {
  results.push(await packStrip(anim));
}

// Remove stale strips from previous runs (renamed/removed animations) so the
// sprites dir is always exactly the manifest — a requirement for idempotency.
const expectedFiles = new Set(results.map((r) => r.entry.file).concat("manifest.json"));
for (const f of fs.readdirSync(OUT_SPRITES)) {
  if (!expectedFiles.has(f)) {
    fs.rmSync(path.join(OUT_SPRITES, f));
    console.log(`removed stale: ${f}`);
  }
}

/* ------------------------------------------------------------------ *
 * 3. Write manifest.json                                              *
 * ------------------------------------------------------------------ */

const manifest = {};
for (const r of results) manifest[r.key] = r.entry; // results are key-sorted
fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

/* ------------------------------------------------------------------ *
 * 4. Write spriteMap.ts — static require() map (plan D1)              *
 * ------------------------------------------------------------------ */

const spriteMapLines = results.map(
  (r) => `  "${r.key}": require("./sprites/${r.entry.file}"),`
);
fs.writeFileSync(
  OUT_SPRITEMAP,
  `// GENERATED — do not hand-edit. Regenerate via \`npm run pack-sprites\`
// (scripts/pack-sprites.mjs). Static require() map for every packed sprite
// strip — Metro cannot resolve dynamic require paths, so this map is codegen
// (docs/fx-rn-port-plan.md, decision D1). Frame metadata (frames/w/h) lives in
// ./sprites/manifest.json under the same keys.

export const SPRITES = {
${spriteMapLines.join("\n")}
} as const;

/** "<class>/<job>/<anim>" | "effects/<class>/<anim>" | "bosses/<boss>/<anim>" */
export type SpriteKey = keyof typeof SPRITES;

export default SPRITES;
`
);

/* ------------------------------------------------------------------ *
 * 5. Write anchors.ts — converted fx anchor data (plan D3)            *
 * ------------------------------------------------------------------ */

/**
 * The anchor .js files are themselves GENERATED (`window.X = {...};` written
 * by the pixel scan in fx-test.html?scan=1). We parse the object literal —
 * it is valid JSON — and re-emit it as typed TS. Same numbers, never edited.
 */
function parseAnchorFile(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  const m = src.match(/window\.[A-Z_]+\s*=\s*(\{[\s\S]*\});/);
  if (!m) throw new Error(`${relPath}: could not find "window.X = {...};"`);
  return JSON.parse(m[1]);
}

const fxAnchors = parseAnchorFile("assets/fx-anchors.js");
const fxSpecialAnchors = parseAnchorFile("assets/fx-special-anchors.js");

/** Emit one anchor record as sorted, aligned TS object-literal lines. */
function anchorLines(obj) {
  return Object.keys(obj)
    .sort()
    .map((k) => {
      const a = obj[k];
      // JSON.stringify preserves the exact numeric literals of the source.
      return `  "${k}": { frames: ${a.frames}, release: ${a.release}, tipX: ${JSON.stringify(
        a.tipX
      )}, tipY: ${JSON.stringify(a.tipY)} },`;
    });
}

fs.writeFileSync(
  OUT_ANCHORS,
  `// GENERATED — never hand-edit. These numbers are pixel-measured from the
// non-transparent pixels of each job's animation frames; hand-tweaking them
// reintroduces the flying-backwards projectile bug the measurement exists to
// prevent (docs/fx-rn-port-plan.md, decision D3). To regenerate: rescan in the
// HTML rig (fx-test.html?scan=1) — which rewrites assets/fx-anchors.js and
// assets/fx-special-anchors.js — then run \`npm run pack-sprites\` to refresh
// this file from those. The HTML rig remains the only measurement path.

/**
 * One animation's projectile-release data:
 * - frames:  frame count of the animation (cross-checked against the packed
 *            strips by scripts/pack-sprites.mjs on every run)
 * - release: frame index at which the weapon is most extended — the projectile
 *            spawns when this frame shows
 * - tipX/Y:  the visible weapon-tip position as a FRACTION of the frame
 *            (never use sprite-box edges — transparent padding is why)
 */
export interface FxAnchor {
  frames: number;
  release: number;
  tipX: number;
  tipY: number;
}

/** Basic-attack anchors, one per job ("<class>/<job>"). */
export const FX_ANCHORS: Record<string, FxAnchor> = {
${anchorLines(fxAnchors).join("\n")}
};

/**
 * Ultimate (\`special/\` animation) anchors, one per job. Jobs missing here
 * fall back to their attack anim + FX_ANCHORS (same rule as the preview
 * engine, assets/fx-engine.js) — currently all 40 are present.
 */
export const FX_SPECIAL_ANCHORS: Record<string, FxAnchor> = {
${anchorLines(fxSpecialAnchors).join("\n")}
};
`
);

/* ------------------------------------------------------------------ *
 * 6. Verify + summary                                                 *
 * ------------------------------------------------------------------ */

let failed = false;

// 6a. Anchor frame counts vs the actual frame dirs (i.e. vs the manifest,
// which step 2 proved matches the dirs). Stale anchors = broken release sync.
for (const [name, anchors, anim] of [
  ["fx-anchors", fxAnchors, "attack"],
  ["fx-special-anchors", fxSpecialAnchors, "special"],
]) {
  for (const [job, a] of Object.entries(anchors)) {
    const entry = manifest[`${job}/${anim}`];
    if (!entry) {
      console.error(`FAIL ${name}: ${job} has no packed ${anim} strip`);
      failed = true;
    } else if (entry.frames !== a.frames) {
      console.error(
        `FAIL ${name}: ${job}/${anim} — anchor says ${a.frames} frames, dir has ${entry.frames}`
      );
      failed = true;
    }
  }
}

// 6b. Count table — expected values pinned from characters/MANIFEST.md
// filtered through the SHIPPED-ANIMS block up top. A count drift (deleted/
// added dirs, or a shipped-list edit without updating this table) fails the
// run. (evolution: 32 dirs exist on disk, jobs 1–4 only, UNSHIPPED — add it
// back here when re-enabling in SHIPPED_CHARACTER_ANIMS.)
const expected = {
  idle: 40, //      40 jobs × breathing idle
  attack: 40, //    40 jobs × weapon attack
  special: 40, //   40 jobs × class-themed ultimate
  rest: 40, //      40 jobs × resting fuel-state loop (added 2026-07-13)
  effects: 24, //   8 classes × basic/special/impact
  boss: 2, //       horse_256 idle + crowned idle (see BOSS_SCOPE)
};
const actual = {};
for (const r of results) {
  const cat = animations.find((a) => a.key === r.key).category;
  actual[cat] = (actual[cat] || 0) + 1;
}

console.log("\ncategory   | expected | actual | status");
console.log("-----------+----------+--------+-------");
for (const cat of [...new Set([...Object.keys(expected), ...Object.keys(actual)])]) {
  const exp = expected[cat] ?? "—";
  const act = actual[cat] ?? 0;
  const ok = exp === act;
  if (!ok) failed = true;
  console.log(
    `${cat.padEnd(10)} | ${String(exp).padStart(8)} | ${String(act).padStart(6)} | ${ok ? "OK" : "MISMATCH"}`
  );
}
const totalExpected = Object.values(expected).reduce((s, n) => s + n, 0);
console.log(
  `${"TOTAL".padEnd(10)} | ${String(totalExpected).padStart(8)} | ${String(results.length).padStart(6)} | ${
    totalExpected === results.length ? "OK" : "MISMATCH"
  }`
);
if (totalExpected !== results.length) failed = true;

const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
console.log(
  `\n${results.length} strips, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total ` +
    `(+ manifest.json, spriteMap.ts, anchors.ts). All round-trips pixel-exact.`
);

if (failed) {
  console.error("\npack-sprites: VERIFICATION FAILED — see FAIL/MISMATCH lines above.");
  process.exit(1);
}
console.log("pack-sprites: all checks passed.");
