---
name: generate-vfx
description: Generate pixel-art battle VFX (projectiles, impacts) and character animations with PixelLab for Stride Quest, and wire them into the preview FX engine. Use when adding/regenerating attack effects, ultimates, character animations, or bosses. Contains hard-won operational knowledge about PixelLab's queue, failure modes, and download quirks — read fully before calling any mcp__pixellab__* tool.
---

# Generating battle VFX & character animations (PixelLab pipeline)

This is the verified recipe used to build the per-class attack VFX and all 40
character `special/` animations (2026-07-11). Follow it exactly; the LANDMINES
section is why.

## Where everything lives

| Thing | Path | Contract |
|---|---|---|
| Projectiles/impacts | `assets/effects/<class>/{basic,special,impact}/frame_00N.png` | basic 5f (64px), special 5f (96px), impact 7f (64px) |
| Character anims | `characters/<class>/<job>/animations/<type>/frame_XXX.png` | idle 4f, attack 7–17f, special 13f (jobs 1–4) / 17f (job 5) |
| Attack anchors | `assets/fx-anchors.js` | GENERATED — regenerate via `fx-test.html?scan=1`, never hand-edit |
| Special anchors | `assets/fx-special-anchors.js` | GENERATED — same |
| Choreography engine | `assets/fx-engine.js` | per-class config in `CLASS_FX` (projectile rotation angles live here) |
| Character IDs | `characters/MANIFEST.md` | all 40 job character UUIDs + boss spec |
| QA rig | `fx-test.html` (serve repo root, e.g. `python3 -m http.server 8811`) | `?verify=1` runs the 80-attack self-test; `?scan=1` regenerates anchor JSON |

## Costs (subscription generations)

- `create_1_direction_object`: **20** (any size). Size ≤85px → 16-candidate review pack; ≤170 → 4; larger → 1.
- `animate_object` v3: **~1**. Never use `mode:'pro'` (20–40).
- `animate_character` v3, south only: **3–4** (frame_count 12 → 3, 16 → 4).
- Full per-class VFX set (proj+special+impact objects + 3 anims) ≈ **65**.

## Pipeline A — new projectile / impact object

1. `create_1_direction_object` — `view:'sidescroller'`, size 64 (basic/impact) or
   96 (special). Description pattern that works: *"<thing>, <class palette
   colors>, flying to the right, pixel art game VFX, transparent background"*
   (impacts: *"...flying outward, radial pixel art hit effect VFX..."*).
   Palettes are in MANIFEST (e.g. warrior steel/blue-gold, warlock black/violet
   + green flame).
2. Wait for `review` status (~1–8 min), `get_object` to see candidates inline.
   Pick a primary + one backup; `select_object_frames(indices=[primary,backup])`
   with a `common_tag` like `sq-vfx-<class>-<kind>`. Each index becomes its own
   object; animate only the primary.
3. `animate_object` v3 on the selected object: projectiles `frame_count: 4`
   (stores 5 = ref+4, matches engine), impacts `frame_count: 6` (stores 7),
   loop description for projectiles ("subtle looping shimmer in place"),
   one-shot for impacts ("exploding outward then dissipating, shrinking and
   fading to nothing at the end").
4. **Download**: call `get_object` again and read the animation's frame URL —
   the URL contains a per-animation UUID that is **NOT** the `group:` id
   returned when you queued it. Pattern:
   `https://backblaze.pixellab.ai/file/pixellab-characters/objects/<team>/<objid>/animations/<ANIM_UUID>/unknown/<i>.png`.
   curl frames into a temp dir first, only swap into `assets/effects/...` when
   all frames fetched (a partial set breaks the preview).
5. If the art faces the wrong way, don't regenerate — set a rotation angle in
   `CLASS_FX` in `assets/fx-engine.js` (warrior's crescent uses `-30`).

## Pipeline B — new character animation (e.g. `special/`)

1. Character UUIDs are in MANIFEST. `animate_character` v3, **south direction
   only** (all battle anims render on south = front-3/4 facing right),
   `animation_name:'special'`, action_description = movement only, no scenery.
   One shared description per class keeps the set coherent.
2. **Download via the ZIP endpoint**, not per-frame URLs:
   `https://api.pixellab.ai/mcp/characters/<char_id>/download` (returns 423
   while jobs are pending — use `curl -sfL`). Inside:
   `<Name>/animations/special/south/frame_000.png…` already correctly named —
   copy straight into `characters/<class>/<job>/animations/special/`.
   A reusable installer script pattern: unzip to temp, `find` the
   `animations/special/south` dir, `cp frame_*.png`, report OK/NOSPECIAL.
3. After installing, regenerate anchors: open `fx-test.html?scan=1`, wait for
   the panel, paste the two JSON blocks into `assets/fx-anchors.js` /
   `assets/fx-special-anchors.js` (keep the header comments).

## LANDMINES (all hit in production — do not rediscover)

- **10 concurrent jobs max, account-wide**, shared by object creations, object
  anims, and character anims. Queue in waves; expect `rate limit exceeded
  (10/10)` errors and just retry the same call next wave. Waves of ~3–5 min.
- **Jobs stick at "95% ~0s" for 10–40 min** under server load. They almost
  always complete eventually — do NOT delete/requeue before ~30 min.
- **Jobs fail SILENTLY.** A character can return to `completed` status with no
  new animation and no error surfaced (or a `failed jobs:` line mentioning
  psycopg / TooManyConnections / connect-call-failed). Detection: object shows
  no `1anim` marker in `list_objects`, or the character ZIP has no `special/`
  folder. Fix: re-issue the identical `animate_*` call — retries are free-ish
  and usually succeed. Some "failures" later report `already complete`; that
  means it actually finished — just download it.
- **`select_object_frames` leftovers**: non-selected candidates stay in a
  review object in the library; harmless, ignore.
- **Verify after download**: open `fx-test.html?verify=1` and wait for the
  green `PASS — 80/80` line (~4 min). Expect exactly one favicon 404.
  `?scan=1` intentionally produces one 404 per animation directory (it probes
  past the last frame to count) — those errors are normal.

## Engine invariants (why the code looks like it does)

- Projectiles spawn at the **visible weapon-tip pixel** (measured, per job) and
  fly **dead straight** at constant speed (`speedPxMs`) to the boss chest
  (`bossChestX` fraction), clamped to always travel ≥`minTravelPx` rightward —
  canvas boxes include transparent padding and MUST NOT be used as spawn or
  target points (that bug ships projectiles flying backwards on narrow screens).
- VFX are **per class, shared across the 5 jobs** (budget decision, user
  approved 2026-07-11). Per-job variety comes from job-specific anchors and,
  later, cheap tint/scale — not new art.
- Boss auto-scales in `battlefield-ui.html` so his visible head is never below
  the back-row hero's head (`sizeBoss()`).
