# Party Sprites Manifest

All sprites: PixelLab v3, 64px, side view, facing right (east). 8 directions each.
Style: stylized semi-heroic, selective outline, high detail, cohesive palette.
Folder layout: `characters/<class>/<jobN_name>/<direction>.png`
Directions: south, east (right-facing — battle pose), north, west, + 4 diagonals.

Job ornateness: 1 = humblest starter gear → 5 = legendary/most ornate. Job 4 = original batch.

## Animations
Animations live under `<class>/<job>/animations/<type>/frame_000.png …` (play order).
All rendered on the **south** angle = front-3/4 facing right (toward the boss).

Types:
- `idle/`       — breathing idle (4f). All 40 characters.
- `attack/`     — weapon-specific attack; flashiness + frames scale by rank
                  (job 1/2 ≈ 7-9f, job 3 ≈ 9f, job 4 ≈ 11-13f). All 40.
                  Job 5 = epic 17f FLURRY ultimate (multi-hit + explosive finish) for every class.
                  (Warlord keeps its attack + has the bonus `special/`.)
- `evolution/`  — level-up transformation (power-up glow, weapon raised, 13f).
                  Jobs **1-4 only** (the advance to the next rank). 32 total.
- `special/`    — class-themed ULTIMATE move (generated 2026-07-11). ALL 40 jobs:
                  job 5 = 17f, jobs 1-4 = 13f. One choreography per class (warrior
                  spin-slash, mage arcane channel, medic divine burst, archer volley,
                  assassin dagger flurry, paladin radiant smash, warlock fire eruption,
                  bard crescendo).
- `rest/`       — Resting fuel-state loop (generated 2026-07-13). ALL 40 jobs, 6f.
                  Battlefield kneel: hero drops to one knee, weapon planted/lowered
                  (warrior/paladin plant the blade/hammer, mage/medic/warlock lean on
                  the staff, archer grounds the bow, assassin lowers daggers, bard
                  cradles the instrument), slow breathing loop. TONE GUARDRAIL: reads
                  as "catching breath / taking a knee" — dignified, alive, recoverable;
                  never dead, collapsed, or defeated. Supersedes the campfire concept
                  (user decision 2026-07-13, STR-38).

Counts: 40 idle + 40 attack + 32 evolution + 40 special + 40 rest.
Preview: open `walking-app/preview.html` for the sprite gallery, `battlefield-ui.html`
for the live battle scene (all attacks + specials firing), or `fx-test.html` to trigger
any class/job's basic or special on demand.
Attack prompts are weapon-specific (see scratchpad attack_prompts.md).

Status: all 40 jobs complete (idle/attack/evolution + special + rest, all valid).

## Attack VFX (`assets/effects/<class>/`)
Per class (all 8): `basic/` 5f projectile loop (64px), `special/` 5f ultimate
projectile loop (96px), `impact/` 7f one-shot burst (64px), all PixelLab
sidescroller objects tagged `sq-vfx-*` in the library. Weapon-tip anchors and
release frames are pixel-measured per job into `assets/fx-anchors.js` (attack)
and `assets/fx-special-anchors.js` (special); the shared choreography engine is
`assets/fx-engine.js`. Verified 2026-07-11: all 40 jobs × basic+special fly
straight from the weapon tip to the boss with impact + damage number, zero 404s.

### Warrior (steel / blue-gold)
- 1_rookie    `95abc995-83d1-41f8-a07a-2c973be024cd`
- 2_strider   `a992f21c-9cfd-444a-ab69-825260445d88`
- 3_vanguard  `4b974594-7e89-4651-b116-c8b62c41d263`
- 4_champion  `d06ccab5-eedb-48ad-9045-4e6047992f81` (original)
- 5_warlord   `dc69695c-90eb-4cab-8a46-cf3dc274a82a` (regenerated v2)

### Mage (purple / blue)
- 1_apprentice `66bbcd5a-97d3-4554-9a7d-737eb5f8809d` (v3, female)
- 2_adept      `33ab96f8-756b-4699-9790-a8906c021d67`
- 3_conjurer   `f0333b61-0ab4-4ddd-adda-aff685a3f527`
- 4_sorcerer   `ab300caf-dcb1-4571-ad24-a3fc1d7592f2` (original)
- 5_archmage   `bcdb09bd-bfb0-44c4-beed-cfcf3ec26c3d` (regenerated v2)

### Medic (white / emerald-gold)
- 1_acolyte    `3ed2d645-2082-46e9-adb0-acc492a23fc6`
- 2_healer     `c2baf0d0-f872-40f3-a990-7b3471ddaa50`
- 3_cleric     `f7766f91-3c75-4873-9508-9b039fb216a5` (v3, simpler + angle fixed)
- 4_priest     `f72f6a0d-6566-4efa-ab9c-d0d514e20a73` (original)
- 5_hierophant `d57b08ee-818d-4327-8f6d-f7ff0313d6b7`

### Archer (green / brown leather)
- 1_greenhorn `ddf492af-cada-4b85-bd97-12d843243817`
- 2_scout     `b8613073-5469-43fb-993c-dbd58f2688a5`
- 3_hunter    `35ff282e-96d0-4c7e-aea0-b808ef520b47` (v3, fancier)
- 4_ranger    `11315366-10f0-4dbe-893b-d6e7173147a6` (reuses old Sentinel design)
- 5_sentinel  `2ae9a5e9-80c1-446d-9e93-ebbc793cb5c4` (v3, epic celestial)

### Assassin (charcoal / crimson)
- 1_footpad    `683de266-ff8b-443e-a302-be30ed21b8ae`
- 2_prowler    `5d005490-befa-4dda-8a87-61bbeb36dbeb`
- 3_nightblade `a9b830b7-1066-47f1-a778-4240d3d337ba` (reuses old job-4 design)
- 4_assassin   `0b914f28-1257-40ce-946d-cc5b529449cb` (v3, elite mid-tier)
- 5_shadowlord `0f464b0e-1dbd-4127-ba1e-6377271bd60f`

### Paladin (silver / gold-white)
- 1_squire       `b4393ed1-0109-45d4-8b7b-39243302263a` (v3, male, no armor)
- 2_knight       `f814c6c0-bd8b-4ed8-94a1-38f573ae2533` (v3, warhammer)
- 3_crusader     `550ac8b8-b9c9-4eaf-b501-552ab8d940c5`
- 4_paladin      `2b3b920b-3b1c-45f1-a66d-be712adc3fe0` (original)
- 5_lightbringer `5920e02a-5a0b-4221-b274-1748a3289a0b` (regenerated v2)

### Warlock (black / violet, green flame)
- 1_initiate  `bcd0a00c-a7d5-4945-aef6-611209aa38f3`
- 2_cultist   `dcfaba9d-3ff9-45fd-87da-9a8e6516da5c`
- 3_hexer     `7a0c6264-4126-4ee2-9df1-aad462be0973`
- 4_warlock   `c8dd8b4f-0736-4ef5-aef5-72d4a8efb4d0` (original)
- 5_dreadlord `99c95092-f348-4583-b93d-2525fe882bbc` (regenerated v2)

### Bard (teal / burgundy-gold) — instruments escalate: flute → lute → harp → golden lyre → magical orchestra
- 1_busker     `48b0c806-f541-45e3-aa0d-bd730ff18695` (v2, wooden flute)
- 2_minstrel   `f278e2ce-0f21-44ca-b877-c41199950b0f` (v2, wooden lute)
- 3_troubadour `f5628f50-a824-4374-85b9-f0652e7f5f0d` (v2, carved harp)
- 4_bard       `9d83d2f7-731d-44e0-bee0-4beb81bfd12f` (v2, golden lyre)
- 5_maestro    `7dcbe849-4b63-4528-9d47-e13fd503e23d` (v2, magical multi-instrument orchestra)

## Bosses (`characters/bosses/`)
SPEC: bosses are generated at **256x256** — PixelLab's animatable max (`create_1_direction_object`
view `sidescroller`, animated via `animate_object`). Face **left** (boss anchored to the right edge
of a vertical mobile screen, heroes on left, ~50% cut off — Pianus/MapleStory style).
Upscale 2x nearest-neighbor → 512px for display (keeps animation crisp).
400px `create_map_object` is bigger but STATIC (no animation).

- `armored_cat_256/`         — 256px werecat boss, facing left: `static.png` + `idle/` (9f). Animatable. ← canonical boss format
- `horse_256/`               — 256px "THE NIGHTMARE" humanoid horse boss, facing left: `static.png` + `idle/ idle_alt/ hurt/ attack/` (9f each). PixelLab object `be4ea610-3e8a-4538-bfa8-3448e069812f`.
- `horse_crowned_256/`       — BONUS FORM (M1.5 victory week): crowned/corrupted horse_256 — same pose, near-black hide, ember eyes, jagged crown. `static.png` + `idle/ hurt/` (9f each). Generated as a PixelLab STATE of the horse object (`create_object_state` keeps identity) → object `b3f020dc-baa9-42fb-a6e1-c8eae95a4509`. Convention: every future boss gets a `<boss>_crowned_256` bonus form.
- `armored_cat_colossal_400_left.png` — 400px static, facing left (max size, no animation)
- `armored_cat_colossal_400.png`      — 400px static, front-facing
