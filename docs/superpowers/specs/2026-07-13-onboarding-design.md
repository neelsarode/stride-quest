# Stride Quest — New-User Onboarding Plan (Milestone "M2.5 — Onboarding")

## Context

Stride Quest is a co-op step RPG for a 3–8 person friend group, but today the app has **no onboarding**: anonymous auth silently mints `Hero-XXXX`, bootstrap auto-creates a solo "My Guild" before the user gets any say, and the new user lands on an already-in-progress game with zero explanation — and **no way for real friends to join the same guild** (the co-op premise is impossible outside dev tools). HealthKit permission hides behind a buried button; the hero name can't be changed; dev copy leaks into the guild board.

This plan defines the first-session experience for the M4 TestFlight moment and closes the guild-joining gap. **Goal: icon-tap → *your* chosen hero, named, in a guild with friends, landing a hit on the boss — under 90 seconds, zero accounts, zero paywalls, zero lectures.** Onboarding is the game's opening scene (real battle scene, real backend state), not a slideshow.

**Decisions made with the owner (2026-07-13):**
1. "Choose your hero" across **all 8 classes** (art + VFX complete; supersedes the warrior-only MVP call — update CLAUDE.md §5).
2. Guild joining via **6-character invite code** in onboarding; code also lives on the guild board.
3. New milestone **after M2** (first impression should be the real battle scene). Tickets created now.

**Binding guardrails** (docs/superpowers/specs/): first session never shows a resting hero (24h starter tank); zero monetization surfaces; teaching rides the semantic-event feedback pipeline, contextual not lecture; Overdrive/Rally/Shields self-defer by design; cozy, never punitive, no red UI.

---

## The Flow (5 beats, no router — a state machine in App.tsx routed by SERVER state)

Routing derives from the DB (`viewer.class` → membership → `onboardedAt`), so the flow is resume-safe by construction: kill the app anywhere, it reopens at the right beat.

**Beat 0 — Summoning.** The existing invisible anonymous sign-in; the spinner becomes a title card (battlefield bg + STRIDE QUEST wordmark + "Summoning your hero…"). <2s, nothing to tap.

**Beat 1 — Choose your hero.** One screen: big stage playing the selected class's job-1 idle (M2's `src/battle/Sprite.tsx` strip player), 8 tappable portraits below, class accent color shifts per pick. **Name field on the same screen** — pre-filled with the auto-name, editing optional (forced naming is friction; a pre-filled field costs nothing). No stats UI — class is flavor; steps are the only power. CTA: "THIS IS ME".
Flavor blurb drafts: Warrior "Front of the line, every time." · Mage "Turns a long walk into a longer spell." · Medic "Keeps the whole crew standing." · Archer "Never misses a step." · Assassin "Quiet feet. Loud numbers." · Paladin "Walks in the light. Hits like a sunrise." · Warlock "Made a deal. It involves cardio." · Bard "Every journey needs a soundtrack."

**Beat 2 — Your guild (the fork).** "Heroes don't fight alone." → **START A GUILD** / **I HAVE A CODE**.
- *Founder:* guild name pre-filled "{Hero}'s Guild" → one atomic mutation (guild + invite code + boss spawn + starter tank) → code reveal, huge, with native Share. Sharing skippable — never gate on inviting.
- *Joiner:* six-box code entry (auto-uppercase; alphabet excludes 0/O/1/I) → **preview-confirm before joining** ("Join Team Sofia? 3 heroes fight beside you.") → join adds membership + progress row + starter tank.

**Beat 3 — Power source (iOS device only).** The HealthKit permission MOVES here from the buried dashboard button, with two-step priming: our screen explains why ("Your hero fights with your real steps… that's all it reads"), then the native prompt. On grant → immediate first sync; steps already walked today load the Energy bank before the battle ("+4,832 steps already today. Your hero felt that."). "Maybe later"/denial → proceed on the starter tank, calm "Connect Health" chip on the dashboard (never red). Web/Simulator: beat auto-skipped (`isAvailable()` false).

**Beat 4 — First battle.** No "done" screen. Stamp `onboardedAt`, land on the real BattleScene with their chosen class at job 1 (roster-driven party per fx-rn-port-plan D5). One banner rides the feedback pipeline: "THE SLOTH TYRANT — your guild has until Sunday night."

Founder = 4 taps + optional typing. Joiner = 4 taps + 6 characters.

---

## Backend Work

**Schema** (`convex/schema.ts`, all widening): `users.class` (optional union of 8 literals), `users.onboardedAt` (optional number), `groups.inviteCode` (optional string + `by_invite_code` index).

**Config** (`convex/gameConfig.ts`): `GUILD = { maxMembers: 8, inviteCodeLength: 6, inviteCodeAlphabet: "23456789ABCDEFGHJKMNPQRSTUVWXYZ" }`; expand `CLASSES` to all 8 (job folders from characters/MANIFEST.md); `MVP_CLASS` becomes the fallback — the hardcoded reads in `convex/game.ts` and `convex/guild.ts` switch to `CLASSES[user.class ?? MVP_CLASS]`.

**Mutations/queries:**
- `users.setHeroIdentity { class, displayName? }` — validated, idempotent, later doubles as rename.
- `users.completeOnboarding` — stamps `onboardedAt` (requires membership).
- **`users.bootstrap` → `ensureSession`** (the load-bearing restructure): maintenance only — tz refresh, `ensureCurrentChallenge`/`ensureProgress` *only if a membership exists*, legacy fuel grant. **Never creates a guild.** Kills the "Setting up your guild…" flash.
- `guild.createGuild { name, tz }` — guild + unique code (retry-on-collision; Convex serializable mutations make it race-safe) + owner membership + boss + starter tank.
- `guild.previewInviteCode` (query: name + member count, no join) and `guild.joinGuildByCode { code }` — errors `not_found` / `full` / `already_member` / `has_guild`; on success membership + `ensureProgress` (idle clock starts now) + starter tank.
- `guild.overview` — add per-member `class` (feeds the battle-scene roster) + `inviteCode`/`maxMembers` (feeds the guild board).
- Pure `convex/inviteCode.ts` (no Convex imports) + `tests/inviteCode.test.mjs`, following the fuelMath pattern.
- `dev.resetOnboarding` — clears class/onboardedAt + cascades the solo guild (the re-test loop).

**Decisions:**
- **Boss HP on mid-week join: do NOT rescale ("reinforcements" rule).** Rescaling would make the boss bar grow at the moment of a social win (violates never-punish); next Monday's spawn re-reads member count automatically; one easier founding week is a feature. Zero new code. Tunable — revisit if week-1 kills feel free.
- **Orphaned solo guilds:** `joinGuildByCode` performs a guild *switch* when the caller is the only human in their current guild (cascade mirrors `dev.removeSimulatedTeammates`); account state (fuel/energy/streak/shields) lives on `users` and survives. Real-crew leaving = later feature (`has_guild` error).
- **Legacy users:** `membership exists && class missing` → route to class-pick only (self-healing); optional one-shot backfill (`class: "warrior"`, `onboardedAt: _creationTime`).
- **Reinstall/token loss (FLAGGED, not fixed here):** new anonymous identity strands the old hero as a guild ghost. Mitigation is the already-planned Apple/email link-up, surfaced as a "secure your hero" nudge *after* week 1 — never inside onboarding. Backlog follow-ups: owner-side remove-member; the link-up nudge.

---

## Teaching Layer (contextual, minimal)

New feedback events (in `src/feedback/events.ts` + `treatments.ts`): `bossAppears` (first post-onboarding render), `guildJoined`, first-time suffix on `idleCollected` ("Your hero never stops." — self-defers to session 2 since day-1 pending idle is 0). Persistent nudges: **first-deploy hint** (pulse + one line on `DeployButton` when `energy > 0 && !hasEverDeployed`; server exposes `hasEverDeployed` from `lastDeployDate`; first deploy is already a guaranteed crit) and the **guild-board invite CTA** replacing the dev-copy leak in `GuildBoard.tsx`.
**Explicitly NOT taught:** Overdrive, Rally, Shields, streak math, job ladder — all self-defer or have existing event banners.

## Edge Cases (summary)

Invalid code → warm inline retry (no modal). Full guild → offer founder path, state preserved. Already member → silent route through. Mid-flow kill → server-state resume. HealthKit denied → starter tank + calm chip (Settings deep-link if permission already determined). Victory-lap join → succeeds, progress row comes with Monday's spawn, adapted copy. Simultaneous joins at 7/8 → serializable mutations, second gets `full`. Web/dev → Beat 3 skipped, whole flow runs in browser.

---

## Tickets (new Linear milestone "M2.5 — Onboarding", after M2)

∥ = safe to run as parallel agents (disjoint files). Dependency graph: **ONB-8 ∥ ONB-1 → ONB-2 → ONB-3 → {ONB-4 ∥ ONB-5 ∥ ONB-6} → ONB-7 → ONB-9.**

| # | Title | Type | Files | Needs |
|---|---|---|---|---|
| ONB-1 | Backend: schema + 8-class registry (`users.class`, `onboardedAt`, `inviteCode`+index; CLASSES×8; GUILD config; MVP_CLASS→fallback; roster class + hasEverDeployed in queries) | backend | schema.ts, gameConfig.ts, game.ts, guild.ts | — |
| ONB-2 | Backend: onboarding mutations + bootstrap→ensureSession (setHeroIdentity, completeOnboarding, createGuild, previewInviteCode, joinGuildByCode w/ switch cascade, inviteCode.ts + tests, dev.resetOnboarding, legacy backfill) | backend | users.ts, guild.ts, inviteCode.ts, dev.ts, tests/ | ONB-1 |
| ONB-3 | Frontend: flow shell + server-state resume routing (AuthGate state machine, title card, OnboardingFlow scaffold, dashboard→ensureSession) | frontend | App.tsx, src/screens/onboarding/*, DashboardScreen (1 line) | ONB-2 |
| ONB-4 ∥ | Frontend: Choose-your-hero screen (live idle stage, 8 portraits, name field, per-class accents in assets.ts) | frontend+design | ChooseHeroScreen.tsx, src/config/assets.ts | ONB-1,3 + M2 Sprite |
| ONB-5 ∥ | Frontend: guild screens + invite sharing (fork, create+code reveal+native Share, 6-box entry, preview-confirm, errors; GuildBoard invite section) | frontend | GuildStepScreens.tsx, GuildBoard.tsx | ONB-2,3 |
| ONB-6 ∥ | Frontend: HealthKit priming + permission move (iOS-only screen, grant→first sync, later-chip; remove dashboard card) | frontend | HealthPermissionScreen.tsx, DashboardScreen.tsx | ONB-3 |
| ONB-7 | Frontend: teaching layer (bossAppears/guildJoined/first-collect events, first-deploy hint) — serialized after ONB-6 (shared DashboardScreen) | frontend | feedback/*, DeployButton.tsx, DashboardScreen.tsx | ONB-6,1 |
| ONB-8 ∥ | Design: copy deck + screen comps (owner; blurbs/errors/banners above are the reaction draft; ui-style-lab class kits as visual ref) | design | none | — (start now) |
| ONB-9 | End-to-end verification (below) | QA | tests/ or scripts/ | all |

## Verification (ONB-9)

Two-browser founder+joiner run against `npm run web` + dev deployment, Playwright-able: A onboards as founder (class → name → create → read code from DOM) → B joins with the code as a different class → assert B's preview-confirm shows right name/count → both land on the battle scene with two distinct-class heroes → inject steps in B (DevPanel) → B deploys → assert boss HP drops on A's screen and A sees B's hero attack. Then `dev.resetOnboarding` and run error paths: bad code, full guild (7 bots + 1 join + 1 rejected), solo-founder guild switch. Assert throughout: no monetization surface, no red UI, boss HP unchanged at join time. Unit tests: inviteCode generation/normalization; join-mutation guards (extend `tests/`).

## Also in scope
- Update CLAUDE.md: §5 class decision superseded (8 classes at onboarding), new milestone in §1/§7 map.
- After plan approval: create the Linear milestone + the 9 tickets (ONB-* mapping to STR-N numbers) with these scopes and the dependency graph as blocked-by relations.
