# STRIDE QUEST — Project Guide (CLAUDE.md)

> Living doc. Keep this updated with architecture, key decisions, the data model,
> and current status so any session has full context. Last updated: **2026-07-12**.

---

## 1. What the app is

A **co-op, step-tracking RPG** for a small friend group (3–8). Everyone's real
daily steps are pooled as **damage against a shared weekly boss** the whole crew
fights together. Cooperative, not competitive — teammates chipping ONE health
bar. Core loop: open the app → collect idle damage → **deploy banked steps as a
burst hit** → watch the boss take damage. Plus per-player progression, wrapped in
pixel art (made separately; see `characters/`).

The user is a **designer, not a developer**. Explain things in plain language,
work in small testable increments, and stop for sign-off before major
dependencies / architectural decisions. Prioritize a working end-to-end skeleton
over features.

**Work tracking lives in Linear** (workspace team `Stridequest`, project
**Stride Quest** — https://linear.app/stridequest/project/stride-quest-40ccda389ff9).
Milestones M1 (fuel hybrid loop) / M2 (battle-scene RN port) / M2.5 (onboarding
& first session — spec: docs/superpowers/specs/2026-07-13-onboarding-design.md)
/ M3 (monetization) / M4 (platform & release) mirror the phases in §7. Keep
issues updated as work happens (In Progress → Done); new work gets a ticket.

**GitHub:** https://github.com/neelsarode/stride-quest (private). Branch names
follow Linear's generated `neel/str-N-...` pattern so the Linear↔GitHub
integration auto-links branches/PRs to issues once connected in Linear settings.

---

## 2. Tech stack (decided — do not re-litigate)

| Layer | Choice | Notes |
|---|---|---|
| App | **React Native + Expo (SDK 56)** | RN 0.85, React 19.2. Dev build (NOT Expo Go) because of HealthKit. New Architecture is on (required by Nitro). |
| Backend / DB | **Convex** | Reactive queries → shared state (boss HP, steps) updates live on every screen. |
| Steps | **Apple HealthKit** via `@kingstinct/react-native-healthkit` v14 | iOS-only, Nitro-based, has an Expo config plugin (no manual Xcode). |
| Auth | **Convex Auth — Anonymous provider** (`@convex-dev/auth`) | Auto identity, no login screen. Upgrades to Apple/email later keep the same userId. (Library is beta — pinned.) |
| Monetization | Apple IAP via **RevenueCat** (+ AdMob rewarded-only, maybe) | **Architect for later, don't build yet.** Strategy decided 2026-07-12: cosmetics + season pass + streak-repair ladder; steps stay the ONLY source of power. Spec: `docs/superpowers/specs/2026-07-12-monetization-strategy.md`. |
| Game engine | **None** | The "game" is animated UI; RN handles it. |

### Decisions made with the user (2026-06-27)
- **Identity:** Convex anonymous auth (vs device-ID / Clerk). Clean upgrade path.
- **Apple Developer account ($99/yr):** **deferred.** Only needed to read REAL
  steps on a physical iPhone. The whole loop is testable for free via the dev
  injector (browser or Simulator).
- **Preview:** browser preview now (via `react-native-web`) + Xcode downloading
  in the background for the real iOS Simulator later.

---

## 3. Repo layout

```
walking-app/
├── App.tsx                  # root: Convex provider + anonymous sign-in gate
├── index.ts                 # Expo entry
├── app.json                 # Expo config (name, scheme, HealthKit plugin)
├── characters/              # PIXEL ART — see characters/MANIFEST.md for full inventory
│   └── <class>/<jobN_name>/{<dir>.png, animations/{idle,attack,special,evolution}/frame_*.png}
├── assets/
│   ├── effects/<class>/{basic,special,impact}/  # per-class attack VFX (5/5/7 frames)
│   ├── fx-engine.js         # shared attack-choreography engine (preview pages); optional FXEngine.onDamage(amount, big) hook feeds page HUDs
│   ├── ui-kit.js            # PROCEDURAL pixel-art UI kit — zero-image HUD chrome, fillRect only. Flat layer (palette/sprites/pixel font/bars/panels/buttons) + HI-FI layer (material ramps, rounded rasterizer, dithered gradients, hifi* renderers)
│   ├── fx-anchors.js        # GENERATED weapon anchors — regen via fx-test.html?scan=1; never hand-edit
│   └── fx-special-anchors.js# GENERATED (same rule)
├── preview.html             # sprite/animation gallery (open in browser)
├── ui-procedural.html       # procedural UI gallery/acceptance page for ui-kit.js (2x/3x/4x, all states)
├── ui-style-lab.html        # ⭐ UI SOURCE OF TRUTH — hi-fi procedural CLASS KITS, one per class (S1 paladin, S2 bard, S4 mage, S5 medic, S6 warlock, S7 archer, S8 warrior=LIVE, S10 assassin). Full kit + overlays (member popover w/ SEND RALLY, help modal, banner, toast, tooltip, fuel-state dots). FULL-BODY sprite portraits via kit PORTRAIT_CROPS (ui-variations.html = the older PixelLab-image style page)
├── battlefield-ui.html      # live battle mock: 8-hero party vs boss; HUD = ui-kit.js hi-fi chrome in S8 "Celestial Silver" (user-picked). Interactive: party rail (tap member → stats popover + SEND RALLY toast), help modal on ?, live boss bar, tap-ATTACK volley. PixelLab PNG chrome in assets/ui/ kept for comparison
├── fx-test.html             # FX QA rig — ?verify=1 runs 80-attack self-test, ?scan=1 regens anchors
├── docs/fx-rn-port-plan.md  # DECIDED plan to port the battle scene into the RN app
├── .claude/skills/generate-vfx/  # PixelLab pipeline playbook — read BEFORE any mcp__pixellab__* call
├── convex/                  # BACKEND (Convex functions + schema)
│   ├── schema.ts            # all 7 tables + indexes
│   ├── auth.ts              # Convex Auth (Anonymous provider)
│   ├── auth.config.ts       # auth provider config
│   ├── http.ts              # auth HTTP routes
│   ├── gameConfig.ts        # ⭐ all balance/tuning numbers (shared w/ app)
│   ├── users.ts             # viewer query + bootstrap mutation (first-run setup)
│   ├── steps.ts             # recordSteps mutation + ledger derivation helpers
│   ├── game.ts              # dashboard query (the live screen feed)
│   ├── tsconfig.json        # convex-only TS config (has node types)
│   └── _generated/          # Convex codegen (regenerated by `convex dev`)
└── src/                     # APP code
    ├── convex.ts            # ConvexReactClient (reads EXPO_PUBLIC_CONVEX_URL)
    ├── dates.ts             # local day / Monday-week helpers
    ├── devConfig.ts         # dev-only flags (step injector)
    ├── secureStorage.ts(.web.ts)  # auth token storage (keychain / localStorage)
    ├── config/assets.ts     # ⭐ ALL visuals (colors, sizes, sprite path map)
    ├── health/healthkit.ts(.ios.ts)  # step-source seam: stub vs real HealthKit
    └── screens/             # DashboardScreen + BackendSetupScreen
```

**Two "one place to change it" modules (by design):**
- `src/config/assets.ts` — every color, size, and sprite reference. Swapping
  placeholder rectangles for real pixel art happens here only.
- `convex/gameConfig.ts` — every balance number (job thresholds, multipliers,
  offline cap, streaks, boss HP). Re-balancing = editing data, never logic.
  It has NO Convex imports so both the backend and the app import the same values.

---

## 4. Data model (Convex tables)

`stepEntries` is the **immutable, append-only source of truth.** We never edit a
past row — each sync appends a new observation. Everything else (today's total,
weekly total, damage, XP) is **derived** from it. This is the seam where
anti-cheat plugs in later without touching game logic.

| Table | Purpose | Key fields | Indexes |
|---|---|---|---|
| `users` | identity + profile (extends Convex Auth user) | displayName, baselineSteps, isAnonymous | email, phone |
| `groups` | the friend group ("guild"; one per player for now) | name, ownerId | by_owner |
| `memberships` | user↔guild link (own table → multi-guild later) | userId, groupId, role | by_user, by_group, by_user_and_group |
| `stepEntries` | **append-only** step ledger | userId, date, stepCount (cumulative for date), source | by_user_and_date, by_user |
| `challenges` | the weekly boss | groupId, startDate, endDate, bossMaxHP, status | by_group, by_group_and_status |
| `challengeProgress` | derived per-member stats | damageContributed, jobXp, energy | by_challenge, by_challenge_and_user, by_user |

**Derivation rule:** today's steps = MAX(stepCount) among today's entries; weekly
steps = sum of each day's MAX. (`convex/steps.ts` → `stepsForDate`/`stepsForWeek`.)

---

## 5. Game rules (Phase 2 — logic not built yet, config IS defined)

In `convex/gameConfig.ts`:
- **Job ladder** (resets Mondays): cumulative weekly steps `[0, 10k, 25k, 50k,
  75k]` → Job 1–5. Idle multipliers `[×1, ×2, ×3.5, ×6, ×10]`.
- **Two meters per step:** Job XP (cumulative, never spent) + Energy (spendable,
  carries over). *Not yet wired — Phase 2.*
- **Idle combat:** auto-attack dmg/hr = idle multiplier; accrues offline up to
  `OFFLINE_CAP_HOURS` (10), then pauses; "collected" on open. *Phase 2.*
- **Daily deploy:** collect idle → deploy Energy as a burst (crits + streak
  multiplier + juice live HERE, not on idle). *Phase 2.*
- **Streaks, fairness (personal-goal celebration, improvement-based
  recognition), boss resolution.** *Phase 2.*
- **Classes:** data-driven registry. ~~MVP ships Warrior only~~ **SUPERSEDED
  2026-07-13:** all 8 classes ship as the onboarding "choose your hero" pick
  (art + VFX complete for all 8; `MVP_CLASS` becomes the fallback for
  class-less/legacy users). Spec: docs/superpowers/specs/2026-07-13-onboarding-design.md.

---

## 6. How to run (current state)

**Backend = Convex cloud.** Linked to team **`neel-sarode`**, project
**`walking-app`**, dev deployment **`warmhearted-akita-881`**. `.env.local` holds
the cloud URL (`EXPO_PUBLIC_CONVEX_URL` + `EXPO_PUBLIC_CONVEX_SITE_URL`). This is
a shared cloud backend, so it already supports real multiplayer.

**Convex Auth signing keys are set** on the dev deployment (`JWT_PRIVATE_KEY`,
`JWKS`, `SITE_URL` → check with `npx convex env list`). These are what make
anonymous sign-in actually issue tokens. ⚠️ When we create the **production**
deployment later, it needs its OWN copy of these keys (run the key setup against
prod, or `npx @convex-dev/auth --prod`).

Two terminals, from the project root:
```bash
# Terminal 1 — backend (keep running; watches + pushes to the cloud dev deployment)
npx convex dev

# Terminal 2 — app in the browser (instant, no Xcode)
npm run web
```
iOS Simulator (once full Xcode is installed): `npx expo run:ios` then `npm start`.

Convex dashboard: https://dashboard.convex.dev/t/neel-sarode/walking-app

---

## 7. Status & roadmap

### Phase 1 — Walking skeleton ✅ (built 2026-06-27)
Scaffold, full schema, anonymous identity, HealthKit wiring (behind a seam), dev
step injector, and **injected steps → Convex ledger → reactive query → screen.**

**Verified end-to-end on the cloud project (2026-06-27):** schema + functions
deploy to `warmhearted-akita-881`; app typechecks clean; web bundle builds (native
HealthKit excluded from web). **Live browser test passed:** the web app anonymously
signs in (created real user `Hero-ehb8`), bootstraps guild + boss, and tapping
"+10,000" saved to the cloud ledger and reactively advanced the hero Rookie → Strider
(idle ×1 → ×2) — proving click → server mutation → cloud DB → reactive query → UI.

### Phase 2 — Core loop ✅ COMPLETE (placeholder visuals)
Plan: `~/.claude/plans/where-we-are-phase-dynamic-corbato.md`. Key architecture:
**server-owned mockable clock** (`convex/time.ts` + `devState` table), **derived
energy** (`users.energySpent`; balance = ledger − spent), **derived Job XP**
(= weekly steps), and a **feedback/juice layer** (`src/feedback/*` + `src/components/*`)
that emits semantic events → legible placeholders now, real juice later.

- ✅ **Chunk 0 (dev tooling + feedback scaffolding)** — done & verified in browser.
  `convex/dev.ts` (env-gated `ENABLE_DEV_TOOLS=true`): time-travel the clock
  (advance day, +Nh idle, reset), inject steps, add/inject simulated teammates,
  reset account. `convex/time.ts` effectiveNow/day/week; bootstrap captures
  `groups.tzOffsetMinutes`; `recordSteps`/`dashboard` are now SERVER-time-aware
  (client no longer passes dates). Frontend: `DevPanel` (clock readout +
  controls), `FeedbackProvider` + overlay, `AnimatedHPBar`, `Banner`/`Toast`/
  `FloatingNumber`, `useGameEvents` (diffs the reactive snapshot → animations).
- ✅ **2a (solo loop)** — done & verified end-to-end in browser. New backend:
  `convex/economy.ts` (derived Energy), `convex/idle.ts` (idle accrual + settle on
  job change), `convex/combat.ts` (`collectIdle`, `deploy`/`applyDeploy`, boss
  resolution). `dashboard` now returns `meters`/`idle`/`streak`/`dailyGoal` +
  boss `status`/`defeated`. Frontend: `AnimatedMeter` (Job XP + Energy),
  `DeployButton`, live `usePendingIdle` ticker. **Verified:** inject → meters fill
  + job-ups (Job 1→3, idle ×1→×3.5); DEPLOY spends whole bank as a crit (30k→60k
  dmg, boss dropped, energy→0); idle +10h = +5,250 capped, Collect drops boss;
  streak grows on consecutive deploys, breaks on a missed day; daily-goal banner.
  `dev.resetAccount` = clean slate (clears steps/energy/streak, revives boss).
  **Streak multiplier is multi-axis** (`convex/streak.ts` + `STREAK` config):
  `1 + dayBonus(+8%/day, cap +80%) + intensityBonus(+25%×avgSteps/goal, cap +60%) +
  jobBonus(+10%/job)`, hard cap ×3.0. Avg-steps-during-streak is derived from the
  ledger; the deploy and the dashboard "×N.NN power" preview share `computeStreakMultiplier`.
- ✅ **2b (co-op)** — done & verified in browser. `convex/guild.ts` (`overview`
  query: per-member contributions + improvement-based recognition);
  `convex/combat.ts` `ensureCurrentChallenge` (weekly rollover — single writer:
  expire/win old boss, spawn next with tier+1 if won, fresh member rows; called
  from bootstrap + deploy/collect + dev time tools). Frontend: `GuildBoard`
  roster + `useTeammateDamage` (teammate hits animate on every screen). Dev tools:
  `simulateTeammateDeploy`, `triggerWeeklyReset`. **Verified:** two members' damage
  sums to one shared boss HP; recognition badges (MVP/most-improved/longest-streak)
  on improvement+consistency not raw steps; boss kill → "FALLS" banner + victory
  lap; weekly reset → tougher tier-2 boss (HP scales with members×tier), jobs reset
  to 1, energy/streaks persist.
- **Tune resolved (STR-5):** `BOSS.baseHP` was 60k and too low once deploys got
  strong (a big deploy one-shot it) — retuned to **150k** per member alongside the
  fuel-hybrid config (spec §7), so an engaged crew kills around day 5–6. Still a
  TUNABLE starting value. Recognition fairness fully separates a light walker
  beating their own avg from a heavy flat walker once there's a few days of step
  history.

Tuning lives in `convex/gameConfig.ts` (all marked TUNABLE starting values);
feel-layer timings/colors in `src/config/assets.ts` (`ANIM`/`FEEDBACK`/`BANNER`/`JUICE`).

### Phase 2.5 — Battle FX layer ✅ (built 2026-07-11/12, preview-side)
Every class/job now has a full attack kit, proven in the HTML previews (not yet
in the RN app — port plan is `docs/fx-rn-port-plan.md`, decisions already made).
- **Art** (PixelLab, ~640 generations): per-class projectile + ultimate
  projectile + impact burst for all 8 classes (`assets/effects/`), plus a
  class-themed `special/` ultimate animation for ALL 40 jobs (job 5 = 17f,
  jobs 1–4 = 13f). Generation pipeline + all PixelLab landmines documented in
  `.claude/skills/generate-vfx` — use that skill for any new art.
- **Engine** (`assets/fx-engine.js`): attack = char anim → at pixel-measured
  release frame spawn class projectile at the visible weapon tip → straight
  constant-speed flight → impact burst + boss flash + damage number.
  KEY INVARIANT: spawn/target use measured visible-pixel anchors
  (`fx-anchors.js`/`fx-special-anchors.js`, GENERATED via `fx-test.html?scan=1`)
  — never sprite-box edges (transparent padding made projectiles fly backwards
  on narrow screens). VFX are per-CLASS shared across jobs (budget decision,
  user-approved); per-job feel comes from per-job anchors.
- **Scenes**: `battlefield-ui.html` = all 8 heroes staggered basics + every-4th
  specials, tap-hero-to-ult, JOB 1–5 switcher + REST toggle (whole party plays
  its per-job kneel loop — the fuel Resting-state preview; rest mode ignores
  attack orders by construction), front hero foot-aligned to the boss, boss
  auto-scales to never be shorter than the party. `fx-test.html` = QA rig;
  **`?verify=1` must print `PASS — 80/80`** after any FX/anchor change.
- Verified 2026-07-12: 80/80 attacks pass, zero console errors. Re-verified
  2026-07-13 after the engine gained `rest` mode (`setResting`): 80/80.

### Phase 3 — Core-loop evolution: FUEL HYBRID (backend ✅ VERIFIED 2026-07-13; UI pending)
Spec: `docs/superpowers/specs/2026-07-12-core-loop-fuel-hybrid-design.md`;
research PDF: `docs/gameplay-loop-design.pdf`. Steps = fuel for a 24/7 fighting
hero (Battling → Winded → Resting, never punished), DEPLOY stays the daily
anchor, player-activated Overdrive, Rally, auto-applied Streak Shields.
- ✅ **Backend built (STR-5…12)**: `convex/fuelMath.ts` (pure piecewise walk —
  ONE walk prices burn + idle damage from the same clock windows), `fuel.ts`,
  `overdrive.ts`, `rally.ts`, `shields.ts`, dashboard exposure, DevPanel
  time-travel controls (+ M1 numeric readout & real `activateOverdrive` button).
- ✅ **STR-16 E2E VERIFIED in browser (2026-07-13), all 7 scenarios pass** on the
  cloud dev deployment via DevPanel + fresh anonymous account:
  tank cap (15,199→14,400) & winded threshold exact; lapse walk 900→0 with
  EXACTLY 450 winded damage, zero punishment, instant comeback deploy (damage =
  energy × exact streak mult × first-of-day crit, verified to the digit);
  Overdrive: 20k-over-2-days = exactly 100%, reject-at-50%, holds at 100%,
  settled window priced 4h×3 + 6h×1 at Job 2 = −5,400 exact, burn untouched;
  Rally: eligibility + the +1 wake margin (empty→BATTLING) + per-giver daily
  limit; Shields: earned on 5th goal-day, consumed silently to bridge a skipped
  day (streak 2→3, not reset); Boss pacing: engaged solo 10k/day kills the 150k
  boss on DAY 5; Monday rollover: tier-2 boss = exactly 210,000, jobs reset,
  fuel/energy/shields/OD charge all persist.
- ⚠️ **Finding (STR-53): deploy vs an already-dead boss silently no-ops** — no
  energy spent, no streak tick, no error → early killers couldn't maintain their
  streak (died 5→0 through a held shield). **DIRECTION DECIDED 2026-07-13: the
  Bonus Boss resolves this** — on an early kill the boss's crowned form rises for
  the rest of the week (no HP bar, an ACCUMULATING damage meter); post-kill
  deploys/idle hit IT (energy spends, streaks tick), and at rollover the guild
  earns a tiered next-week damage boost (×1.1/×1.2/×1.35, cap ×1.5). Spec:
  `docs/superpowers/specs/2026-07-14-bonus-boss-design.md`; Linear milestone
  **M1.5 — Bonus Boss (victory week)** (STR-53 superseded → its acceptance
  criteria live in the M1.5 backend ticket).
- Polish notes: backend rejections are generic Convex "Server Error" — STR-14/15
  UIs need `ConvexError` for friendly messages; activating Overdrive consumes
  ALL banked excess incl. >100% overage; dev fast-forward idle damage lands on
  the next interaction (cosmetic, dev-only).
- Remaining M1: frontend STR-13/14/15 (fuel gauge + states, Overdrive button,
  Rally UI) — design target: `dashboard-ui.html` + `ui-style-lab.html`.

### Phase 3+ — Deferred (architect for, don't build)
Other classes, recognition screens, IAP, cosmetics, guild-vs-guild / global.

---

## 8. Outstanding manual steps (human-only)
- **Xcode** (full app, Mac App Store) — required for the iOS Simulator. *In
  progress.* After install: license + iOS Simulator runtime + CocoaPods (I'll guide).
- **Apple Developer Program ($99/yr)** — deferred; only for REAL steps on a
  physical iPhone. Enrollment can take 1–2 days when you decide to do it.
- **Convex cloud account** — ✅ done (team `neel-sarode`, project `walking-app`).

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
