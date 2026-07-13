// ============================================================================
// STRIDE QUEST — procedural pixel-art UI kit (zero image files)
// Shared by ui-procedural.html (the asset gallery) and battlefield-ui.html
// (the live HUD). Everything draws with fillRect on low-res logical canvases
// scaled up nearest-neighbor. Rules: integer coords, named palette only, flat
// 2–3 tone banding, notched corners, 1px outlines, frame-count blink.
// Exposes plain globals (same pattern as the mock pages' inline scripts).
// ============================================================================

/* ------------------------------- palette -------------------------------- */
const PALETTE = {
  outline:      '#15110f',
  white:        '#f7f3e7',
  stone_light:  '#98a2b0',
  stone_mid:    '#5f6875',
  stone_dark:   '#3b414c',
  stone_deep:   '#22252d',
  gold_light:   '#ffe9a0',
  gold_mid:     '#ffce6b',
  gold_dark:    '#c08a36',
  gold_deep:    '#6f4d1d',
  green_light:  '#9ae06b',
  green_mid:    '#46b34e',
  green_dark:   '#256e30',
  yellow_light: '#ffe08a',
  yellow_mid:   '#f0b43c',
  yellow_dark:  '#9c6d1e',
  red_light:    '#ff9a78',
  red_mid:      '#dd4632',
  red_dark:     '#7e2418',
  blue_light:   '#8ad4ff',
  blue_mid:     '#3f9fe0',
  blue_dark:    '#205d8f',
  bg_scene:     '#262b36',
};
const HP_FAMILIES = {
  green:  { light:'green_light',  mid:'green_mid',  dark:'green_dark'  },
  yellow: { light:'yellow_light', mid:'yellow_mid', dark:'yellow_dark' },
  red:    { light:'red_light',    mid:'red_mid',    dark:'red_dark'    },
  gold:   { light:'gold_light',   mid:'gold_mid',   dark:'gold_dark'   },
  blue:   { light:'blue_light',   mid:'blue_mid',   dark:'blue_dark'   },
};
function hpFamily(v){ return v > .5 ? HP_FAMILIES.green : v > .25 ? HP_FAMILIES.yellow : HP_FAMILIES.red; }

// The one low-level draw op. Everything goes through here → integers, palette keys only.
function px(ctx, x, y, w, h, key){
  ctx.fillStyle = PALETTE[key];
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
// 1px outline rect with notched (skipped) corner pixels.
function outlineRect(ctx, x, y, w, h){
  px(ctx, x+1, y,     w-2, 1, 'outline');
  px(ctx, x+1, y+h-1, w-2, 1, 'outline');
  px(ctx, x,   y+1, 1, h-2, 'outline');
  px(ctx, x+w-1, y+1, 1, h-2, 'outline');
}

/* ------------------------------- sprites -------------------------------- */
function drawSprite(ctx, sprite, x, y, override){
  const rows = sprite.rows;
  for (let r = 0; r < rows.length; r++){
    for (let c = 0; c < rows[r].length; c++){
      const ch = rows[r][c];
      if (ch === '.') continue;
      const key = (override && override[ch]) || sprite.map[ch];
      if (key) px(ctx, x + c, y + r, 1, 1, key);
    }
  }
}
function spriteW(s){ return s.rows[0].length; }
function spriteH(s){ return s.rows.length; }
// Data-level 90° clockwise rotation — still pure grid data, still integers.
function rotateCW(s){
  const R = s.rows.length, C = s.rows[0].length, out = [];
  for (let r2 = 0; r2 < C; r2++){
    let line = '';
    for (let c2 = 0; c2 < R; c2++) line += s.rows[R-1-c2][r2];
    out.push(line);
  }
  return { map: s.map, rows: out };
}
function flipH(s){ return { map: s.map, rows: s.rows.map(r => r.split('').reverse().join('')) }; }
// Overlay b under a (a's pixels win) — used to build crossed swords from one sword.
function mergeSprites(a, b){
  const rows = a.rows.map((row, r) =>
    row.split('').map((ch, c) => ch !== '.' ? ch : b.rows[r][c]).join(''));
  return { map: a.map, rows };
}
// Integer chunky upscale (each cell becomes k×k) — data-level, stays crisp.
function scaleSprite(s, k){
  const rows = [];
  for (const row of s.rows){
    let line = '';
    for (const ch of row) line += ch.repeat(k);
    for (let i = 0; i < k; i++) rows.push(line);
  }
  return { map: s.map, rows };
}

const HEART = { map: { o:'outline', R:'red_mid', L:'red_light' }, rows: [
  '.oo.oo.',
  'oLRoRRo',
  'oLRRRRo',
  '.oRRRo.',
  '..oRo..',
  '...o...',
]};
const HEART_HALF = { map: { o:'outline', R:'red_mid', L:'red_light', E:'stone_dark' }, rows: [
  '.oo.oo.',
  'oLRoEEo',
  'oLRREEo',
  '.oRREo.',
  '..oRo..',
  '...o...',
]};
const HEART_EMPTY_OVERRIDE = { R:'stone_dark', L:'stone_mid' };

const COIN = { map: { o:'outline', L:'gold_light', G:'gold_mid', D:'gold_dark' }, rows: [
  '..oooo..',
  '.oLLGGo.',
  'oLLGGGDo',
  'oLGGGGDo',
  'oLGGGGDo',
  'oGGGGDDo',
  '.oGGDDo.',
  '..oooo..',
]};
const STAR = { map: { o:'outline', G:'gold_mid', L:'gold_light', W:'white' }, rows: [
  '....o....',
  '...oGo...',
  '...oLo...',
  '.ooGLGoo.',
  'oGGLWLGGo',
  '.ooGLGoo.',
  '...oLo...',
  '...oGo...',
  '....o....',
]};
const GEM = { map: { o:'outline', L:'blue_light', B:'blue_mid', D:'blue_dark' }, rows: [
  '.ooooo.',
  'oLLBBDo',
  '.oLBDo.',
  '..oBo..',
  '...o...',
]};
const SKULL = { map: { o:'outline', W:'white' }, rows: [
  '.oooooo.',
  'oWWWWWWo',
  'oWoWWoWo',
  'oWWWWWWo',
  '.oWWWWo.',
  '..oWWo..',
  '..oooo..',
]};
const ARROW_UP = { map: { o:'outline', A:'white', L:'stone_light' }, rows: [
  '...o...',
  '..oAo..',
  '.oAALo.',
  'oAAAALo',
  'oooAooo',
  '..oAo..',
  '..oAo..',
  '..ooo..',
]};
const ARROW_RIGHT = rotateCW(ARROW_UP);
const ARROW_DOWN  = rotateCW(ARROW_RIGHT);
const ARROW_LEFT  = rotateCW(ARROW_DOWN);

const SWORD = { map: { o:'outline', W:'white', G:'gold_mid', D:'gold_dark' }, rows: [
  '.........oo',
  '........oWo',
  '.......oWo.',
  '......oWo..',
  '.....oWo...',
  '..oGoWo....',
  '...oGo.....',
  '..oDoGo....',
  '.oDo..o....',
  'oGo........',
  '.o.........',
]};
const CROSSED_SWORDS = mergeSprites(SWORD, flipH(SWORD));

// Guild banner (swallowtail pennant) — nav emblem.
const BANNER = { map: { o:'outline', B:'red_mid', W:'gold_mid' }, rows: [
  'ooooooo',
  'oBBBBBo',
  'oBBWBBo',
  'oBBBBBo',
  'oBBBBBo',
  'oBBoBBo',
  '.oo.oo.',
]};
// Stone shield with gold band — job-level badge base (number drawn over it).
const SHIELD = { map: { o:'outline', G:'gold_mid', L:'stone_light', M:'stone_mid', D:'stone_dark' }, rows: [
  '.ooooooooooo.',
  'oGGGGGGGGGGGo',
  'oLMMMMMMMMMDo',
  'oLMMMMMMMMMDo',
  'oLMMMMMMMMMDo',
  'oLMMMMMMMMMDo',
  '.oLMMMMMMMDo.',
  '.oLMMMMMMMDo.',
  '..oLMMMMMDo..',
  '..oLMMMMMDo..',
  '...oLMMMDo...',
  '....oLMDo....',
  '.....oMo.....',
  '......o......',
]};

/* --------------------------- pixel font (3–5px) -------------------------- */
// Hand-set proportional caps font. '#' = pixel. NEVER ctx.fillText — it anti-aliases.
const FONT = {
  'A':['.#.','#.#','###','#.#','#.#'], 'B':['##.','#.#','##.','#.#','##.'],
  'C':['.##','#..','#..','#..','.##'], 'D':['##.','#.#','#.#','#.#','##.'],
  'E':['###','#..','##.','#..','###'], 'F':['###','#..','##.','#..','#..'],
  'G':['.###','#...','#.##','#..#','.##.'], 'H':['#.#','#.#','###','#.#','#.#'],
  'I':['###','.#.','.#.','.#.','###'], 'J':['..#','..#','..#','#.#','.#.'],
  'K':['#.#','#.#','##.','#.#','#.#'], 'L':['#..','#..','#..','#..','###'],
  'M':['#...#','##.##','#.#.#','#...#','#...#'],
  'N':['#..#','##.#','#.##','#..#','#..#'],
  'O':['.##.','#..#','#..#','#..#','.##.'],
  'P':['##.','#.#','##.','#..','#..'],
  'Q':['.##.','#..#','#..#','#.#.','.#.#'],
  'R':['##.','#.#','##.','#.#','#.#'],
  'S':['.##','#..','.#.','..#','##.'], 'T':['###','.#.','.#.','.#.','.#.'],
  'U':['#.#','#.#','#.#','#.#','###'], 'V':['#.#','#.#','#.#','#.#','.#.'],
  'W':['#...#','#...#','#.#.#','##.##','#...#'],
  'X':['#.#','#.#','.#.','#.#','#.#'], 'Y':['#.#','#.#','.#.','.#.','.#.'],
  'Z':['###','..#','.#.','#..','###'],
  '0':['.#.','#.#','#.#','#.#','.#.'], '1':['.#.','##.','.#.','.#.','###'],
  '2':['##.','..#','.#.','#..','###'], '3':['###','..#','.##','..#','###'],
  '4':['#.#','#.#','###','..#','..#'], '5':['###','#..','##.','..#','##.'],
  '6':['.##','#..','###','#.#','###'], '7':['###','..#','.#.','.#.','.#.'],
  '8':['###','#.#','###','#.#','###'], '9':['###','#.#','###','..#','##.'],
  ' ':['..','..','..','..','..'],
  '.':['.','.','.','.','#'], ',':['..','..','..','.#','#.'],
  '!':['#','#','#','.','#'], '-':['...','...','###','...','...'],
  '+':['...','.#.','###','.#.','...'], '/':['..#','..#','.#.','#..','#..'],
  ':':['.','#','.','#','.'], '%':['#.#','..#','.#.','#..','#.#'],
  '?':['##.','..#','.#.','...','.#.'],
};
function textWidth(str, scale){
  scale = scale || 1;
  let w = 0;
  for (const ch of str.toUpperCase()) w += (FONT[ch] || FONT['.'])[0].length + 1;
  return Math.max(0, w - 1) * scale;
}
function drawText(ctx, str, x, y, key, scale){
  scale = scale || 1;
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of str.toUpperCase()){
    const g = FONT[ch] || FONT['.'];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < g[r].length; c++)
        if (g[r][c] === '#') px(ctx, cx + c*scale, cy + r*scale, scale, scale, key);
    cx += (g[0].length + 1) * scale;
  }
  return cx - scale;
}

/* --------------------------------- bars ---------------------------------- */
// Health bar. value/ghost are 0..1. flash = frames remaining of white damage-blink.
// o.family forces a color family (e.g. HP_FAMILIES.red for the boss,
// HP_FAMILIES.gold for XP); default is the green/yellow/red threshold swap.
function drawHealthBar(ctx, x, y, w, h, o){
  outlineRect(ctx, x, y, w, h);
  let ix = x+1, iy = y+1, iw = w-2, ih = h-2;
  if (o.gold){                        // boss variant: gold inner frame
    px(ctx, ix, iy, iw, ih, 'gold_dark');
    px(ctx, ix, iy, iw, 1, 'gold_mid');
    ix += 1; iy += 1; iw -= 2; ih -= 2;
  }
  px(ctx, ix, iy, iw, ih, 'stone_deep');
  const v = Math.max(0, Math.min(1, o.value));
  let fw = Math.round(iw * v);
  if (v > 0 && fw < 1) fw = 1;
  const g = Math.max(v, Math.min(1, o.ghost != null ? o.ghost : v));
  let gw = Math.round(iw * g);
  if (gw > fw) px(ctx, ix+fw, iy, gw-fw, ih, 'red_light');   // chip ghost
  if (fw > 0){
    const flashOn = o.flash > 0 && (o.flash % 4) < 2;         // frame-count blink
    if (flashOn){
      px(ctx, ix, iy, fw, ih, 'white');
    } else {
      const fam = o.family || hpFamily(v);
      px(ctx, ix, iy,      fw, 1,    fam.light);
      px(ctx, ix, iy+1,    fw, ih-2, fam.mid);
      px(ctx, ix, iy+ih-1, fw, 1,    fam.dark);
    }
  }
}

// Segmented resource bar. value = 0..cells (float → partial fill of active cell).
function drawSegmentBar(ctx, x, y, o){
  const cells = o.cells, cw = o.cellW, chh = o.cellH;
  const w = cells * cw + (cells - 1) + 2;   // cells + 1px separators + outline
  const h = chh + 2;
  outlineRect(ctx, x, y, w, h);
  let cx = x + 1;
  for (let i = 0; i < cells; i++){
    if (i > 0){ px(ctx, cx - 1, y+1, 1, chh, 'outline'); }
    px(ctx, cx, y+1, cw, chh, 'stone_deep');
    const rem = Math.max(0, Math.min(1, o.value - i));
    let fw = Math.round(rem * cw);
    if (rem > 0 && fw < 1) fw = 1;
    if (fw > 0){
      px(ctx, cx, y+1,   fw, 1,     'blue_light');
      px(ctx, cx, y+2,   fw, chh-2, 'blue_mid');
      px(ctx, cx, y+chh, fw, 1,     'blue_dark');
    }
    cx += cw + 1;
  }
  return { w, h };
}

// Pixel ring (steps/progress donut). Rasterized cell-by-cell — no arc(), the
// stair-stepping IS the aesthetic. frac 0..1 fills clockwise from 12 o'clock.
function drawPixelRing(ctx, cx, cy, rOut, rIn, frac, onKey, offKey){
  const x0 = Math.floor(cx - rOut - 1), x1 = Math.ceil(cx + rOut + 1);
  const y0 = Math.floor(cy - rOut - 1), y1 = Math.ceil(cy + rOut + 1);
  for (let y = y0; y <= y1; y++){
    for (let x = x0; x <= x1; x++){
      const dx = x + .5 - cx, dy = y + .5 - cy;
      const r = Math.sqrt(dx*dx + dy*dy);
      if (r < rIn - 1 || r >= rOut + 1) continue;
      let key;
      if (r < rIn || r >= rOut) key = 'outline';
      else {
        let a = Math.atan2(dx, -dy);
        if (a < 0) a += Math.PI * 2;
        key = (a / (Math.PI * 2)) <= frac ? onKey : offKey;
      }
      px(ctx, x, y, 1, 1, key);
    }
  }
}

/* -------------------------------- panels --------------------------------- */
// True 9-slice: a 12×12 patch (string art) sliced with 4px corners.
// Corners blit fixed, edges tile, center fills — one patch, any size.
const PANEL_PATCH_ART = { map: { o:'outline', L:'stone_light', M:'stone_mid', D:'stone_dark', W:'stone_deep' }, rows: [
  '..oooooooo..',
  '.oLLLLLLLLo.',
  'oLMMMMMMMMDo',
  'oLMWWWWWWMDo',
  'oLMWWWWWWMDo',
  'oLMWWWWWWMDo',
  'oLMWWWWWWMDo',
  'oLMWWWWWWMDo',
  'oLMWWWWWWMDo',
  'oLMMMMMMMMDo',
  '.oDDDDDDDDo.',
  '..oooooooo..',
]};
const PATCH_SIZE = 12, CS = 4;   // corner slice
const patchCanvas = document.createElement('canvas');
patchCanvas.width = PATCH_SIZE; patchCanvas.height = PATCH_SIZE;
{
  const pctx = patchCanvas.getContext('2d');
  pctx.imageSmoothingEnabled = false;
  drawSprite(pctx, PANEL_PATCH_ART, 0, 0);
}
function drawPanel(ctx, x, y, w, h, o){
  ctx.imageSmoothingEnabled = false;
  const P = patchCanvas, S = PATCH_SIZE, mid = S - 2*CS;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  px(ctx, x+3, y+3, w-6, h-6, 'stone_deep');
  for (let tx = x+CS; tx < x+w-CS; tx += mid){
    const tw = Math.min(mid, x+w-CS - tx);
    ctx.drawImage(P, CS, 0, tw, CS, tx, y, tw, CS);
    ctx.drawImage(P, CS, S-CS, tw, CS, tx, y+h-CS, tw, CS);
  }
  for (let ty = y+CS; ty < y+h-CS; ty += mid){
    const th = Math.min(mid, y+h-CS - ty);
    ctx.drawImage(P, 0, CS, CS, th, x, ty, CS, th);
    ctx.drawImage(P, S-CS, CS, CS, th, x+w-CS, ty, CS, th);
  }
  ctx.drawImage(P, 0, 0, CS, CS, x, y, CS, CS);
  ctx.drawImage(P, S-CS, 0, CS, CS, x+w-CS, y, CS, CS);
  ctx.drawImage(P, 0, S-CS, CS, CS, x, y+h-CS, CS, CS);
  ctx.drawImage(P, S-CS, S-CS, CS, CS, x+w-CS, y+h-CS, CS, CS);
  if (o && o.title){
    const sx = x+3, sy = y+3, sw = w-6, sh = 9;
    px(ctx, sx, sy,      sw, 1,  'gold_light');
    px(ctx, sx, sy+1,    sw, sh-2, 'gold_mid');
    px(ctx, sx, sy+sh-1, sw, 1,  'gold_dark');
    px(ctx, sx, sy+sh,   sw, 1,  'outline');
    drawText(ctx, o.title, sx + Math.round((sw - textWidth(o.title))/2), sy+2, 'gold_deep');
  }
}

/* -------------------------------- buttons -------------------------------- */
// state: 'idle' | 'hover' | 'pressed' | 'disabled'. variant: 'stone' | 'gold'.
// content: { text } | { sprite } | { draw(ctx, x, y, w, h, yo) } — custom draw
// gets the button's inner box and the pressed y-offset.
// Pressed shifts contents down 1px and drops the base shadow.
function drawButton(ctx, x, y, w, h, state, variant, content){
  const fam = variant === 'gold'
    ? { L:'gold_light', M:'gold_mid', D:'gold_dark' }
    : { L:'stone_light', M:'stone_mid', D:'stone_dark' };
  const pressed = state === 'pressed', disabled = state === 'disabled';
  const yo = pressed ? 1 : 0;
  const bh = h - 1;                              // 1px reserved for the base shadow row
  if (!pressed && !disabled) px(ctx, x+1, y+bh, w-2, 1, 'outline');   // base shadow
  outlineRect(ctx, x, y+yo, w, bh);
  const ix = x+1, iy = y+yo+1, iw = w-2, ih = bh-2;
  if (disabled){
    px(ctx, ix, iy, iw, ih, 'stone_dark');
    px(ctx, ix, iy+ih-1, iw, 1, 'stone_deep');
  } else if (pressed){
    px(ctx, ix, iy, iw, ih, fam.M);
    px(ctx, ix, iy, iw, 1, fam.D);               // light flips to the bottom
    px(ctx, ix, iy+ih-1, iw, 1, fam.L);
  } else {
    px(ctx, ix, iy, iw, ih, fam.M);
    px(ctx, ix, iy, iw, 1, state === 'hover' ? 'white' : fam.L);
    px(ctx, ix, iy+ih-1, iw, 1, fam.D);
    px(ctx, ix, iy+1, 1, ih-2, fam.L);
    px(ctx, ix+iw-1, iy+1, 1, ih-2, fam.D);
  }
  if (content){
    if (content.text){
      const key = disabled ? 'stone_mid' : (variant === 'gold' ? 'gold_deep' : 'white');
      const sc = content.scale || 1;
      drawText(ctx, content.text, x + Math.round((w - textWidth(content.text, sc))/2),
        y + yo + Math.round((bh - 5*sc)/2), key, sc);
    } else if (content.sprite){
      const s = content.sprite;
      const ov = disabled ? { W:'stone_mid', G:'stone_dark', D:'stone_dark' } : (content.override || null);
      drawSprite(ctx, s, x + Math.round((w - spriteW(s))/2),
        y + yo + Math.round((bh - spriteH(s))/2), ov);
    } else if (content.draw){
      content.draw(ctx, x+1, y+yo+1, w-2, bh-2, yo);
    }
  }
}

/* ========================================================================== */
/* HI-FI LAYER — reference-fidelity pixel chrome (style-lab v2, 2026-07-12).  */
/* Multi-band rounded frames w/ directional light, dithered gradient faces,   */
/* corner glints, engraved labels, surface specks. Rounded corners come from  */
/* per-row circle math — no arc(), every pixel intentional.                   */
/* ========================================================================== */

// Material ramps: 7 tones — [0]=glint [1]=rim-light [2]=light [3]=mid [4]=dark [5]=deep [6]=outline
const MATERIALS = {
  gold:  ['#fff6d0','#ffe9a0','#f4c95a','#d9a441','#a6761f','#6f4d1d','#26180a'],
  silver:['#ffffff','#e8eef4','#c2ccd6','#98a5b3','#67727f','#3f4854','#14181d'],
  iron:  ['#dfe6ec','#b9c2cb','#8d98a3','#6a747f','#49525c','#2f353d','#101318'],
  amethyst:['#f4e6ff','#dfb8ff','#b985ec','#9256cc','#66339c','#43206b','#190c2a'],
  bone:  ['#fffdf2','#f1e9d4','#d8cdaf','#bcae8c','#8d8063','#5c523d','#181410'],
  oak:   ['#ffd9a0','#d9a86a','#b58248','#8a5f36','#63421f','#3f2a13','#170e06'],
  elder: ['#eaf7c0','#c4e07e','#93bb4e','#6d9439','#4a6b26','#2e4517','#101a08'],
  slate: ['#e6ebf2','#aab4c0','#7d8894','#5a636e','#3e454e','#282d34','#101318'],
  ember: ['#ffe2b0','#ffb15c','#f07a26','#c24e12','#8a300b','#571c06','#190905'],
  gb:    ['#9bbc0f','#9bbc0f','#8bac0f','#8bac0f','#306230','#306230','#0f380f'],
};
Object.keys(MATERIALS).forEach(name => {
  MATERIALS[name].forEach((hex, i) => { PALETTE[name + i] = hex; });
});
const M = name => ({ name, g:name+'0', rim:name+'1', l:name+'2', m:name+'3', d:name+'4', dp:name+'5', out:name+'6' });

// Wells (recessed interiors), scene backdrops, extra accent families.
Object.assign(PALETTE, {
  choc_w:'#3a2317',  choc_wd:'#2b1810',  coffee_bg:'#211a12',
  velvet_w:'#2a1233', velvet_wd:'#1e0c26', royal_bg:'#241a33',
  oak_w:'#39230f',   oak_wd:'#2a1808',   rustic_bg:'#241709',
  glass_w:'#221040', glass_wd:'#180b30', arcane_bg:'#1c1030',
  slate_w:'#1b2026', slate_wd:'#14181d', min_bg:'#181b21',
  shadow_w:'#171018', shadow_wd:'#100a10', occult_bg:'#120d16',
  leaf_w:'#16200c',  leaf_wd:'#0f1706',  nature_bg:'#1b2413',
  night_w:'#1a2942', night_wd:'#131f33', sky_bg:'#1b2637',
  blood_w:'#2a0d0d', blood_wd:'#1d0808', arena_bg:'#170f0b',
  ghoul_light:'#a9f4c9', ghoul_mid:'#5cd694', ghoul_dark:'#2b8a56',
  sky_light:'#e9f4ff', sky_mid:'#a9c8e6', sky_dark:'#6485a8',
});

/* ------------------------ gradient ramps + dither ------------------------- */
function lerpHex(a, b, t){
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = sh => Math.round((pa >> sh & 255) * (1 - t) + (pb >> sh & 255) * t);
  return '#' + [ch(16), ch(8), ch(0)].map(v => v.toString(16).padStart(2, '0')).join('');
}
// Build (and cache in PALETTE) an n-step ramp between stop hexes.
// pure=true keeps ONLY the stop colors (Game Boy — dither does the blending).
const _ramps = {};
function makeRamp(cacheKey, stops, steps, pure){
  if (_ramps[cacheKey]) return _ramps[cacheKey];
  const keys = [];
  const n = pure ? stops.length : steps;
  for (let i = 0; i < n; i++){
    const t = n > 1 ? i / (n - 1) : 0;
    let hex;
    if (pure) hex = stops[i];
    else {
      const pos = t * (stops.length - 1);
      const s0 = Math.min(stops.length - 2, Math.floor(pos));
      hex = lerpHex(stops[s0], stops[s0 + 1], pos - s0);
    }
    const key = cacheKey + '_' + i;
    PALETTE[key] = hex;
    keys.push(key);
  }
  _ramps[cacheKey] = keys;
  return keys;
}
function faceRamp(matName){
  const s = MATERIALS[matName];
  return makeRamp('fr_' + matName, [s[1], s[2], s[3], s[4]], 10, matName === 'gb');
}

/* ------------------------ rounded pixel rasterizer ------------------------ */
// Per-row inset profile for a rounded rect — circle math snapped to pixels.
function insets(h, r){
  r = Math.max(0, Math.min(r, h >> 1));
  const ins = new Array(h).fill(0);
  for (let j = 0; j < r; j++){
    const dy = r - j - .5;
    const v = Math.round(r - Math.sqrt(r*r - dy*dy));
    ins[j] = v; ins[h-1-j] = v;
  }
  return ins;
}
// Fill a rounded rect. key = palette key OR fn(t, j) with t = vertical 0..1.
function fillRounded(ctx, x, y, w, h, r, key){
  if (w <= 0 || h <= 0) return;
  const ins = insets(h, r);
  for (let j = 0; j < h; j++){
    const i2 = ins[j];
    if (w - 2*i2 <= 0) continue;
    const k = typeof key === 'function' ? key(h > 1 ? j/(h-1) : 0, j) : key;
    px(ctx, x + i2, y + j, w - 2*i2, 1, k);
  }
}
// Rounded fill through a ramp, with a checkerboard-dithered row at every band
// boundary — smooth gradient, still 100% flat colors.
function fillRoundedGradient(ctx, x, y, w, h, r, ramp){
  const ins = insets(h, r);
  let prev = -1;
  for (let j = 0; j < h; j++){
    const t = h > 1 ? j / (h - 1) : 0;
    const idx = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
    const i2 = ins[j], rw = w - 2 * i2;
    if (rw <= 0){ prev = idx; continue; }
    px(ctx, x + i2, y + j, rw, 1, ramp[idx]);
    if (idx !== prev && prev >= 0){
      for (let i = 0; i < rw; i++)
        if (((x + i2 + i) + (y + j)) % 2 === 0) px(ctx, x + i2 + i, y + j, 1, 1, ramp[prev]);
    }
    prev = idx;
  }
}
// Deterministic surface specks on the frame band (never in the well).
function speckle(ctx, x, y, w, h, r, thick, m, seed){
  const ins0 = insets(h, r);
  for (let j = 1; j < h-1; j++){
    for (let i = ins0[j]+1; i < w - ins0[j]-1; i++){
      const inFrame = j < thick || j >= h - thick || i < ins0[j] + thick || i >= w - ins0[j] - thick;
      if (!inFrame) continue;
      const hsh = ((i + seed) * 73856093 ^ (j + seed) * 19349663) >>> 0;
      if (hsh % 23 === 0) px(ctx, x+i, y+j, 1, 1, (hsh >> 6) % 2 ? m.d : m.rim);
    }
  }
}
function glint(ctx, x, y, h, r, m){
  const ins0 = insets(h, r);
  px(ctx, x + ins0[1] + 1, y + 1, 2, 1, m.g);
  px(ctx, x + ins0[2],     y + 2, 1, 1, m.g);
}
// Engraved label: light ledge below, dark text on top.
function engrave(ctx, str, x, y, m, scale){
  scale = scale || 1;
  drawText(ctx, str, x, y + scale, m.rim, scale);
  drawText(ctx, str, x, y, m.out, scale);
}
function mapAllTo(s, key){
  const ov = {};
  Object.keys(s.map).forEach(ch => ov[ch] = key);
  return ov;
}

/* --------------------------- hi-fi constructions -------------------------- */
// The reference frame: outline → lit rim → body → inner shadow ring (with
// bounce-light on its lower half) → dark bezel → recessed well.
function hifiFrame(ctx, x, y, w, h, r, m, wellKey, wellDarkKey){
  fillRounded(ctx, x,   y,   w,   h,   r,   m.out);
  fillRounded(ctx, x+1, y+1, w-2, h-2, r-1, t => t < .3 ? m.rim : t > .72 ? m.dp : m.l);
  fillRounded(ctx, x+2, y+2, w-4, h-4, r-2, t => t < .25 ? m.l : t > .75 ? m.d : m.m);
  fillRounded(ctx, x+4, y+4, w-8, h-8, r-3, t => t < .5 ? m.dp : m.l);
  fillRounded(ctx, x+5, y+5, w-10, h-10, r-4, m.out);
  fillRounded(ctx, x+6, y+6, w-12, h-12, r-4, t => t < .22 ? wellDarkKey : wellKey);
  glint(ctx, x, y, h, r, m);
  speckle(ctx, x, y, w, h, r, 5, m, x*31 + y*7);
  return { wx: x+6, wy: y+6, ww: w-12, wh: h-12 };
}
// Slim 3px frame for small bars (XP, mini progress).
function hifiFrameSlim(ctx, x, y, w, h, r, m, wellKey){
  fillRounded(ctx, x,   y,   w,   h,   r,   m.out);
  fillRounded(ctx, x+1, y+1, w-2, h-2, r-1, t => t < .3 ? m.rim : t > .72 ? m.dp : m.l);
  fillRounded(ctx, x+2, y+2, w-4, h-4, r-2, m.out);
  fillRounded(ctx, x+3, y+3, w-6, h-6, r-3, wellKey);
  return { wx: x+3, wy: y+3, ww: w-6, wh: h-6 };
}
// Solid face (buttons, plates, badges): outline → lit rim → smooth dithered
// gradient face (10-step ramp; GB stays 4 pure tones + dither).
function hifiFace(ctx, x, y, w, h, r, m){
  px(ctx, x+r, y+h, w-2*r, 1, m.out);                                    // drop shadow
  fillRounded(ctx, x,   y,   w,   h,   r,   m.out);
  fillRounded(ctx, x+1, y+1, w-2, h-2, r-1, t => t < .3 ? m.rim : t > .72 ? m.dp : m.l);
  fillRoundedGradient(ctx, x+2, y+2, w-4, h-4, r-2, faceRamp(m.name));
  glint(ctx, x, y, h, r, m);
  speckle(ctx, x, y, w, h, r, 3, m, x*17 + y*11);
}
// Bar: hi-fi frame + rounded fill. t = {mat, well, wellD, hp}.
// o = {value 0..1, ghost 0..1, flash frames, fam, slim, label, labelKey}.
function hifiBar(ctx, x, y, w, h, t, o){
  const m = t.mat, fam = o.fam || t.hp;
  const well = o.slim
    ? hifiFrameSlim(ctx, x, y, w, h, Math.min(6, h >> 1), m, t.wellD || t.well)
    : hifiFrame(ctx, x, y, w, h, Math.min(7, h >> 1), m, t.well, t.wellD);
  const v = Math.max(0, Math.min(1, o.value));
  let fw = Math.round(well.ww * v);
  if (v > 0 && fw < 2) fw = 2;
  const g = Math.max(v, Math.min(1, o.ghost != null ? o.ghost : v));
  const gw = Math.round(well.ww * g);
  const wins = insets(well.wh, Math.min(2, well.wh >> 1));
  const flashOn = o.flash > 0 && (o.flash % 4) < 2;
  for (let j = 0; j < well.wh; j++){
    const x0 = well.wx + wins[j];
    const rowMax = well.wx + well.ww - wins[j];
    const fx1 = Math.min(well.wx + fw, rowMax);
    const gx1 = Math.min(well.wx + gw, rowMax);
    if (gx1 > Math.max(x0, fx1)) px(ctx, Math.max(x0, fx1), well.wy + j, gx1 - Math.max(x0, fx1), 1, 'red_light');
    if (fx1 > x0){
      const k = flashOn ? 'white' : (j === 0 ? fam.light : j === well.wh-1 ? fam.dark : fam.mid);
      px(ctx, x0, well.wy + j, fx1 - x0, 1, k);
    }
  }
  if (fw > 2 && !flashOn && well.wh > 2)
    px(ctx, well.wx + wins[0], well.wy, Math.max(1, Math.round(fw*.35)), 1, fam.light);   // sheen
  if (o.label){
    const lx = x + Math.round((w - textWidth(o.label))/2);
    const ly = well.wy + Math.round((well.wh - 5)/2);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])   // full outline → readable on any fill
      drawText(ctx, o.label, lx+dx, ly+dy, 'outline');
    drawText(ctx, o.label, lx, ly, flashOn ? 'outline' : (o.labelKey || 'white'));
  }
  return well;
}
// Segmented bar — slim frame, cells recessed in the well.
function hifiSeg(ctx, x, y, cells, cw, ch, val, t){
  const m = t.mat;
  const w = cells*cw + (cells-1) + 6, h = ch + 6;
  fillRounded(ctx, x,   y,   w,   h,   5, m.out);
  fillRounded(ctx, x+1, y+1, w-2, h-2, 4, tt => tt < .3 ? m.rim : tt > .72 ? m.dp : m.l);
  fillRounded(ctx, x+2, y+2, w-4, h-4, 3, m.out);
  fillRounded(ctx, x+3, y+3, w-6, h-6, 2, t.wellD || t.well);
  let cx = x + 3;
  for (let i = 0; i < cells; i++){
    if (i > 0) px(ctx, cx-1, y+3, 1, ch, m.out);
    const rem = Math.max(0, Math.min(1, val - i));
    let fw = Math.round(rem * cw);
    if (rem > 0 && fw < 1) fw = 1;
    if (fw > 0){
      px(ctx, cx, y+3,      fw, 1,    t.seg.light);
      px(ctx, cx, y+4,      fw, ch-2, t.seg.mid);
      px(ctx, cx, y+3+ch-1, fw, 1,    t.seg.dark);
    }
    cx += cw + 1;
  }
  return { w, h };
}
// Panel with a pill name-plate overlapping the top frame.
function hifiPanel(ctx, x, y, w, h, t, title, lines){
  const m = t.mat;
  const well = hifiFrame(ctx, x, y, w, h, 6, m, t.well, t.wellD);
  let cy = well.wy + 4;
  if (title){
    const pw = textWidth(title) + 18, ph = 11;
    const pxx = x + Math.round((w - pw)/2);
    hifiFace(ctx, pxx, y - 3, pw, ph, 5, m);
    engrave(ctx, title, pxx + 9, y, m);
    cy = y + ph + 3;
  }
  (lines || []).forEach((ln, i) => drawText(ctx, ln, well.wx + 6, cy + i*9, i === 0 ? t.text : t.textDim));
  return well;
}
// Button: hi-fi face + engraved text or sprite emblem (1px cast shadow).
// pressed=true shifts contents down 1px.
function hifiButton(ctx, x, y, w, h, m, content, pressed){
  hifiFace(ctx, x, y, w, h, Math.min(6, h >> 1), m);
  const yo = pressed ? 1 : 0;
  if (content.text){
    const sc = content.scale || 1;
    engrave(ctx, content.text, x + Math.round((w - textWidth(content.text, sc))/2),
      y + yo + Math.round((h - 5*sc)/2), m, sc);
  } else if (content.sprite){
    const s = content.sprite;
    const sx = x + Math.round((w - spriteW(s))/2), sy = y + yo + Math.round((h - spriteH(s))/2);
    drawSprite(ctx, s, sx, sy+1, Object.assign({}, content.override || {}, mapAllTo(s, m.dp)));
    drawSprite(ctx, s, sx, sy, content.override || null);
  } else if (content.draw){
    content.draw(ctx, x, y + yo, w, h);
  }
}
function hifiBadge(ctx, x, y, num, m){
  hifiFace(ctx, x, y, 18, 18, 8, m);
  engrave(ctx, num, x + Math.round((18 - textWidth(num))/2), y + 7, m);
}
function hifiChip(ctx, x, y, label, m, ramp){
  const w = textWidth(label) + 10, h = 10;
  fillRounded(ctx, x, y, w, h, 4, m.out);
  fillRoundedGradient(ctx, x+1, y+1, w-2, h-2, 3, ramp);
  drawText(ctx, label, x+5, y+3, m.out);
  return w;
}
// FULL-BODY portrait crops in SOURCE PIXELS (dashboard-ui style: the whole
// character fits the frame so each party member is recognizable). Derived from
// each sprite's measured alpha bounding box (sprites carry big transparent
// padding — never assume the character fills the file). Keys: class (job-5
// south.png) + warrior_j2 (battlefield's Job 2 Strider avatar).
const PORTRAIT_CROPS = {
  warrior:{x:31,y:31,s:68}, mage:{x:26,y:28,s:67}, medic:{x:32,y:32,s:67},
  archer:{x:30,y:31,s:68},  assassin:{x:30,y:31,s:69}, paladin:{x:30,y:30,s:71},
  bard:{x:30,y:31,s:69},    warlock:{x:30,y:31,s:69},
  warrior_j2:{x:27,y:29,s:68},
};
// Portrait: slim frame + a character head cropped from a sprite image.
// crop = {x, y, s} in source pixels (see HEAD_CROPS). Pass img=null to render
// the empty frame (draw again when the file loads).
function hifiPortrait(ctx, x, y, size, m, wellKey, img, crop){
  const well = hifiFrameSlim(ctx, x, y, size, size, 5, m, wellKey);
  if (img && img.width){
    const cp = crop || { x: Math.round(img.width*.40), y: Math.round(img.height*.24),
                         s: Math.round(img.width*.24) };
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, cp.x, cp.y, cp.s, cp.s, well.wx, well.wy, well.ww, well.wh);
  } else {
    drawText(ctx, '?', well.wx + Math.round((well.ww - textWidth('?'))/2),
      well.wy + Math.round((well.wh - 5)/2), m.d);
  }
  return well;
}
// Toggle pill: accent-filled track + hi-fi knob (right = on).
function hifiToggle(ctx, x, y, on, m, fam, wellKey){
  fillRounded(ctx, x, y, 24, 12, 5, m.out);
  fillRounded(ctx, x+1, y+1, 22, 10, 4,
    on ? (t => t < .3 ? fam.light : fam.mid) : wellKey);
  hifiFace(ctx, x + (on ? 13 : 1), y + 1, 10, 10, 5, m);
}
// Slider: slim track with fill + riding knob. v = 0..1.
function hifiSlider(ctx, x, y, w, v, m, fam, wellKey){
  const well = hifiFrameSlim(ctx, x, y + 2, w, 10, 4, m, wellKey);
  const fw = Math.round(well.ww * Math.max(0, Math.min(1, v)));
  if (fw > 0){
    px(ctx, well.wx, well.wy, fw, 1, fam.light);
    px(ctx, well.wx, well.wy + 1, fw, well.wh - 2, fam.mid);
    px(ctx, well.wx, well.wy + well.wh - 1, fw, 1, fam.dark);
  }
  hifiFace(ctx, x + Math.round(v * (w - 12)), y, 12, 12, 5, m);
}

/* --------------------------- overlay components --------------------------- */
// Hero fuel states (fuel-hybrid design): battling / winded / resting.
const STATE_COLORS = { battling:'green_mid', winded:'yellow_mid', resting:'sky_mid' };
// 5×5 status orb (drop on a portrait corner).
function hifiStatusDot(ctx, x, y, stateOrKey){
  const key = STATE_COLORS[stateOrKey] || stateOrKey;
  px(ctx, x+1, y, 3, 1, 'outline'); px(ctx, x+1, y+4, 3, 1, 'outline');
  px(ctx, x, y+1, 1, 3, 'outline'); px(ctx, x+4, y+1, 1, 3, 'outline');
  px(ctx, x+1, y+1, 3, 3, key);
  px(ctx, x+1, y+1, 1, 1, 'white');
}
// Small attached popover: slim frame + pointer arrow toward its anchor.
// side 'top' = arrow on the top edge (anchor above), 'left' = arrow on the
// left edge (anchor to the left). arrowAt = arrow center offset along that
// edge, relative to x/y. Leave 3px of canvas beyond that edge for the arrow.
function hifiPopover(ctx, x, y, w, h, t, side, arrowAt){
  const m = t.mat;
  const well = hifiFrameSlim(ctx, x, y, w, h, 5, m, t.well);
  if (side === 'left'){
    const ay = y + arrowAt;
    px(ctx, x-1, ay-2, 1, 5, m.out); px(ctx, x-2, ay-1, 1, 3, m.out); px(ctx, x-3, ay, 1, 1, m.out);
    px(ctx, x-1, ay-1, 1, 3, m.rim); px(ctx, x-2, ay, 1, 1, m.rim);
    px(ctx, x, ay-1, 1, 3, m.rim);
  } else {
    const ax = x + arrowAt;
    px(ctx, ax-2, y-1, 5, 1, m.out); px(ctx, ax-1, y-2, 3, 1, m.out); px(ctx, ax, y-3, 1, 1, m.out);
    px(ctx, ax-1, y-1, 3, 1, m.rim); px(ctx, ax, y-2, 1, 1, m.rim);
    px(ctx, ax-1, y, 3, 1, m.rim);
  }
  return well;
}
// Modal dialog: titled panel + X close button riding the top-right frame.
// Returns { well, closeRect } — closeRect for hit-testing on live pages.
function hifiModal(ctx, x, y, w, h, t, title){
  const well = hifiPanel(ctx, x, y, w, h, t, title);
  const cm = t.sec || t.mat;
  const cx = x + w - 17, cy = y - 3;
  hifiFace(ctx, cx, cy, 15, 13, 5, cm);
  engrave(ctx, 'X', cx + 6, cy + 4, cm);
  return { well, closeRect: { x: cx, y: cy, w: 15, h: 14 } };
}
// Announcement banner (JOB UP!, BOSS FALLS!) — big engraved face.
function hifiBanner(ctx, x, y, w, m, label){
  hifiFace(ctx, x, y, w, 22, 8, m);
  engrave(ctx, label, x + Math.round((w - textWidth(label))/2), y + 8, m);
}
// Toast: transient dark notice chip.
function hifiToast(ctx, x, y, label, m, wellKey){
  const w = textWidth(label) + 12;
  fillRounded(ctx, x, y, w, 13, 5, m.out);
  fillRounded(ctx, x+1, y+1, w-2, 11, 4, t => t < .25 ? m.dp : wellKey);
  drawText(ctx, label, x+6, y+4, m.rim);
  return w;
}
// Tooltip: tiny dark chip with a down-pointer.
function hifiTooltip(ctx, x, y, label, m, wellKey){
  const w = textWidth(label) + 8;
  fillRounded(ctx, x, y, w, 11, 3, m.out);
  fillRounded(ctx, x+1, y+1, w-2, 9, 2, wellKey);
  drawText(ctx, label, x+4, y+3, m.rim);
  const ax = x + (w >> 1);
  px(ctx, ax-1, y+11, 3, 1, m.out); px(ctx, ax, y+12, 1, 1, m.out);
  return w;
}
