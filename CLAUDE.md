# STRIDE QUEST — Project Guide (CLAUDE.md)

> Living doc. Keep this updated with architecture, key decisions, the data model,
> and current status so any session has full context. Last updated: **2026-07-15**.

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
/ M2.75 (game screen — full-screen pixel HUD; ✅ the DEFAULT home as of STR-71)
/ M3 (monetization) / M4 (platform & release) mirror the phases in §7. Keep
issues updated as work happens (In Progress → Done); new work gets a ticket.

**GitHub:** https://github.com/neelsarode/stride-quest (private). Branch names
follow Linear's generated `neel/str-N-...` pattern; the Linear↔GitHub
integration (connected 2026-07-12, all-repos scope) auto-links branches/PRs to
issues and closes them on merge.

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
    ├── battle/              # ⭐ the LIVE battle scene (M2): Sprite/Fighter/Projectile/Boss/BattleScene,
    │                        #   ConnectedBattleScene (Convex adapter), RestZzz, prefetch,
    │                        #   + GENERATED anchors.ts/spriteMap.ts/sprites/ (`npm run pack-sprites`)
    ├── fuelCopy.ts          # shared fuel-time copy (fmtFightShort/Time/MoreTime — one home, M2.75)
    ├── health/healthkit.ts(.ios.ts)  # step-source seam: stub vs real HealthKit
    ├── ui/                  # ⭐ baked pixel-HUD primitives (M2.75): PixelText/Frame/Bar/Button/
    │                        #   Portrait/Ring/Beacon/Sheet/Popover/Modal + GENERATED uiMap/theme (`npm run pack-ui`)
    ├── game/                # ⭐ the DEFAULT home (M2.75): GameScreen + useGameEngine (shared brain) +
    │                        #   zones/* (TopBar/FuelGauge/BossPlate/PartyRail/RightNav/CommandDock/JobStrip/
    │                        #   OverdriveBar) + Overlays + sheets/* — the full-screen HUD over the battle scene
    └── screens/             # DashboardScreen (fallback behind the flag) + BackendSetupScreen + onboarding/
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
iOS Simulator ✅ WORKS (first native build 2026-07-14, zero errors — STR-24):
`npx expo run:ios` (add `--no-bundler` if Metro already runs) — boots the dev
client on iPhone 17 Pro against the cloud dev deployment. Rebuild only needed
for native changes; JS hot-reloads. Xcode 26.6 + CocoaPods installed.
Physical-iPhone option (pre-Apple-account): free personal-team signing works,
7-day provisioning, HealthKit allowed → real steps testable early.

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
Every class/job now has a full attack kit, proven in the HTML previews — and
since **ported into the RN app** (see **M2** below; the port plan was
`docs/fx-rn-port-plan.md`, executed as decided). The HTML rig REMAINS the
tuning + anchor-measurement environment.
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
  its per-job kneel loop with drifting "z" particles — the fuel Resting-state
  preview; rest mode ignores attack orders by construction, z-emitter stops on
  wake), front hero foot-aligned to the boss, boss
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
- ✅ **M1 frontend DONE (2026-07-14, STR-13/14/15)**: fuel gauge + hero-state
  chip (Battling/Winded/Resting kneel framing), Overdrive meter + real ACTIVATE
  button, Rally UI on the guild board + received-rally celebration. Friendly
  rejections ship with it: user-facing mutations throw `ConvexError`
  `{code, message}` → `friendlyError()` → calm toasts (the STR-53 polish note
  is resolved; buttons also self-gate with warm inline copy so most rejections
  never round-trip).

### M1.5 — Bonus Boss / victory week ✅ built + E2E-VERIFIED (STR-59, 2026-07-14)
Spec: `docs/superpowers/specs/2026-07-14-bonus-boss-design.md`. Built as
STR-54…57 (schema widen + `BONUS_BOSS` config + pure tier helpers +
`tests/bonusMath.test.mjs`; kill-write stamps the crowned form; deploy/idle
route into `bonusDamageContributed` while `won`; `spawnBoss` stamps
`boostMult`/`boostSourceDamage`; dashboard `bonus`/`boost` payloads; crowned
card + accumulating `BonusMeter` + tier preview + reward banner/boost chip).
**STR-59 all 8 scenarios PASS in the browser** (cloud dev deployment, DevPanel
time travel, numbers checked to the digit):
1. Day-5 kill → the SAME write spawns the crowned form (VICTORY → CROWNED
   banners, HP bar → accumulating meter at 0, "Deal 37,500 to earn ×1.1").
2. **STR-53 regression (headline):** bonus-week deploys run the full pipeline —
   energy 10,000→0, streak **5→6** (not 5→0), earned shield untouched (1/2),
   meter +40,250 exact — repeated daily through Sunday, and the streak
   **survived the Monday rollover** (7→8 on Monday's deploy).
3. Post-kill idle banks into the METER: 20h fast-forward → Collect = exactly
   9,000 (OFFLINE_CAP paused at 10h × 900 dph); Resting 10h → +0 pending,
   meter unchanged, fuel untouched.
4. Co-op: a REAL second anonymous account (isolated browser context) joined
   mid-victory-lap by invite code and deployed 28,250 → ONE shared meter
   119,350 on both screens (you: 91,100 / 28,250); each tier banner fired
   exactly once per threshold.
5. Tier thresholds are fractions of the KILLED boss's maxHP, verified at three
   scales: solo 150k → 37.5k/75k/150k; 2-member tier-2 420k → 105k/210k/420k;
   4-member tier-1 600k → 150k/300k/600k.
6. Reward stamping, shown == applied: rollover stamped `boostMult` **1.2**
   exactly matching the preview; banner "×1.2 POWER ALL WEEK! The crew dealt
   119,350 bonus damage last week."; next-week deploy = 44,940
   (10,000 × 2 crit × 1.8725 streak × **1.2**) and idle collect = 1,800
   (10h × 150 × **1.2**) — both exact; ×1.5 cap clamp unit-tested.
7. Never-punish floor: killed tier-2, ignored the crowned form → Monday tier-3
   boss 588,000 exact, NO boost fields/chip/banner, zero "missed it" copy.
8. ConvexError polish: real-UI rejection renders the friendly toast ("A rally
   costs 500 Energy — walk a little more first."); overdrive-while-resting and
   rally-daily-limit are pre-empted client-side with calm copy; server
   backstops are structured `ConvexError {code, message}` (captured verbatim).
78/78 unit tests pass; zero unexpected console errors.
**STR-61 fixed & verified in the same run:** the Monday reward banner now
fires once EVER per boosted week via `users.boostSeenChallengeId`
(server seen-stamp, same pattern as `firstIdleCollectedAt`): banner shown at
rollover on both live clients, stamp confirmed in the DB, absent after reload
AND after re-open.

### M2.5 — Onboarding & first session ✅ built + E2E-VERIFIED (STR-50, 2026-07-14)
Spec: `docs/superpowers/specs/2026-07-13-onboarding-design.md`. Built as
STR-42…49 (schema + 8-class registry, onboarding mutations +
bootstrap→`ensureSession`, flow shell w/ server-state resume routing,
choose-your-hero, guild screens + invite sharing, HealthKit priming move,
teaching layer). **STR-50 two-browser founder+joiner script PASS** (Playwright,
two isolated anonymous accounts):
founder full flow (Archer pick w/ blurb, pre-filled name + guild name, atomic
create, code read from DOM) → joiner full flow (Paladin, lowercase code
auto-uppercased, preview-confirm shows exact guild name + "1 of 8 spots") →
same guild, reactive roster on both screens; joiner's deploy dropped the boss
on the founder's screen live (150,000 → 121,749); **boss maxHP unchanged at
join** (reinforcements rule); mid-flow reload resumed at the correct beat
(server-state routing). Error paths: bad code → warm inline retry (no modal);
full guild (7 bots + founder) → "is full — 8 heroes strong" + founder-path
offer with state preserved, preview flipped to CODE FOUND live when a seat
opened, boundary join 7→8 succeeded; solo-founder guild switch (join by code
while holding an empty solo guild, staged via a second window of the same
account) → switched into the friend's guild, orphan guild cascade-deleted
(CLI-verified), account state survived. No monetization surface anywhere; all
flow errors warm amber, never red. `dev.resetOnboarding` re-test loop used 3×.
Unit tests 78/78 (incl. inviteCode generation/normalization). Notes: the
battle-scene hero-sprite render of the roster awaits M2 (dashboard renders
distinct classes today); the `joinGuildByCode` solo-switch branch has no
single-window UI surface post-onboarding yet (backend verified; a guild-board
join surface would expose it).

### M2 — Battle scene IN the RN app ✅ COMPLETE + E2E-VERIFIED (STR-17…24 + STR-62, 2026-07-14/15)
Port executed per `docs/fx-rn-port-plan.md` — every decision held. The live
battle scene is now the **dashboard centerpiece** (the placeholder sprite box
is gone; the boss card stays the numeric HP/bonus readout — the boss VISUAL
lives only in the scene). The full stone+gold pixel ui-kit HUD port is
deliberately NOT part of M2 (future polish; functional cards keep their style).
- **Module `src/battle/`**: `Sprite` (strip player on Reanimated shared values
  — zero React re-renders, D2), `Fighter` (idle/attack/special/rest ≙
  makeFighter, scheduled release), `Projectile`+`Boss` (D3 anchor geometry;
  hit flash = white-tinted strip copy), `BattleScene` (layout + choreography +
  `fire()` handle + z-particles), `ConnectedBattleScene` (⭐ the Convex
  adapter), `RestZzz`, `prefetch`, + GENERATED `anchors.ts`/`spriteMap.ts`/
  `sprites/` via `npm run pack-sprites` (anchor RESCAN still lives in
  `fx-test.html?scan=1` — HTML rig stays the measurement path).
- **Parity vs `battlefield-ui.html`** (served side-by-side, DOM-measured):
  **pixel-EXACT layout** at the same container — all 8 hero boxes + the boss
  box 0.0px off at 878×560; the auto-scale growth branch identical (381.6px
  both at 390×950 phone fit); every impact at bossChestX ±0.1px; CYCLE 3600 /
  STAGGER 420 / every-4th-special cadence; tap-hero-to-ult; crowned swap; kneel
  + z's. **Documented deltas:** CSS `calc(% ± px)` → `computeSceneLayout()` px
  math off onLayout (same constants, in `fxConfig SCENE`); bg
  `object-position 50% 35%` → cover-center; shadow blur / boss drop-shadow /
  `image-rendering: pixelated` are web-only CSS passthrough → native gets
  crisp-ellipse shadow + smoothed upscale (iOS polish pass pending).
- **Real events (D5)** through a `subscribe` tap on FeedbackProvider
  (`useFeedbackEvent`; overlay treatments untouched — the scene is additive):
  deploy → YOUR fighter's special with the **real damage number** (verified
  −28,250 == the exact boss HP drop); teammate hit → THAT member's fighter
  (`damageDealt` now carries `userId`), special when deploy-sized (≥5k
  tunable) else basic; idle collect (incl. on-open auto-collect) → staggered
  party volley, banked total split across the hits (3,000 → 3 × −1000);
  Overdrive → your fighter chains specials on cycle turns; boss `won` →
  crowned-form swap (reactive, ~250ms after the kill write) while the
  FALLS/RISES banners stay feedback-layer; bonus-week deploys keep animating
  (−20,800 grew the meter by exactly 20,800). Roster = `guild.overview`
  (me front, per-member class/weekly-job/fuel-state; Resting → kneel +
  z-particles, wake stops both) — fully reactive (grew 2→3 live when a bot
  joined) and renders ANY 1–8 party (D5).
- **Perf:** per-roster strip prefetch at mount (`src/battle/prefetch.ts`,
  session-memoized), ~8 concurrent-projectile cap, no per-frame re-renders
  (DevPanel RENDER COUNT stays flat while strips run).
- **STR-62 (worklets on web):** the frozen-sprites bug was the long-lived
  Metro predating the `react-native-worklets` install — a `--clear` restart
  fixed it (the served bundle now emits worklet factories with populated
  `__closure`). NO babel.config.js needed; STR-20's shared-values-in-deps
  workaround kept as defense-in-depth. ⚠️ First native iOS build after
  Reanimated landed needs `npx expo run:ios`.
- **Verified 2026-07-15 in the browser** (cloud dev deployment): a fresh
  anonymous account onboarded through the real flow (MAGE picked) sees the
  scene with THEIR class; first deploy pulses (teaching hint) then fires the
  mage special with the exact number; the crowned week renders the crowned
  boss in-scene beside the gold bonus meter; 78/78 tests; `tsc --noEmit`
  clean; zero console errors on a clean full load. (This closes M2.5's "the
  battle-scene hero-sprite render of the roster awaits M2" note.) DevPanel
  keeps BATTLE SCENE (timer-parity QA rig w/ 8/3/1-hero + JOB + CROWNED +
  REST switches) and LIVE SCENE (real events) sections. iOS Simulator
  spot-check of the scene = the M4 pass.

### M2.75 — Game Screen (full-screen pixel HUD) ✅ COMPLETE + E2E-VERIFIED (STR-66…71, 2026-07-15)
Spec: `docs/superpowers/specs/2026-07-15-game-screen-design.md` (decisions held).
The app now **opens into one full-screen stage**: the live battle scene is the
canvas, and the stone+gold ui-kit HUD floats around it as self-positioning ZONES
(`src/game/zones/*` + `Overlays`/`sheets/*`) plus the re-skinned feedback layer —
all baked-PNG + `<PixelText>` chrome (skia rejected; spike §2). **No game logic
changed** — `GameScreen` and the classic `DashboardScreen` share ONE
`useGameEngine`, so the flag only swaps presentation. As of STR-71 the game
screen is the **DEFAULT home** (`DEV_FLAGS.useGameScreen = true`); DashboardScreen
stays behind the flag as the fallback for one milestone (deletion is an M4 line).

- **STR-71 reconcile** (integration polish before verify): the STR-67 starting
  `GAME_ZONES` offsets over-constrained the top band (boss bottom kissed the
  party rail). Retuned to the mock's rhythm at 390dp and folded STR-67's local
  `BOSS_EXTRA_TOP` hack into `bossPlateTop` — identity→fuel→boss→rail now stack
  with clean gaps (effective y ≈ fuel 66 / boss 104 / rail 210, matching
  `dashboard-ui.html`). Consolidated the flagged local consts: STR-69's
  per-class/job `PORTRAIT_SPRITES` map → shared `src/config/assets.ts`
  (`portraitSpriteFor`); the duplicated `fmtFightShort` → shared `src/fuelCopy.ts`
  imported by BOTH FuelGauge and DashboardScreen (byte-identical strings). Fixed
  the long-string OVERFLOW: the `toast_silver`/`banner_gold` frames are
  horizontal 3-slices (fixed one-line height), so a taller/9-slice bake is out of
  scope (§5) — instead `Toast` + `Banner` now **shrink-to-fit width** (scale the
  chip+text down uniformly only when a line would run off-screen; short strings
  keep the crisp base scale; copy byte-identical). The banner subtitle overflow
  was found live in scenario 2 (the resting "…rejoins the fight." line clipped
  both edges) and fixed with the same clamp.
- **E2E-VERIFIED in the browser** (STR-16/STR-59 rigor; cloud dev deployment,
  `useGameScreen = true`, 390dp + desktop, numbers predicted-then-checked-to-the-
  digit), all 8 scenarios pass:
  1. **Solo loop:** inject +10k → JOB 1→2, FUEL 54h (24h starter+10k = 48h tank
     +6h winded tail), OD 50% (excess 2k/4k), energy 10k, ring goal-hit; DEPLOY =
     `CRIT! 28,250` (10,000 × 1.4125 streak × ×2 first-of-day crit), boss
     629,995→601,745 (exact −28,250), gold bar ghost+flash, streak 0→1, energy→0;
     collect banks pending (auto-collect on mount: 3,000 idle @ JOB 2 (300/h ×10h
     cap) → boss →598,745).
  2. **State coverage:** Winded = amber chip (never red); Resting = calm/sky chip
     + dignified "CATCHING BREATH" banner (never red); job-up badge+XP+banner;
     Overdrive charge→glowing ACTIVATE→activate ("OVERDRIVE! / X3 4H")→"X3 …"
     countdown; streak-shield chip (⬇X1).
  3. **Bonus week:** kill = `CRIT! 624,000` (150,000 × 2.08 × ×2) → crowned plate
     "CROWNED THE SLOTH TYRANT / VICTORY WEEK" + accumulating meter + tier ticks;
     STR-53 regression GREEN — bonus deploys keep spending/ticking (−20,800 =
     10,000×2.08 grew the meter 157,500→136,700; −249,600 crossed ×1.1 →
     "X1.1 POWER SECURED" + "44,410 MORE… ×1.2"); Monday rollover → boost chip
     "X1.1 POWER" on the plate + reward banner "X1.1 POWER ALL WEEK! / CREW DEALT
     270,590 BONUS DAMAGE LAST WEEK." ONCE (no re-fire on reload).
  4. **Co-op:** roster grows live on join (rail gained a tile); a teammate deploy
     animates on-screen (−20,000) and drops the ONE shared boss bar
     (149,998→129,998); rally round-trip via the rail popover — recipient
     celebration "BOT 651 RALLIED YOU!" + outbound SEND RALLY 500 → sender toast
     (500 energy spent, beacon cleared). (Driven through the DevPanel simulated-
     teammate tools, which run the REAL shared-guild/boss mutations + reactive
     queries — a 2nd isolated browser context was not spun up; the second-screen
     render is the identical component/query.)
  5. **Layout:** 390dp stacks cleanly with no top-zone collisions and matches the
     mock; desktop width flips ART_SCALE 2→3 and the HUD scales up correctly.
     KNOWN minor nit (not a regression): at ART_SCALE 3 the Overdrive ACTIVATE bar
     and the DEPLOY streak chip overlap ~12–19dp — a pre-existing STR-68 dock
     scale-3 tuning matter (phone scale-2 is clean); needs scale-aware dock
     positioning, left for STR-68 follow-up.
  6. **Regression, flag OFF:** classic DashboardScreen fully functional
     (fuelCopy consolidation verified live — "fights 44h more" / "44 more hours");
     onboarding founder smoke (choose hero → START A GUILD → CREATE → land in
     battle) unaffected; `fx-test.html?verify=1` → `PASS — 80/80`.
  7. **Perf:** DevPanel UI-GALLERY RENDER COUNT stayed FLAT (3→3) across ~4s
     (~240 frames) of shared-value bar/beacon/ring animation (spec §12 zero-per-
     frame-re-render proof); 0 console errors on every clean load (the only
     session errors were expected game rejections surfaced from dev tools).
  8. **Flip:** `DEV_FLAGS.useGameScreen` default → `true`; `tsc --noEmit` clean;
     78/78 tests; scenario-1 re-confirmed with the flag on (`CRIT! 4,313` ==
     the exact boss HP drop).

### Core Loop v2 — Continuous Combat + Super Attack ✅ COMPLETE + E2E-VERIFIED (STR-73…80, 2026-07-15)
Spec: `docs/superpowers/specs/2026-07-15-core-loop-v2-design.md` (owner-approved
direction, decisions locked). Revised the fuel-hybrid loop into a *living* fight:
(1) the party **continuously auto-attacks** while fueled (scene-layer driver keyed
off each member's Battling/Winded/Resting state — idle economy unchanged, just
visible); (2) **COLLECT removed** — idle auto-applies on open, no tap; (3) **DEPLOY →
SUPER ATTACK** — same whole-bank math, new **combo/flurry** visual scaling with the
bank size; (4) **Overdrive retriggered** — no meter/activate; **hitting the daily
goal auto-enters ×2 Overdrive until the next reset**, now boosting idle AND super
attacks. Fuel/Winded/Resting, streaks, shields, rally, the crowned bonus week, and
the M2.75 game screen all survived; only `CommandDock`/`OverdriveBar` changed on the
UI side.
- **Confirmed tunables (Neel, 2026-07-15):** `DAILY_STEP_GOAL` 8k→**6k** + re-anchor
  `FUEL.burnPerHourBattling` 300→**225** (a 6k goal-day still banks ~+2.7h surplus),
  `BOSS.baseHP` 150k→**300k**, `OVERDRIVE.idleDamageMult` 3→**2** + `boostsSuperAttack`.
  New `SUPER_ATTACK` feel block (`energyPerHit 1500, minHits 2, maxHits 10,
  hitStaggerMs 110, finisherFrac 0.5`) + `SCENE` loop constants (`idleLoopCycleMs
  2200, idleLoopStaggerMs 300, windedCycleMult 2.0, overdriveCycleMult 0.65`).
- **Built as STR-73…79:** STR-73 config; STR-74 Overdrive retrigger (`overdriveActiveUntil`
  repurposed as the auto EOD stamp — `endOfEffectiveDay` in `convex/time.ts`; `applyDeploy`
  ×2 factor; charge/activate model deleted — `overdriveStatus` reshaped to
  `{active,mult,endsAt,remainingSeconds,stepsToday,goal}`); STR-75 removed manual COLLECT
  (`collectIdle`→`applyIdleOnOpen`, auto-apply-on-open kept); STR-76 DEPLOY→SUPER ATTACK
  copy + deploy-event `spent` plumbing (internal `deploy` identifiers unchanged by design);
  STR-77 the scene (self-rescheduling per-member timers keyed on `heroState`, ambient
  swings carry NO number, the flurry splits `spent`→N hits summing EXACTLY to `r.damage`
  with the special finisher largest — also fixed a `fire()` busy-path bug that nuked an
  in-flight swing's queued damage); STR-78 CommandDock (Collect column gone, gold button
  reads SUPER); STR-79 OverdriveBar (passive goal-progress → "OVERDRIVE X2 · UNTIL RESET"
  status strip).
- **STR-80 sign-off — GO, all 8 scenarios PASS** (browser, cloud dev deployment, numbers
  predicted-then-checked-to-the-digit): continuous cadence Battling 2200ms / Winded 4403ms
  / Resting 0 swings / Overdrive 1432ms, ambient hits show no numbers; no-COLLECT auto-apply
  banked exactly 1,500 (10h×150); flurry drops 3,188 (N2) / 42,667 (N5) / 108,800 (N10-clamp)
  with splits summing exact + finisher largest; Overdrive auto-arms on the 6k goal (dph
  150→300, EOD stamp, off at reset with no punishment, re-arms next day) and stacks on
  Super Attacks ×2; Winded ×0.5×OD ×2 and Resting=0 verified; bonus week kills→crowned with
  tiers 75k/150k/300k (fractions of 300k) and post-kill Super+idle carry ×2 into the meter,
  rollover stamped ×1.1; boss pacing dead ~day 6 solo at 6k (spec's day-5 assumed 8k), tier-2
  rollover 420k with jobs reset + fuel/energy/streak/shields persisting; regression clean
  (streak ticks + shield bridges a skip, rally/guild board work, classic DashboardScreen
  loads flag-OFF with no COLLECT). 78/78 tests, `fx-test.html?verify=1` PASS 80/80, tsc clean
  both projects, 0 console errors.
- **Open owner tuning (non-blocking, playtest):** (a) **flurry max-length feel** — a single
  hero sprite serializes swings, so N=2≈1.1s / N=5≈3.5s / N=10≈6.5–7.5s; small/medium banks
  read as a punchy rat-a-tat, but the N=10 cap drags. Levers if more explosive is wanted:
  lower `maxHits`, tighten/overlap `hitStaggerMs`, or a teammate-parallel flurry (spec §8).
  (b) day-5-vs-day-6 kill at 6k (nudge `BOSS.baseHP` if day-5 is wanted). Both are single
  `gameConfig` edits. Non-blocking dev-only artifacts from verification (cannot occur in
  prod): a dual-active-challenge only reachable by rewinding the dev clock ~23 days
  (monotonic prod clock + single-writer rollover prevent it); a transient Metro cache glitch
  after a mid-session `node_modules/.cache` delete (fixed by a page reload).

### Phase 3+ — Deferred (architect for, don't build)
Recognition screens, IAP, cosmetics, guild-vs-guild / global.

---

## 8. Outstanding manual steps (human-only)
- **Xcode** — ✅ DONE (2026-07-14). Xcode 26.6 + iOS 26.5 runtime + CocoaPods;
  first native build succeeded, app boots in the Simulator (STR-24, see §6).
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
