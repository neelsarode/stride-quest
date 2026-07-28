# STR-91 — Job-1 proportion regen test (READY TO FIRE after PixelLab renewal)

**Blocked 2026-07-20:** subscription expired 2026-07-19; 4,200 generations frozen
until renewed at pixellab.ai/account. Everything below is prepared — run as-is.

## Why (measured on job1-regen-compare.html)

Job-1 sprites are the SAME height as job-5s (58–62 art px) but their bodies are
much narrower (unarmored), so the un-shrunk head dominates → they read chibi /
physically bigger. Mage 1_apprentice's bare head is literally wider (+13%) than
her job-ups' hatted heads. Fix = proportion language in the prompt (v3 IGNORES
the `proportions` param — description only).

## The three calls (mcp__pixellab__create_character)

Shared params: `mode:"v3"`, `view:"side"`, `size:88` (→ ~124px canvas, matches
existing), `outline:"selective outline"`, `detail:"high detail"`,
`n_directions:8` (v3 always 8).

Shared proportion suffix for every description:
`"small head, semi-realistic heroic proportions, head about one fifth of total
height, slender adult build, NOT chibi, matching the proportions of an armored
RPG hero"`

1. **Warrior 1 Rookie v2** — "young rookie warrior with a plain short sword and
   simple blue tunic, light leather bracers, steel and blue-gold palette,
   humble starter gear, pixel art RPG hero facing right, " + suffix
2. **Mage 1 Apprentice v2** — "young female apprentice mage in a plain blue
   robe holding a simple wooden staff, purple and blue palette, humble starter
   gear, pixel art RPG hero facing right, " + suffix
3. **Archer 1 Greenhorn v2** — "young greenhorn archer with a simple shortbow
   and quiver, plain green tunic and brown leather, humble starter gear, pixel
   art RPG hero facing right, " + suffix

## After generation

1. `get_character` until completed (~2–8 min; jobs may stick at 95% — wait, do
   not requeue before ~30 min; silent failures → re-issue the same call).
2. Download the **south** rotation PNG into
   `characters/_job1_regen/<class>/south.png` (curl the rotations.south URL).
3. Open `job1-regen-compare.html` (serve repo root over http) — NEW J1 slots
   fill automatically; check height ≈ 60, H/B ratio ≈ J2's, head no longer
   dominant.
4. On user approval → full regen ticket: all 8 classes, 8-direction download,
   idle/attack/special/evolution/rest re-animation, `fx-test.html?scan=1`
   anchor rescan + `?verify=1` 80/80, `npm run pack-sprites` for the RN app,
   MANIFEST update. (~65+ gens/class — budget check first.)

## Rejected approaches

- `proportions` param presets/custom: **standard mode only** — quality/style
  mismatch vs the v3 originals.
- `create_character_state` on the existing job-1s: states restyle outfits, not
  skeleton proportions.
