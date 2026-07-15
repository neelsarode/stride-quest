# The Game Screen — Full-Screen Pixel HUD (Design Spec, M2.75)

> Status: **planned, spiked, ready to build** (written 2026-07-15). Turns the
> scrolling-card dashboard into the full-screen game presentation the HTML
> previews define: the battle scene IS the screen, with the stone-and-gold
> pixel HUD arranged around it. Layout target = `dashboard-ui.html`
> (owner-approved phone comp); chrome = the procedural hi-fi kit
> (`assets/ui-kit.js`, S8 CELESTIAL SILVER, live in `battlefield-ui.html`);
> component inventory = `ui-style-lab.html` (UI source of truth). Decisions
> below are MADE (fx-rn-port-plan tradition) — implement them; don't
> re-litigate unless a step fails for a stated reason. Linear: milestone
> **M2.75 — Game Screen (full-screen pixel HUD)**.

## 1. What changes, in one paragraph

`DashboardScreen` today is a vertical stack of functional cards with the battle
scene as one card among many. After M2.75 the app opens into **one full-screen
stage**: the live battle scene fills the phone, and every number the cards
carried moves into pixel-art HUD chrome floating over it — top identity bar +
fuel gauge + gold boss bar, a party portrait rail, a right nav column, and a
bottom command dock whose centerpiece is the big gold **DEPLOY** button.
Detail panels (guild board, stats, settings) become slide-up sheets; overlays
(member popover with SEND RALLY, invite popover, help modal, banners, toasts)
ship exactly as designed in the style lab. **No game logic changes** — every
mutation, query, effect, and feedback event in the current screen survives
re-skinning verbatim.

## 2. The rendering decision (D1): baked assets + bitmap font — NOT a canvas port

**The problem:** `ui-kit.js` draws ~830 lines of canvas-2D `fillRect`; React
Native has no canvas. Two candidates were spiked (2026-07-15, timeboxed,
evidence over opinion):

### Chosen: bake the kit to PNGs in the browser, render them as RN Images

The kit is **fully deterministic** (integer fillRect, named palette, seeded
speckle hash — no Date, no random). So we bake every component once and the RN
app composites: **baked frame `Image` + plain `View` fills inside the wells +
`<PixelText>` from a baked font atlas**. This is exactly how
`dashboard-ui.html` already composites `#fuelfill` inside bar frame art, and
how the battle scene already plays packed sprite strips.

**Spike evidence** (`ui-export-rig.html`, committed as the pipeline seed):

- Exported 3 representative components (gold sword button 56×37, slim silver
  bar frame 144×14, portrait frame 18×18) + the full font atlas, each at
  @1x/@2x/@3x — 12 PNGs, 0.4–5.3 KB apiece.
- **Deterministic:** two fresh page loads produced byte-identical files
  (SHA-256 compared per file — all 12 matched).
- **Composite check passed visually:** a bar rebuilt from ONLY the baked PNG +
  a positioned div fill + glyph divs sampling the atlas is indistinguishable
  from the live-canvas `hifiBar` — dithered gradient, glint, speckles, label
  all intact. Tinting the white atlas produces colored text for free.
- Zero new native dependencies. The pipeline reuses the proven
  browser-generates → script-packs → generated-TS flow (`fx-anchors.js`,
  `pack-sprites.mjs`).

### Rejected: @shopify/react-native-skia port

Checked 2026-07-15 against npm (v2.8.0):

- It *is* technically compatible: peer deps `react >= 19` ✓ (19.2.3),
  `react-native >= 0.78` ✓ (0.85.3), `react-native-reanimated >= 3.19.1` ✓
  (4.3.1); v2.x is New-Architecture-only and we are New Arch.
- But the weight is disproportionate: prebuilt Skia binaries are **~216 MB
  (iOS) + ~224 MB (Android)** in node_modules, a native rebuild, and on web
  (our primary dev/verify loop) an **async CanvasKit WASM load (~25 MB
  unpacked, ~3 MB gzipped) before anything draws**, plus Metro/web setup.
- The port surface is the whole kit: ~830 lines of canvas-2D across ~30
  components re-expressed in Skia's API, then re-verified pixel-by-pixel —
  for chrome that is **~95% static**. Every dynamic part (fills, blink, ring,
  text) is trivially expressible as Views/Images (spike-proven).

Skia stays the documented fallback if a future component genuinely needs
procedural per-frame drawing. Nothing in the M2.75 inventory does.

## 3. The asset pipeline (D2)

The browser remains the renderer (same philosophy as anchor scans: the HTML
rig measures/draws, the repo scripts pack, generated files are never
hand-edited).

```
ui-export-rig.html            # the rig: draws every EXPORT_SPECS entry from
                              #   ui-kit.js, stages {name → dataURL} on
                              #   window.__EXPORTS + a DOWNLOAD button that
                              #   saves ui-export.json
        │  (open in browser → download ui-export.json)
        ▼
scripts/pack-ui.mjs           # npm run pack-ui: decodes the JSON → writes
                              #   src/ui/assets/*.png (@1x/@2x/@3x), emits
                              #   src/ui/uiMap.ts (static require map) +
                              #   src/ui/theme.ts (palette hexes, PORTRAIT_CROPS,
                              #   font metrics, state colors) — all GENERATED
        ▼
src/ui/*                      # runtime primitives consume ONLY generated files
```

- **Scale scheme:** 1 art px = **2dp** (phone scale from battlefield-ui's
  `UI_S`). Files ship as RN asset suffixes — `foo.png` (2 canvas px/art px),
  `foo@2x.png` (4), `foo@3x.png` (6) — so every device gets integer-exact
  pixels with **zero runtime scaling** (this sidesteps RN native's smoothed
  upscale entirely; the strips in the battle scene still have that iOS polish
  note, the HUD won't).
- **Never bake text or data.** Labels, costs, numbers, names all come from
  `<PixelText>` at runtime. Wells bake dark; fills overlay inside them.
- **Single source of truth stays `ui-kit.js`.** A kit change = rerun the rig +
  `npm run pack-ui`, diff the PNGs. Generated files carry the standard
  "GENERATED — regen via ui-export-rig.html, never hand-edit" header.
- Theme baked for M2.75: **S8 CELESTIAL SILVER only** (D6, §10-Q3).

## 4. Text: the pixel font in RN (D3)

- **`font_white.png` atlas** (all ~50 glyphs of the kit FONT, white, 1px gaps,
  5px tall) + generated metrics `{ glyph: {x, w}, letterSpacing: 1,
  lineHeight: 5 }`. Spike-verified.
- **`<PixelText text color scale>`**: one clipped `Image` per glyph, translated
  by `-x` — the exact `Sprite.tsx` strip technique. `tintColor` colors the
  white atlas (spike-proven via the mask twin). Memoized on
  (text, color, scale); static labels render once.
- **Variants:**
  - *Outlined* (bar labels readable on any fill): a second baked atlas
    `font_white_outlined.png` (glyph + 1px outline baked, cell w+2/h+2) — one
    image per glyph, not five stacked copies.
  - *Engraved* (button faces, kit `engrave()`): two stacked `<PixelText>`
    copies — rim-light color offset +1 art px down, dark color on top.
- All caps everywhere (the FONT has no lowercase; the kit already
  `toUpperCase()`s — carry the convention).

## 5. Dynamic sizing & dynamic state (D4)

| Need | Solution |
|---|---|
| Full-width bars (boss HP, job XP) | **3-slice bake**: left cap (radius + glint), 1-art-px middle column stretched, right cap. The hi-fi frame is horizontally uniform mid-band except speckles → speckles live on the caps only (documented fidelity delta). |
| Fixed-size chrome (buttons, badges, portraits, dots, nav) | Bake at exact art size. |
| Text-width chips / toasts / tooltips | 3-slice of their rounded faces + `<PixelText>`. |
| Bar fills (value, ghost, flash) | Plain `View`s inset in the baked well (`slim` well = {3,3,w−6,h−6}; full = {6,6,w−12,h−12}), `borderRadius ≈ 2 art px` to hug the rounded well corners. Fill = 3 stacked strips (light/mid/dark) or a single mid-color View + 1px light top strip. Ghost = red_light View from fillW→ghostW. Flash = white overlay, Reanimated opacity square wave (frame-count blink parity). Widths animate via transform, not layout. |
| Steps ring | `drawPixelRing` quantized to **33 frames (0/32…32/32)** baked as one strip; frame picked like `Sprite.tsx`. The stair-stepping is the aesthetic — 33 states are indistinguishable from continuous. |
| Pressed buttons | Face PNG is identical when pressed (hi-fi layer); shift the content overlay down 1 art px + drop the baked shadow row (bake a 1px-shorter pressed variant only if the shadow row proves visible). |
| Status dots | 4 baked variants: battling (green), winded (yellow), resting (sky), rally-me (red). |
| Portraits | Baked frame + live character sprite cropped into the well: `View overflow:hidden` + `Image` positioned by the generated `PORTRAIT_CROPS` (port `hifiPortrait`'s math 1:1 — sprites carry big transparent padding, never assume the character fills the file). |
| Rally beacon | Gold ring PNG (3 brightness variants) cycled by the kit's `BEACON_SEQ` on a Reanimated frame clock. |

## 6. Screen layout (D5) — zones per dashboard-ui, mechanics per battlefield-ui

The scene is the app's canvas: `ConnectedBattleScene` fills the stage
edge-to-edge (it already lays itself out from whatever box it gets — the
full-viewport math IS the battlefield-ui parity math). HUD floats above it
(scene FX are z60–62; HUD is z100+, kit convention).

**Scale rule:** `ART_SCALE = 2` below 430dp width, `3` at/above (tablet/web
desktop). Hierarchy comes from ART size (DEPLOY is 56 art px wide vs 18 for
nav), never mixed scales.

**Safe areas:** add `react-native-safe-area-context` (via `npx expo install`;
one native rebuild — the STR-24 loop). `topPad = max(14, insets.top)`,
`bottomPad = max(12, insets.bottom)`. Zone table (dp, phone; from the
battlefield-ui media query + dashboard-ui comp — starting values, tuned
side-by-side against the mock in the zone tickets):

| Zone | Contents | Position |
|---|---|---|
| Top bar | portrait (20 art) + name + class/job line + streak chip + shield chips ×N; right: WEEK N · DAY + boss-reset countdown; quiet CONNECT HEALTH chip when applicable | top: `topPad`, full width, scrim gradient |
| Fuel gauge | slim bar (sky fill, "FIGHTS 21H" label) + FUEL label + state chip (BATTLING/WINDED/RESTING — never red, resting is dignified) | left 14, below identity (~`topPad`+52) |
| Boss plate | boss name (gold PixelText) + "WEEKLY BOSS · TIER N" + full-width gold hi-fi bar (ghost + flash). **Bonus week:** name swaps to crowned form, bar becomes the ACCUMULATING meter with tier ticks + "N TO ×1.2" label (battlefield-ui's `__setBonusHud` is the working prototype); boost chip when a boost is active | centered, top ~`topPad`+56 |
| Party rail | horizontal portrait row (18 art tiles): fuel sliver under each, status dot, rally beacon on resting mates, **invite slot** (+) at the end. Tap → popover | centered, top ~`topPad`+146 |
| Right nav | 3 silver buttons (18 art): guild banner → guild sheet, chart → stats sheet, ? → help modal | right 9, top ~`topPad`+146 |
| Bottom dock | left: COLLECT (star button + green `+N` pending chip + label). center: **DEPLOY** (gold 56×37 art, crossed swords + gem + energy cost inside the face, streak ×N.NN chip riding the corner, first-crit hint below, first-deploy pulse). right: steps ring (33-frame strip + today/goal numbers + GOAL ✓ chip). above center: Overdrive slim bar (62% → glowing ACTIVATE at 100%, countdown while active) | bottoms: dock 46, collect/ring 62, OD ~152 |
| Job strip | job badge roundel (number) + full-width slim XP bar ("12,000 / 25,000 XP") | bottom `bottomPad` |

**Party rail is horizontal, not the mock's left column** — battlefield-ui
already made this reversal with evidence ("a vertical column covered the party
sprites", battlefield-ui.html:49). Names/damage live in the tap popover; the
resting-mate rally beacon + red dot carry the at-a-glance signal. (§10-Q2.)

## 7. Panels → HUD / sheets / overlays (what happens to each current card)

| Current card (DashboardScreen) | Becomes |
|---|---|
| Title + guild name | gone (identity in top bar; guild name in guild sheet) |
| Battle scene card | THE screen |
| Player identity card | top bar |
| Fuel card | fuel gauge + state chip |
| Meters card (Job XP, Energy) | XP → job strip; Energy → the number inside DEPLOY; full detail in stats sheet |
| Boss card (incl. bonus meter, boost chip) | boss plate |
| Deploy card | DEPLOY button |
| Overdrive card | OD bar + ACTIVATE |
| Idle combat card | COLLECT button + pending chip; rate detail in stats sheet |
| GuildBoard | **slide-up sheet** (guild nav button): roster, contributions, recognition badges, rally surface — content unchanged, chrome re-skinned |
| Steps card | steps ring; history detail in **stats sheet** (+ meters detail, idle rate) |
| CONNECT HEALTH chip | stays — quiet chip in the top bar area, same behavior |
| DevPanel | **stays dev-styled, untouched** — behind a small DEV chip (bottom sheet), `DEV_FLAGS.showDevPanel` as today |

Sheets are plain RN animated Views (translateY spring, scrim tap-to-close) —
no navigation library; there is one screen.

**Interaction map** (all already designed in the previews):

- Tap party-rail portrait → member popover (name/class, state, steps today,
  dmg week, streak, fuel) + **SEND RALLY 500** on resting mates (wired to the
  existing `rally` mutation + toast).
- Tap invite slot → invite popover (guild code + COPY CODE → toast).
- Tap ? → help modal (HOW TO PLAY, close X + OK).
- Tap a hero **in the scene** → that hero's ultimate (existing scene behavior,
  unchanged — scene taps and rail taps are distinct surfaces).
- Scrim/outside tap closes any popover/sheet (battlefield-ui convention).

## 8. Feedback layer re-skin

`FeedbackProvider`'s event API and all emit sites are **untouched**. Only the
presentational components swap chrome:

- `Banner` → `hifiBanner` (gold engraved face) — JOB UP!, BOSS FALLS!,
  CROWNED RISES, OVERDRIVE!, rally received, boost reward.
- `Toast` → `hifiToast` (dark chip) — incl. every `friendlyError()` rejection.
- `FloatingNumber` → `<PixelText>` outlined numbers (scene damage numbers are
  already the scene's own; this is the overlay layer).
- `AnimatedHPBar`/`AnimatedMeter`/`OverdriveMeter`/`BonusMeter`/`DeployButton`
  logic (springs, diffing, gating, hints) is REUSED — only their render
  swaps to baked chrome.

## 9. Migration strategy (D8) — the working app never breaks

1. Everything lands behind **`DEV_FLAGS.useGameScreen`** (default `false`).
   `App.tsx` picks `GameScreen` vs `DashboardScreen` by the flag.
2. First, extract DashboardScreen's ~10 data/effect hooks (dashboard query,
   auto-collect, rally-seen, boost-banner, teaching, ensureSession, health
   sync, busy/error state, action handlers) into **`src/game/useGameEngine.ts`**
   consumed by BOTH screens — behavior cannot fork while both exist.
   DashboardScreen's diff in that step is mechanical extraction only.
3. Zone tickets build inside GameScreen; the old screen ships unchanged the
   whole time (every intermediate commit is releasable).
4. The closing verify ticket runs the full E2E **through the new screen**, then
   flips the default. DashboardScreen stays behind the flag for one milestone
   as the fallback; deletion is an M4 cleanup line.

## 10. Open questions for Neel — RESOLVED 2026-07-15

1. **Guild board → SLIDE-UP SHEET.** Roster + recognition badges + rally live in
   one panel behind the guild nav button (recommended path). §7 already reflects
   this.
2. **Party rail → NAMES HIDDEN UNTIL TAP** (battlefield-ui pattern). Portrait +
   status dot + rally beacon carry the at-a-glance signal; names/stats live in
   the tap popover. §6 already reflects this.
3. **Per-class HUD themes → SHIP S8 CELESTIAL SILVER FOR ALL now; theme-follows-
   your-class deferred to the roadmap** (Neel's confirm pending but not blocking
   — build S8 only; per-class is a pure pipeline rerun later, no code change).
4. **Onboarding re-skin → OUT of M2.75** (own follow-up milestone; §11). The
   verify ticket (STR-71) must re-run the onboarding smoke path to confirm no
   regression.
5. **Steps-ring goal-hit glow → BUILD IT NOW** (departure from the original
   "defer to juice-later" recommendation — owner decision 2026-07-15). The
   glow is IN SCOPE for STR-68 (command dock / steps ring): when today's steps
   ≥ the daily goal, the ring gets a celebratory glow treatment (in addition to
   the GOAL ✓ chip + existing banner). Keep it Reanimated-driven (no per-frame
   React re-renders, per §12) — a pulsing outer-glow / bloom on the ring, tuned
   against the dashboard-ui mock. Timings/colors go in `src/config/assets.ts`
   so it's a one-place tune.

## 11. Onboarding re-skin scope — OUT (recommendation)

`onboarding-ui.html` already comps all 14 beats in the kit style, but M2.75's
risk is the pipeline + the one screen everyone lives in. The onboarding
screens are functional, verified (STR-50), and seen once per account. Ship
M2.75 with primitives built **screen-agnostic** (`src/ui/*` imports nothing
from `src/game/`), then a small follow-up milestone re-skins onboarding
mechanically against the existing comp. Nothing in M2.75 may regress the
onboarding flow (the verify ticket re-runs its smoke path).

## 12. Perf rules (carried over + new)

- **No per-frame React re-renders**: fills/blinks/beacons/ring on Reanimated
  shared values; DevPanel RENDER COUNT stays flat while bars animate (the M2
  acceptance bar).
- Baked chrome is bundled via static `require` (Metro inlines; no runtime
  fetch); web prefetches the uiMap at boot alongside the sprite prefetch.
- `<PixelText>` memoized; dynamic labels re-render only on string change.
- Projectile cap (~8) and per-roster strip prefetch unchanged.
- Total HUD asset payload is trivial (spike: 12 files ≈ 19 KB; full inventory
  well under 1 MB including @3x).

## 13. File plan

```
ui-export-rig.html            # rig (spike file grows the full inventory)
scripts/pack-ui.mjs           # JSON → PNGs + generated TS
src/ui/
  assets/…                    # GENERATED baked chrome (@1x/@2x/@3x)
  uiMap.ts                    # GENERATED static require map
  theme.ts                    # GENERATED palette/crops/metrics/state colors
  PixelText.tsx               # atlas text (+ outlined/engraved variants)
  Frame.tsx  Bar.tsx  Button.tsx  Chip.tsx  Badge.tsx
  Portrait.tsx  StatusDot.tsx  Ring.tsx  Sheet.tsx  Popover.tsx  Modal.tsx
src/game/
  useGameEngine.ts            # extracted data/effects/actions (shared)
  GameScreen.tsx              # the full-screen assembly
  zones/  TopBar.tsx  FuelGauge.tsx  BossPlate.tsx  PartyRail.tsx
          RightNav.tsx  CommandDock.tsx  JobStrip.tsx
  sheets/ GuildSheet.tsx  StatsSheet.tsx
```

## 14. Implementation order (each step independently verifiable — the tickets)

1. **Pipeline**: full EXPORT_SPECS inventory in the rig + `pack-ui.mjs` +
   generated assets/uiMap/theme. Verify: idempotent, deterministic, counts.
2. **Primitives** (`src/ui/*`) + a dev-only gallery screen. Verify: browser
   side-by-side vs `ui-style-lab.html` at 2x/3x.
3. **GameScreen shell**: flag, `useGameEngine` extraction, full-screen scene,
   safe-area/scale system, empty zones. Verify: old screen byte-identical
   behavior; new screen shows the live scene full-bleed.
4. **Top HUD** (top bar, fuel, boss plate incl. bonus/boost).
5. **Command dock + job strip** (DEPLOY, collect, ring, OD, XP).
6. **Party rail + right nav + popovers + sheets**.
7. **Feedback re-skin** (banner/toast/floating numbers).
8. **Verify E2E + flip the flag** (STR-16/59 tradition).

## 15. Explicitly deferred

- Per-class HUD themes (S1–S10 kits) — pipeline rerun, data not code.
- Onboarding re-skin (own milestone; comp exists).
- Sound, haptics, screen-shake beyond existing, goal-hit glow pass.
- Boss-name/variety art, evolution animations in-scene.
- Deleting DashboardScreen (M4 cleanup, after a milestone of fallback duty).
