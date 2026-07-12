# Porting the battle FX engine into the React Native app

> Written 2026-07-12. This is the execution plan for replacing the placeholder
> visuals in the RN app with the real battle scene proven in
> `battlefield-ui.html`. Decisions below are MADE — implement them; don't
> re-litigate unless a step fails for a stated reason.

## What we're porting

The HTML preview proves: 8-hero party vs. boss, per-class basic + special
attacks (character anim → projectile from measured weapon tip → straight
flight → impact + flash + damage number), job-tier swapping, boss auto-scale.
All choreography is data-driven by `assets/fx-anchors.js`,
`assets/fx-special-anchors.js`, and `CLASS_FX` in `assets/fx-engine.js`.

The RN version must be driven by **real Convex events** instead of a timer:
the existing feedback layer (`src/feedback/*`, `useGameEvents`) already diffs
the reactive dashboard snapshot into semantic events — the battle scene is a
new, fancier consumer of those same events.

## Decisions (with reasons)

### D1. Spritesheet strips, generated at build time — not 4,000 loose PNGs
The repo has ~4,300 frame PNGs. Bundling them individually via Metro is a
nonstarter (bundle bloat, per-file decode, `require()` can't take dynamic
paths). Instead: a Node script packs **one horizontal strip PNG per
animation** + one JSON manifest.

- Script: `scripts/pack-sprites.mjs` using `sharp`. Input: the existing frame
  dirs (they stay in the repo as source of truth). Output:
  `src/assets/sprites/<class>_<job>_<anim>.png` and
  `src/assets/sprites/manifest.json`
  (`{ "warrior/5_warlord/attack": { frames: 15, w: 128, h: 128, file: "warrior_5_warlord_attack.png" }, ... }`).
- Also pack `assets/effects/<class>/{basic,special,impact}` the same way
  (24 strips) and the boss idle.
- Frame sizes are 64–128px; a 17-frame 128px strip is 2176×128 — trivially
  small. Total sprite payload ≈ a few MB. Fine to bundle; no CDN needed for MVP.
- A static `spriteMap.ts` is ALSO generated (`export default { 'warrior/5_warlord/attack': require('./sprites/warrior_5_warlord_attack.png'), ... }`)
  because Metro requires static `require()` calls.

### D2. Animation driver: Reanimated shared values, zero React re-renders
Do NOT drive frames with `setState` (8 heroes × 12fps = re-render storm).

- **Frame stepping**: a sprite component = `View` (fixed frame size,
  `overflow:'hidden'`) containing the strip `Image` translated by
  `-frameIndex * frameWidth`. `frameIndex` is a Reanimated shared value driven
  by `withRepeat(withTiming(...), ...)` for loops, or a one-shot sequence for
  attack/special, all on the UI thread.
- **Projectile flight**: `withTiming(translateX, { duration, easing: linear })`
  — same constant-px/ms feel as the preview (`speedPxMs 1.5`, clamp 120–320ms).
- **Release-frame sync**: don't try to observe frame index from JS. Compute the
  release time (`release / fps` seconds) and `setTimeout` the projectile spawn;
  drift of ±1 frame is imperceptible (verified acceptable in the HTML version,
  which uses the same decoupling).
- Damage numbers / flashes: Reanimated too; boss flash via opacity overlay
  (RN has no CSS `brightness()` filter — use a white `View` overlay masked by
  the boss image... simplest robust approach: a second copy of the boss image
  tinted with `tintColor:'#fff'`, opacity animated 0 → .7 → 0 for 120ms).

### D3. Geometry: port the anchor math 1:1, replace rect reads with onLayout
- Convert `fx-anchors.js` / `fx-special-anchors.js` into generated TS
  (`src/battle/anchors.ts`) — same numbers, same "GENERATED, rescan don't
  hand-edit" header. Regeneration stays in the HTML rig (`fx-test.html?scan=1`).
- Positions: same layout constants (PARTY_BASE 22%, PARTY_STEP 5%, COL_L/COL_R,
  PARTY_DX/DY, boss bottom 22% + auto-scale rule). Capture hero/boss frames via
  `onLayout` into refs; spawn/target math is identical to
  `fx-engine.js#fireProjectile` (visible-pixel anchors, `minTravelPx` clamp).
  **Do not use view bounds as spawn/target directly — that's the
  flying-backwards bug the anchors exist to prevent.**

### D4. File plan

```
src/battle/
  anchors.ts          (generated: attack + special anchors)
  spriteMap.ts        (generated: static require map)
  sprites/…           (generated strips + manifest.json)
  Sprite.tsx          (strip player: {animKey, fps, loop, playKey, onDone})
  Projectile.tsx      (spawn → fly → impact, one mount per shot)
  DamageNumber.tsx
  Fighter.tsx         (idle/attack/special state machine ≙ makeFighter())
  Boss.tsx            (idle loop + auto-scale + hit flash)
  BattleScene.tsx     (party layout + boss + event wiring)
  fxConfig.ts         (CLASS_FX port: angles, fps, speeds, scales)
```

### D5. Event wiring (the point of the whole thing)
`BattleScene` subscribes to the existing game-event stream:
- `deploy` (self) → your fighter's **special** with the real damage number.
- `teammateDeploy` → that teammate's basic/special by size.
- `idleCollect` → a quick basic-attack volley from the whole party.
- `bossDefeated` → existing banner + victory lap keeps working (feedback layer
  untouched; the scene is additive).
Party composition comes from the guild roster (class per member; job from
weekly progression). MVP ships warrior-only per CLAUDE.md — the scene must not
assume 8 classes on screen; it renders whatever the roster provides.

### D6. Verify in the browser first, always
The whole scene must run under `react-native-web` (`npm run web`) — no native
APIs are involved. That keeps the Playwright verification loop from the HTML
era: drive the dev-panel injectors, watch the scene, screenshot. Only after
web-verified, check the iOS Simulator.

## Implementation order (each step independently verifiable)

1. `scripts/pack-sprites.mjs` + generated manifest/spriteMap/anchors.ts.
   Verify: script idempotent, counts match (40 idle/attack/special, 24 effects,
   1 boss), spot-open two strips.
2. `Sprite.tsx` + a throwaway dev screen rendering one idle loop.
   Verify in browser: warlord idles at 6fps, no re-renders (React DevTools).
3. `Fighter.tsx` + `fxConfig.ts` + `anchors.ts`: attack plays, `onRelease`
   fires at the right moment. Verify: log timestamps ≈ release/fps.
4. `Projectile.tsx` + `Boss.tsx`: full basic-attack choreography vs. static
   boss. Verify: straight flight, impact at chest, flash + number.
5. `BattleScene.tsx` with hardcoded 3-hero party on a timer (parity with the
   HTML preview). Verify visually side-by-side with `battlefield-ui.html`.
6. Swap the timer for real events behind the existing `FeedbackProvider`;
   wire deploy/collect/teammate events. Verify with dev panel: inject steps →
   DEPLOY → your hero ults the boss; `simulateTeammateDeploy` → teammate fires.
7. Replace/absorb the placeholder HP bar area of DashboardScreen with the
   scene (HUD stays the stone+gold components).

## Perf risks & mitigations

- **First-play decode jank**: prefetch all strips for the on-screen roster at
  scene mount (`Asset.loadAsync` / `Image.prefetch`); strips are small.
- **Too many mounted projectiles**: cap concurrent projectiles (~8); the
  preview never exceeds that naturally.
- **Old-arch RN**: not a concern — app is already New Architecture (Nitro).
- **Memory**: all strips together < 30MB decoded worst case; per-roster
  prefetch keeps it far lower. Revisit only if profiling says so.

## Explicitly deferred

- Sound, screen-shake beyond the existing translate bump, hit-stop.
- Per-job projectile tint/scale variety.
- Boss variety beyond the horse (spec in MANIFEST: 256px, faces left,
  `create_1_direction_object` sidescroller + `animate_object`).
- Evolution (job-up) animations in-scene — they exist as frames already.
