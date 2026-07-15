# Stride Quest — Session Handoff

> Written 2026-07-15. Snapshot of exactly where the project stands and how to
> pick it up. Read `CLAUDE.md` first (the living architecture/status doc); this
> file is the "what were we mid-stride on and how do we work" companion.

---

## 0. TL;DR — where we are this second

**The whole game is built, verified, and runs natively on the iOS Simulator.**
Four build milestones are complete and E2E-verified (M1 fuel loop, M1.5 bonus
boss, M2 battle scene, M2.5 onboarding). A friend could onboard, pick a class,
join a guild by code, walk, deploy, rally teammates, and fight the weekly +
crowned boss — all against the live cloud backend.

**We just finished PLANNING the next milestone: M2.75 — Game Screen.** This is
the full-screen pixel-HUD presentation layer (making the app look like
`battlefield-ui.html` instead of a scrolling card list). The planning agent
completed the spec, spiked the rendering approach, created the Linear milestone
and all 8 tickets — then hit a credit limit mid-wrap-up. Its artifacts were
recovered and committed (`efdc059`). **Nothing of M2.75 is built yet.**

**The immediate next action:** start building M2.75, ticket **STR-63** first
(the UI asset pipeline). Everything is staged and ready.

**Model note:** this session was running on Claude Fable 5, which ran out of
credits. Switched to Opus 4.8. No behavioral change needed — same workflow.

---

## 1. What the project is (30 seconds)

Co-op step-tracking RPG for a small friend group (3–8). Everyone's real daily
steps become **fuel** for a hero who fights a **shared weekly boss** 24/7.
Cooperative, not competitive — one health bar, everyone chips it. Pixel-art,
iOS-first. **Designer-owner (Neel) is not a developer** — explain in plain
language, work in small verifiable increments.

**Locked design guardrails (never violate):**
- Steps are the ONLY source of power. No purchase/ad/mechanic ever adds damage.
- Never punish inactivity. Out-of-fuel = hero kneels/rests (dignified, no red
  UI, no party damage). Loss-framing only ever applies to *bonuses* (streak
  multiplier, overdrive charge), never earned progress.
- The party is never punished for one member's lapse.

---

## 2. Tech stack (decided — do not re-litigate)

| Layer | Choice |
|---|---|
| App | React Native + Expo SDK 56 (RN 0.85, React 19.2, New Architecture on) |
| Animation | react-native-reanimated 4.3.1 + react-native-worklets |
| Backend/DB | Convex (reactive queries) |
| Steps | Apple HealthKit via `@kingstinct/react-native-healthkit` v14 |
| Auth | Convex Auth — Anonymous provider |
| Art | PixelLab (pixel sprites), procedural HUD kit (`assets/ui-kit.js`) |

**Dev build required, NOT Expo Go** (custom native HealthKit + reanimated
modules aren't in the Expo Go shell).

---

## 3. Milestone status (as of 2026-07-15)

| Milestone | State |
|---|---|
| **M1 — Fuel Hybrid Core Loop** | ✅ Built + E2E-verified (STR-16). Frontend done (STR-13/14/15). |
| **M1.5 — Bonus Boss (victory week)** | ✅ 100%. Built + E2E-verified all 8 scenarios (STR-54–59). Closed the STR-53 streak bug. |
| **M2 — Battle Scene RN Port** | ✅ Complete (STR-17–23, 62). Scene is IN the app — 0.0px parity with battlefield-ui.html, real damage numbers, crowned boss, kneel + pixel Z's. |
| **M2.5 — Onboarding & First Session** | ✅ Built + E2E-verified (STR-42–50). Founder+joiner two-account flow proven. |
| **M2.75 — Game Screen (full-screen pixel HUD)** | 📋 **PLANNED, 0 built.** Spec + spike + 8 tickets staged (STR-63–71). **← WE ARE HERE.** |
| **M3 — Monetization Foundations** | 📋 Designed only (strategy doc). Build after friend beta. STR-30–37, 41. |
| **M4 — Platform & Release** | 🔶 Partial. Xcode ✅ (STR-24). GitHub+Linear ✅ (STR-28). Remaining: Apple Developer enrollment (STR-25, human), real HealthKit steps (STR-26), Convex prod (STR-27), TestFlight (STR-29, human). |

Test suite: **78/78 passing.** Typecheck clean.

Live roadmap for the non-dev view: `roadmap.html` (open in browser). ~85%.

---

## 4. M2.75 — the milestone we're about to build

**Goal:** turn the scrolling-card `DashboardScreen` into ONE full-screen stage —
the live battle scene fills the phone, the stone-and-gold pixel HUD floats over
it (per the `dashboard-ui.html` phone comp). No game logic changes; pure
re-skin + re-layout.

**The rendering decision (already made, evidence in spec §2):** the HUD kit
(`assets/ui-kit.js`) draws on HTML canvas; RN has no canvas. **Chosen: bake the
deterministic kit to PNGs** via `ui-export-rig.html` + a bitmap-font atlas →
`<PixelText>`. **Rejected: react-native-skia** (~440MB prebuilts, async 3MB WASM
on web, ~830-line port for 95%-static chrome). Spike proved the bake approach
byte-deterministic and visually indistinguishable.

**Spec:** `docs/superpowers/specs/2026-07-15-game-screen-design.md` — read it
fully before building. It has the layout zones, the asset pipeline, the text
system, dynamic-state handling, migration strategy, and file plan.

**Safety:** everything lands behind `DEV_FLAGS.useGameScreen` (default false).
The working DashboardScreen ships untouched the whole time; the final verify
ticket flips the flag.

### The 8 tickets (build in order — each independently verifiable)

| Ticket | Title | Notes |
|---|---|---|
| **STR-63** | UI asset pipeline (export rig inventory + pack-ui.mjs + generated assets) | START HERE. Grows `ui-export-rig.html` to full inventory, adds `scripts/pack-ui.mjs`, generates `src/ui/{assets,uiMap.ts,theme.ts}`. |
| **STR-64** | src/ui primitives (PixelText + baked-chrome components + parity gallery) | Depends on STR-63. (STR-65 is a canceled duplicate — ignore it.) |
| **STR-66** | GameScreen shell (useGameEngine extraction, flag, full-screen scene, safe areas) | Extract shared hooks so both screens can't fork. |
| **STR-67** | Top HUD zones (identity bar, fuel gauge, boss plate incl. bonus/boost) | |
| **STR-68** | Bottom command dock + job strip (gold DEPLOY, collect, ring, Overdrive, XP) | |
| **STR-69** | Party rail + right nav + popovers + slide-up sheets | |
| **STR-70** | Feedback layer re-skin (hifi banners, toasts, floating numbers) | Event API untouched. |
| **STR-71** | Verify M2.75 E2E + flip the flag | STR-16/59 tradition. Closing ticket. |

**Sequencing:** STR-63 → 64 → 66 are sequential (each needs the prior). Once
the shell (STR-66) exists, the zone tickets 67/68/69/70 are parallel-safe
(disjoint zone files). STR-71 last.

### Open questions for Neel (from spec §10 — ask before/during build)
1. Guild board as a slide-up sheet (recommended) vs splitting rally into rail
   popovers?
2. Party rail: names hidden until tap (battlefield-ui pattern) vs name labels
   under each tile?
3. Per-class HUD themes later (ships S8 Celestial Silver for all now) — on the
   roadmap or not?
4. Onboarding re-skin recommended OUT of M2.75 (own follow-up milestone) — agree?
5. Steps-ring goal-hit glow now or in a later juice pass?

---

## 5. HOW WE WORK (the workflow that produced all of this)

This is the most important section for continuity. The pattern:

### Agent-dispatched, ticket-scoped building
- Each Linear ticket → one `general-purpose` subagent via the `Agent` tool,
  `run_in_background: true`. Give it: read-CLAUDE.md-first, the spec section,
  the exact scope, verification requirements, file-ownership boundaries (so
  parallel agents don't collide), and "commit but do NOT push."
- Agents **build + verify in-browser (Playwright/Chrome MCP) + commit** (one
  commit per ticket, message starts "STR-NN:", ends with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`). They do NOT push
  and do NOT change Linear ticket state.
- Run **2–3 agents in parallel** when their files are disjoint (e.g. onboarding
  screens + battle-scene modules never touch the same files). Tell each which
  files it owns and which another agent owns.

### Main-session gate → push → close (do this when an agent reports done)
1. Re-run the gate yourself: `node --test --experimental-strip-types tests/*.test.mjs`
   (expect 78/78) and `npx tsc --noEmit` (expect clean). **Never trust the
   agent's claim — re-verify before pushing.**
2. `git push`.
3. Mark the Linear ticket Done (`save_issue` state) + post a completion comment
   summarizing what shipped + any deviations/follow-ups the agent flagged.
4. File follow-up tickets for anything the agent surfaced (nits, infra issues).

### Verification rigor (non-negotiable — it's caught real bugs)
- Milestones get an STR-16-style E2E verify ticket: scripted DevPanel scenarios,
  numbers **predicted before clicking and checked to the digit**, two-account
  co-op tests in isolated browser contexts, results recorded in CLAUDE.md.
- This rigor found STR-53 (streak bug), the frozen-web-animations infra issue
  (STR-62), and the reward-banner nit (STR-61). Honest partial results beat
  false green — record failures precisely.

### Git/Linear discipline
- Work happens on `main` for small stuff, direct commits. Bigger reviewable
  drops can go branch → PR → merge (the Linear↔GitHub integration auto-closes
  the ticket on merge — branch names follow `neel/str-N-...`).
- The GitHub↔Linear integration is LIVE (all-repos scope). Merging a PR whose
  branch/body references `STR-N` auto-moves the ticket to Done.
- Keep CLAUDE.md's status section current as milestones close.

### Keeping the owner oriented
- Neel is a designer, not a dev. Lead with outcomes in plain language. Use the
  simulator + HTML mocks to show, not tell. `roadmap.html` is the non-dev board;
  refresh it when milestones close.

---

## 6. Environment & how to run

**Repo:** `/Users/neelsarode/walking-app` · GitHub `neelsarode/stride-quest`
(private, main is source of truth).

**Convex:** dev deployment `warmhearted-akita-881` (team `neel-sarode`).
`ENABLE_DEV_TOOLS=true` is set on it (powers the DevPanel). `.env.local` holds
the deployment URLs and is **gitignored** — on a fresh machine, recreate it:
```
CONVEX_DEPLOYMENT=dev:warmhearted-akita-881 # team: neel-sarode, project: walking-app
EXPO_PUBLIC_CONVEX_URL=https://warmhearted-akita-881.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL=https://warmhearted-akita-881.convex.site
```

**Run it:**
```bash
npx convex dev            # terminal 1: backend watcher (keep running)
npm run web               # terminal 2: browser preview (react-native-web, port 8081)
# OR the real app:
npx expo start --clear    # dev server (use --clear after native dep changes)
npx expo run:ios          # native build → iPhone 17 Pro simulator (needs Xcode)
```

**Simulator:** Xcode 26.6, iOS 26.5 runtime, CocoaPods installed. Device is
iPhone 17 Pro. Boot/relaunch trick if the window vanishes:
```bash
xcrun simctl boot <UDID>; open -a Simulator
xcrun simctl openurl booted "exp+stride-quest://expo-development-client/?url=http%3A%2F%2F192.168.1.194%3A8081"
xcrun simctl io booted screenshot /tmp/sim.png   # to see it
```
**A native rebuild (`npx expo run:ios`) is needed after any new native
dependency** (reanimated already required one; M2.75 adds
`react-native-safe-area-context` → another rebuild).

**Tests:** `node --test --experimental-strip-types tests/*.test.mjs` (78/78).
The `--experimental-strip-types` flag is required (tests import `.ts` files).

**DevPanel:** scroll down in the app; env-gated. Time-travel the clock, inject
steps, fill/drain fuel, activate overdrive, sim teammates + rally, weekly reset,
reset account/onboarding. It's how every scenario gets tested without walking.

---

## 7. Key files / where things live

| What | Where |
|---|---|
| Living architecture/status doc | `CLAUDE.md` (read first) |
| Plain-language kanban | `roadmap.html` |
| All specs | `docs/superpowers/specs/*.md` |
| M2.75 spec (next milestone) | `docs/superpowers/specs/2026-07-15-game-screen-design.md` |
| Battle-scene port plan | `docs/fx-rn-port-plan.md` |
| Design mocks (HTML, open in browser) | `battlefield-ui.html` (full game), `dashboard-ui.html` (M2.75 layout target), `ui-style-lab.html` (UI component source of truth), `onboarding-ui.html` (14-beat flow comp) |
| The procedural HUD kit being ported | `assets/ui-kit.js` |
| M2.75 spike seed | `ui-export-rig.html` |
| Battle scene modules | `src/battle/*` (Sprite, Fighter, Projectile, Boss, BattleScene, fxConfig, anchors, spriteMap) |
| ALL balance/tuning numbers | `convex/gameConfig.ts` (pure data, shared app+backend) |
| Pure fuel math | `convex/fuelMath.ts` |
| ALL visuals config (colors/sizes/sprite paths) | `src/config/assets.ts` |
| Main screen (to be superseded by GameScreen) | `src/screens/DashboardScreen.tsx` |
| Dev tools UI | `src/components/DevPanel.tsx` |
| Sprite packing script | `scripts/pack-sprites.mjs` (M2.75 adds `pack-ui.mjs`) |

---

## 8. Uncommitted / loose ends in the working tree

- `package.json` — has an uncommitted change (`android`/`ios` scripts →
  `expo run:*`) that predates this session across multiple agents. Harmless and
  arguably correct; left uncommitted deliberately (not part of any milestone).
  Commit it if desired, or leave it.
- `rest-layout-check.png` — stray untracked scratch screenshot from 2026-07-12.
  Junk; safe to delete.
- Everything else is committed and pushed. Working tree otherwise clean.

---

## 9. Human-only items waiting on Neel (assigned in Linear)

- **STR-25** — Apple Developer Program enrollment ($99/yr). 1–2 day Apple wait,
  so starting early is free. Gates: real steps on a physical iPhone, TestFlight,
  any paid features. **Highest-leverage thing Neel can do right now.**
- **STR-29** — TestFlight beta with the friend group (needs the Apple account +
  Convex prod).
- **STR-37** — App Store Connect IAP products + Small Business Program (M3-gated).
- **Copy pass** on `onboarding-ui.html` (STR-43) — draft copy shipped; his voice
  refines it. Non-blocking.

**Note:** free personal-team signing can put the dev build on Neel's physical
iPhone (7-day installs, HealthKit allowed) → real steps testable BEFORE the paid
account. Great immediate next test if he plugs in his phone.

---

## 10. The handoff plan — concrete next steps for the incoming model

1. **Read** `CLAUDE.md`, then this file, then the M2.75 spec
   (`docs/superpowers/specs/2026-07-15-game-screen-design.md`).
2. **Confirm state:** `git log --oneline -5` (should show the planning-artifacts
   commit `efdc059` at/near HEAD, pushed), `git status` clean-ish (see §8),
   `node --test --experimental-strip-types tests/*.test.mjs` → 78/78.
3. **Push** the recovered planning commit if not already pushed
   (`git push` — check `git log origin/main..HEAD`).
4. **Optionally surface the M2.75 open questions** (spec §10, listed in §4 here)
   to Neel — a couple genuinely want his call, but none block STR-63/64/66
   (they're pipeline + primitives + shell, upstream of the layout choices).
5. **Dispatch STR-63** (the UI asset pipeline) as a background agent, same
   pattern as §5: read spec §3/§5, grow `ui-export-rig.html` to full inventory,
   build `scripts/pack-ui.mjs`, generate `src/ui/{assets,uiMap.ts,theme.ts}`,
   verify idempotent+deterministic+counts, commit "STR-63: …" (no push).
6. When it lands: gate (tests+tsc), push, mark STR-63 Done + comment, then
   dispatch STR-64 (primitives). Then STR-66 (shell). Then fan out 67/68/69/70
   in parallel. Then STR-71 (verify + flip the flag).
7. **When STR-71 flips `DEV_FLAGS.useGameScreen`:** rebuild the simulator
   (`npx expo run:ios` — safe-area-context adds a native dep) and screenshot to
   confirm the app now looks like `battlefield-ui.html` full-screen. That's the
   milestone's payoff moment — show Neel.

After M2.75, the board is essentially Apple-and-polish: real steps (STR-26),
Convex prod (STR-27), Apple enrollment (STR-25, human), TestFlight (STR-29,
human), then M3 monetization whenever the friend beta proves retention.

---

*The hard, novel work — the game design, economy, multiplayer backend, battle
engine — is done and verified. What remains is presentation polish and the Apple
release chain. Keep the verification rigor; it has earned its keep.*
