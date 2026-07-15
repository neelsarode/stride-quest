# Core Loop v2 — Continuous Combat + Super Attack (Design Spec)

> Status: **owner-approved direction, tuning v1** (decisions locked 2026-07-15).
> Revises the fuel-hybrid loop (`docs/superpowers/specs/2026-07-12-core-loop-fuel-hybrid-design.md`)
> and interacts with the Bonus Boss (`docs/superpowers/specs/2026-07-14-bonus-boss-design.md`).
> All numbers below are TUNABLE starting values in the `gameConfig.ts` /
> `src/config/assets.ts` tradition (data, not logic). Linear milestone:
> **Core Loop v2 — Continuous Combat + Super Attack**.

## 1. What changes, in one paragraph

The battle stops being a slideshow of discrete taps and becomes a **living fight**.
While a hero has fuel it now **continuously, visibly auto-attacks** the boss on a
timer (Winded = slower, Resting = kneels) — the idle DAMAGE economy is unchanged;
we just make it *visible*, like the old `battlefield-ui.html` mock. The manual
**COLLECT** button and concept are **removed** — idle damage still accrues capped
while closed and **auto-applies on open** (no tap). **DEPLOY is renamed SUPER
ATTACK**: mechanically identical (spends the whole banked Energy = steps since your
last Super Attack, with crit + streak + boost), but its animation becomes a
**combo/flurry whose length scales with the bank** — a couple of hits for a small
bank, a rapid barrage for a multi-day stack, capped by a finisher. **Overdrive is
retriggered**: no more charge meter or manual activate — **hitting your daily step
goal automatically enters Overdrive at ×2 damage until the next daily reset**,
boosting both the continuous idle attacks AND super attacks. The fuel /
Winded / Resting engine, streaks, shields, rally, the crowned bonus week, guilds,
and the whole M2.75 game screen all survive untouched except the two dock zones.

**Mental model to preserve in copy:** *every step does three things — keeps your
hero swinging (fuel), charges your next Super Attack (banked steps), and pushes
toward your daily goal; hit the goal → Overdrive for the rest of the day.*

## 2. Decisions

**Locked with the owner (2026-07-15):**
1. Name: **SUPER ATTACK** (replaces DEPLOY, user-facing).
2. Overdrive duration: **until the next daily reset** (not a fixed window).
3. Overdrive multiplier: **×2** (down from ×3 — uptime is now most of a day).
4. Overdrive trigger: **automatic on hitting the daily step goal** (no meter, no
   activate button).
5. Continuous idle-attack loop is primarily a **scene-layer** change (visible
   swings), layered under the existing event-driven specials.

**Proposed here for sign-off (§10 open questions):**
- `DAILY_STEP_GOAL` **8,000 → 6,000** (owner floated 5–7k). *Requires* re-anchoring
  `FUEL.burnPerHourBattling` **300 → 225** to keep the fuel invariant, + a fuel/
  overdrive test retune. Fallback: keep 8,000/300 (zero fuel-test churn).
- `BOSS.baseHP` **150,000 → 300,000** — the higher all-day-Overdrive + Overdrive-on-
  Super ceiling roughly doubles engaged output, so the boss HP must rise to hold the
  ~day-5 kill. Bonus tiers auto-scale (they're fractions of `bossMaxHP`).
- SUPER ATTACK combo shape (hit count, stagger, finisher split) — §5.3.

## 3. Guardrails (unchanged — honored throughout)

1. **Steps are the ONLY source of power.** Overdrive, the combo length, and every
   multiplier are earned by walking. Overdrive is not purchasable (binding for M3).
2. **Never punish inactivity.** Resting stays dignified (kneel art, no red, no HP
   loss, no shame). A missed goal simply means no Overdrive today — never a penalty.
3. **Loss-framing only on bonuses.** Overdrive/streak/boost are gains; never
   "you lost your Overdrive." At the daily reset Overdrive quietly ends (it ran its
   course), same as today.
4. **The party is never punished for a member's lapse.** A resting teammate kneels;
   the crew's progress only slows, never backslides.
5. **Keep the fuel/Winded/Resting system** — it POWERS the continuous loop (it is
   what the hero is *doing* on screen) and remains the daily-walking engine.

## 4. The four changes — overview

| # | Change | Layer | Economy impact |
|---|---|---|---|
| 1 | Continuous idle-attack loop | Scene (ConnectedBattleScene) | **None** — visual only; idle damage settles as today |
| 2 | Remove COLLECT | Backend (mutation) + UI (dock) | **None** — auto-apply-on-open already exists |
| 3 | DEPLOY → SUPER ATTACK (combo) | UI copy + scene visual (+ overdrive factor) | Damage math identical; **+ Overdrive ×2 factor added** |
| 4 | Overdrive retrigger (goal → ×2 until reset) | Backend + UI | ×3→×2, all-day uptime, now also boosts Super Attack |

## 5. The changes in detail

### 5.1 Continuous idle-attack loop (scene-layer)

**Today:** `ConnectedBattleScene` is purely event-driven — a fighter only swings on
`deploy` / `teammate` / `idleCollected` events. Between events the party stands idle.
`BattleScene` already has the machinery for a timer loop (`autoPlay` runs
`SCENE.cycleMs`/`staggerMs`/`specialEvery`) but the connected scene leaves it off.

**New:** `ConnectedBattleScene` gains its own **continuous attack driver** keyed off
each roster member's live fuel state (`guild.overview` already exposes `heroState`):

- **Battling** → the hero throws a **basic** swing every `SCENE.idleLoopCycleMs`,
  phase-offset per member by `SCENE.idleLoopStaggerMs` so the party doesn't swing in
  unison (the staggered-column feel of the mock).
- **Winded** → same loop at `× SCENE.windedCycleMult` (≈2× slower cadence) — visibly
  tired, matching the fuel spec's "slower attack loop."
- **Resting** → **no swings**; the hero kneels (the existing `resting` prop →
  `setResting` → kneel loop + `RestZzz`, untouched).
- **Overdrive active (you)** → the loop speeds up `× SCENE.overdriveCycleMult`
  (≈0.65) — a visible intensification. This **replaces** today's constant
  special-chain overdrive effect (that was sized for a 4h window; Overdrive is now
  all-day, so constant ultimates would be too much).

**These are ambient swings — they carry NO damage number.** The idle economy is
server-settled on interaction, not per-swing; showing a number per swing would
double-count / lie. The projectile flies and the boss flashes (the fight reads as
alive), but no floating number. Real idle damage still surfaces exactly as today:
the auto-apply-on-open volley (`idleCollected`, real banked total split across the
hits) and the HUD's pending-idle context.

**Coexistence with events (no new conflict).** The `Fighter` contract already
guarantees `basic()/special()` only arm from `idle` — a mid-swing or resting fighter
ignores orders. So a continuous basic never collides with an event special: if a
Super Attack lands mid-basic it retries after `RETRY_MS` (existing), and a continuous
basic that lands mid-special is simply skipped. The continuous loop sits **under**
the event-driven layer with zero coordination code.

**Blast radius:** `ConnectedBattleScene.tsx` only (new driver + overdrive-cadence
swap). `BattleScene`/`Fighter` need at most a tiny "ambient = no number" affordance
on `fire()`/`Projectile` (e.g. `damage: null` → hide the number). No economy code.

### 5.2 Remove COLLECT

- **Delete** the COLLECT button + its live `+N` pending chip + `onCollect` handler
  from `CommandDock`, and the `collectIdle` **manual** entry point.
- **Keep the settle math** — it's the same `settleFuelAndIdle` walk. The
  auto-apply-on-open path in `useGameEngine` (the `didCollect` once-per-open effect)
  **stays**; rename the mutation `combat.collectIdle → combat.applyIdleOnOpen` to
  reflect that it is now only the on-open settle (no user-facing "collect"). The
  `firstIdleCollectedAt` stamp + the `idleCollected` "while you were away…" teaching
  moment ride along unchanged.
- The pending-idle **chip** disappears from the dock (nothing to tap-to-collect).
  `usePendingIdle` may still feed an ambient readout elsewhere, but the dock drops it.

**Mid-session idle:** with no manual collect, in-session accrued idle applies on the
next open (the auto-apply). This matches today minus the manual button (deploy never
settled idle either). *(Optional, §10-Q4: also settle idle at the start of a Super
Attack so the dramatic moment banks the session's idle onto the boss.)*

### 5.3 DEPLOY → SUPER ATTACK (combo/flurry)

**Mechanically unchanged.** Still spends the whole Energy bank (= steps since the
last Super Attack, `ENERGY_PER_STEP` 1:1) with the first-of-day guaranteed crit +
streak multiplier + guild boost. Streaks still key off super-attacking daily
(`lastDeployDate` / `deployedToday` semantics = "used their Super Attack today" —
behavior identical; copy/comments updated).

**New — the visual is a combo/flurry** whose length scales with the **bank size**
(energy spent, not damage — so it reflects how much you walked, independent of
crit/streak luck):

- Hit count `N = clamp(round(spent / SUPER_ATTACK.energyPerHit), minHits, maxHits)`.
- The flurry plays `N−1` fast **basic** buildup swings + a final **special**
  (ultimate) **finisher**, staggered `SUPER_ATTACK.hitStaggerMs` apart (a fast
  "rat-a-tat… BOOM").
- **Damage split (sums to the real total exactly — no economy lie):** the finisher
  carries `SUPER_ATTACK.finisherFrac` of the total (the big crit "hero number"); the
  remaining `(1 − finisherFrac)` is split evenly across the buildup basics; any
  rounding remainder goes to the finisher. Total shown == real `r.damage`.

**Why this shape:** the finisher is the single biggest number, preserving the "one
big crit" payoff players already read from today's deploy, while the buildup barrage
makes a multi-day bank *feel* like the stored power it is. Sizing by `spent` (bank),
not damage, means the flurry honestly visualizes walking, not a luck roll.

To size the flurry, the deploy event gains one field: `damageDealt` (source
`deploy`) carries `spent` (energy bank). Everything else about the event is
unchanged. All combo constants are feel-layer (`src/config/assets.ts SUPER_ATTACK`),
so **no balance change and no game-logic test touches the combo.**

**New economy factor — Overdrive ×2 on Super Attack (§5.4):** the one real
mechanical change to the Super Attack is that the `applyDeploy` damage line now also
multiplies by the Overdrive factor when Overdrive is active (goal hit today),
`OVERDRIVE.boostsSuperAttack`-gated. See §5.4.

**Rename scope:** user-facing copy → SUPER ATTACK everywhere (button word, banners,
captions, docs). **Internal identifiers stay** (`combat.deploy` mutation, event
`source: "deploy"`, `lastDeployDate`, `hasEverDeployed`, `deployedToday`) — renaming
them is pure churn with dev-tool/test ripple and zero behavior change; documented so
the next reader isn't surprised.

### 5.4 Overdrive retrigger (goal-hit → ×2 until reset)

**Today:** a charge meter fills from steps past the goal (`overdriveExcessSpent`
derived); the player manually `activateOverdrive` for a fixed 4h ×3 idle window
(`overdriveActiveUntil` stamp); Overdrive does NOT touch deploy damage.

**New:**
- **Trigger:** automatic. When today's step total crosses `DAILY_STEP_GOAL`,
  Overdrive turns on. No meter, no activate button, no stored charge.
- **Duration:** **until the next daily reset** — i.e. `overdriveActiveUntil` is
  auto-stamped to the **end of the current effective day** (guild-tz midnight).
- **Multiplier:** **×2** (`OVERDRIVE.idleDamageMult` 3 → 2).
- **Scope:** boosts the continuous idle attacks (as today) **AND** Super Attacks
  (new — `OVERDRIVE.boostsSuperAttack: true`, a config-flip gate mirroring
  `effectiveBoostMult`). Consistent with the bonus boost's "all damage" philosophy.
- **Winded/Resting interaction (unchanged & correct by construction):** Overdrive
  multiplies whatever damage the state produces — Winded's ×0.5 stacks
  multiplicatively (0.5 × 2), and a Resting hero deals 0 (×2 of 0 = 0). Burn is never
  affected (Overdrive is a pure reward, never a cost) — same as today.

**Implementation seam (reuses the whole settle machinery — minimal blast radius).**
The elegant part: we keep `overdriveActiveUntil` as the wall-clock stamp the existing
piecewise settle already prices against (`overdriveHoursAt` / `idleDamageForSegments`
/ `settleFuelAndIdleWindow` are untouched — only the *meaning* of the stamp changes
from "manual +4h" to "auto end-of-day"). Concretely:

- `recordSteps` (and the dev `injectFor`) — the moment today's day-max ≥
  `DAILY_STEP_GOAL` — stamps `overdriveActiveUntil = endOfEffectiveDay(now)`.
  **Settle-before-change invariant:** `recordSteps` must settle the pending
  fuel+idle window at the *pre-stamp* state **before** granting the new steps and
  writing the stamp (the established pattern), so a past window can never be
  retro-priced with a newer day's stamp. *(Implementation note: confirm the
  steps.ts→idle.ts import graph has no cycle; idle.ts imports only fuelMath/gameConfig
  today.)*
- **Overdrive is otherwise derived:** `overdrive.active = (overdriveActiveUntil >
  effectiveNow)`. At the daily reset the stamp (yesterday's end) is in the past →
  inactive, until the next goal re-stamps. No decay logic, no charge counter.
- **Retire:** the `activateOverdrive` mutation; `overdriveExcessEarned` /
  `overdriveChargeFraction` / `overdriveExcessFromDayTotals` (charge math);
  `users.overdriveExcessSpent` (leave as a deprecated-optional schema field, stop
  writing — non-breaking, like `challengeProgress.jobXp/energy`). No migration.

## 6. Config changes + example math

### 6.1 TUNABLE changes

```ts
// convex/gameConfig.ts — Overdrive retriggered (spec §5.4)
export const OVERDRIVE = {
  idleDamageMult: 2,          // was 3 — all-day uptime, so a gentler multiplier
  boostsSuperAttack: true,    // NEW — the ×2 also multiplies the Super Attack damage line
  // RETIRED: fullChargeExcessSteps, durationHours, maxStoredCharges
} as const;

// Daily goal (proposed 8,000 → 6,000; see §10-Q1). If adopted, RE-ANCHOR:
export const DAILY_STEP_GOAL = 6000;          // was 8000 — reachable so goal→Overdrive fires
// convex/gameConfig.ts — FUEL, re-anchored so 24h battling still costs < a goal day
export const FUEL = {
  burnPerHourBattling: 225,   // was 300 — 24h ≈ 5,400 < 6,000 goal → banks ~+2.4h surplus
  // derived (auto): TANK_CAP 48h=10,800 · STARTER 24h=5,400 · WINDED_THRESHOLD 6h=1,350 · winded 112.5/h
  // ...tankCapHours 48, starterFuelHours 24, windedThresholdHours 6, winded*Mult 0.5 unchanged
} as const;

// convex/gameConfig.ts — boss retune for the higher engaged-output ceiling (§10-Q2)
export const BOSS = { baseHP: 300_000 /* was 150,000 */, tierScaling: 1.4 /* unchanged */ };
```

```ts
// src/config/assets.ts — SUPER ATTACK combo (feel layer; NO balance/tests touched)
export const SUPER_ATTACK = {
  energyPerHit: 1500,   // spent ÷ this → hit count
  minHits: 2,
  maxHits: 10,
  hitStaggerMs: 110,    // fast barrage
  finisherFrac: 0.5,    // final special hit = 50% of total; buildup basics split the rest
} as const;

// src/battle/fxConfig.ts — SCENE, continuous idle-attack loop (scene timing)
// idleLoopCycleMs: 2200, idleLoopStaggerMs: 300, windedCycleMult: 2.0, overdriveCycleMult: 0.65
```

### 6.2 Example math — a typical engaged day (recommended goal 6,000, burn 225, ×2)

Assume mid-week, Job 3 (×3.5 idle mult), streak day 5, avg 8,000 steps/day, normal
week (no bonus boost), 8,000 steps today, banked ~8,000 energy since last Super Attack.

- **Goal:** 8,000 ≥ 6,000 → **Overdrive ×2 on** from goal-cross until midnight.
- **Fuel:** +8,000 fuel; 24h battling costs 5,400 → net **+2,600** banked (~+11.5h) —
  goal days grow the tank, never tread water.
- **Continuous idle (visible all day; banks the OFFLINE_CAP 10h between opens):**
  base `150 × 3.5 = 525` dph; Overdrive-covered portion ×2. ~10h settled ≈ **5,250
  baseline → up to ~10,500** with the ×2 goal-portion. (Winded/Resting scale it
  down/0, unchanged.)
- **Super Attack flurry:** streak mult `= 1 + 0.08·4 (day) + 0.25·(8000/6000)=0.333
  (intensity) + 0.1·2 (job) ≈ 1.85`; first-of-day crit ×2; Overdrive ×2; boost ×1.
  `8,000 × 2 × 1.85 × 2 ≈ 59,200` damage.
  Flurry length `N = clamp(round(8000/1500), 2, 10) = 5` (4 buildup + finisher).
  Split: finisher `= round(0.5·59,200) = 29,600`; each buildup `= 29,600/4 = 7,400`;
  shown "7.4k · 7.4k · 7.4k · 7.4k · **29.6k!**", sum = 59,200 (== real).
- **Engaged daily output** ≈ idle (~8–10k) + Super (~59k) ≈ **~68k/day**.

### 6.3 Boss pacing after the retune

- Solo, `baseHP 300,000`, ~68k/day → **kill ≈ day 5** (holds the fuel-hybrid target).
- Bonus tiers are fractions of `bossMaxHP` → **auto-scale** with the new baseHP
  (solo T1/T2/T3 = 75k/150k/300k). No separate bonus retune needed.
- Deploy ceiling check (worst case, all earned): crit ×2 · streak ×3.0 · boost ×1.35 ·
  Overdrive ×2 = **×16.2**. Rare confluence (11+ day max-intensity streak, bonus week,
  first-strike crit, goal today, big bank). Watch in playtest; `baseHP` /
  `OVERDRIVE.boostsSuperAttack` are the knobs (§10-Q3).

### 6.4 If the goal stays 8,000 (fallback)

Keep `FUEL.burnPerHourBattling 300` and all fuel constants/tests as-is; only
`OVERDRIVE.idleDamageMult 3→2` + `boostsSuperAttack` + `BOSS.baseHP` change. Overdrive
uptime is lower (fewer players clear 8k), but the mechanic is identical. This is the
**zero-fuel-test-churn** path.

## 7. Blast-radius analysis (per file)

| File | Changes | Stays | Ripples |
|---|---|---|---|
| `convex/combat.ts` | Rename `collectIdle → applyIdleOnOpen`; add Overdrive `×2` factor to `applyDeploy` damage line (`boostsSuperAttack`-gated) | deploy/applyDeploy pipeline, streak/crit/boost, bonus routing, `resolveBoss`, `ensureCurrentChallenge`, `spawnBoss` | Bonus-phase Super Attacks now also ×2 when goal-hit (meter fills faster — fine, no cap) |
| `convex/idle.ts` | **None** (code); the stamp it reads is now goal-driven | `settleFuelAndIdle`, damage routing (boss vs bonus meter), offline cap | Overdrive pricing unchanged — only `OVERDRIVE.idleDamageMult` value differs |
| `convex/overdrive.ts` | **Heavy:** delete `activateOverdrive`, `overdriveExcessEarned`, charge helpers; reshape `overdriveStatus` → `{active, mult, endsAt, stepsToday, goal}` derived from stamp + steps | — | Dashboard `overdrive` payload shape (§ game.ts) |
| `convex/fuelMath.ts` | Remove `overdriveExcessFromDayTotals` + `overdriveChargeFraction` (charge math retired) | `walkFuel`, `overdriveHoursAt`, `idleDamageForSegments`, `settleFuelAndIdleWindow`, all state/burn math | `OVERDRIVE.idleDamageMult` 3→2 (gameConfig, not here) flows through automatically |
| `convex/economy.ts` | **None** | energy derivation, whole-bank spend | — |
| `convex/steps.ts` | `recordSteps`: settle fuel+idle first, then grant, then stamp `overdriveActiveUntil = endOfEffectiveDay` when day-max ≥ goal | append-only ledger, day-max derivation | Needs active-challenge/progress fetch + `endOfEffectiveDay` helper; import-graph check |
| `convex/gameConfig.ts` | `OVERDRIVE` retune; `DAILY_STEP_GOAL` (proposed); `FUEL.burnPerHourBattling` (if goal lowered); `BOSS.baseHP` | streak/crit/bonus/job/rally/shield config, all pure helpers | `DAILY_STEP_GOAL` feeds streak intensity, overdrive trigger, fuel anchor — retune together |
| `convex/game.ts` (dashboard) | `overdrive` payload reshape (drop charge/ready/chargePct; add active/mult/goal/stepsToday/endsAt/remaining) | `idle.dph`/`pending` (still ×mult when active), fuel/meters/streak/bonus/boost/rally/shields/dailyGoal | `useGameEvents` overdrive diff + OverdriveBar consume the new shape |
| `convex/streak.ts` / `streakMath.ts` | **None** (copy/semantics only) | shield-aware continuation, intensity avg | `deployedToday` now means "super-attacked today" |
| `convex/dev.ts` | Retire `fillOverdrive` (inject ≥ goal now auto-triggers Overdrive); resetAccount drops `overdriveExcessSpent` | `simulateTeammateDeploy`, time-travel, inject, rally/shield/fuel controls | Dev "test overdrive" = inject a goal day |
| `convex/schema.ts` | `overdriveExcessSpent` → deprecated-optional (stop writing); `overdriveActiveUntil` comment updated (repurposed) | all tables/indexes | **No migration** (both optional) |
| `src/battle/ConnectedBattleScene.tsx` | Add continuous idle-attack driver (per-hero cadence from `heroState`); Super Attack case → flurry; Overdrive → cadence speed-up (replaces special-chain) | idleCollected volley, teammate/deploy event wiring, crowned-form swap, prefetch | Reads `overview.members[].heroState` for cadence; needs `spent` on the deploy event |
| `src/battle/BattleScene.tsx` / `Fighter.tsx` | Small: "ambient = no damage number" affordance on `fire()`/`Projectile` | layout math, release timing, rest kneel, `autoPlay` (untouched) | — |
| `src/game/zones/CommandDock.tsx` | Remove COLLECT button + pending chip + handler; DEPLOY word → "SUPER"; emit `spent` | streak chip, first-strike-crit hint, first-deploy pulse, steps ring, goal glow | — |
| `src/game/zones/OverdriveBar.tsx` | Remove ACTIVATE/charge fill/activate countdown; → goal-hit status ("WALK TO GOAL FOR ×2" / "OVERDRIVE ×2 · until reset") | slim gauge chrome | Reads `overdrive.active` |
| `src/game/useGameEngine.ts` | Rename `collectIdleMut → applyIdleOnOpenMut`; drop `onCollectIdle` + `onActivateOverdrive` + `activateOverdriveMut` | auto-collect-on-open effect, all other effects/handlers | — |
| `src/feedback/events.ts` / `useGameEvents.ts` | `damageDealt` deploy gains `spent`; `overdriveStarted` drops `durationHours` (→ "until reset"); copy → "×2 all day" | overdrive active→banner diff, all other events | Feedback treatment copy |
| `tests/overdrive.test.mjs` | **Rewrite (~13):** drop charge-fraction/excess tests (retired); retune ×3→×2; add goal-gated end-of-day-stamp window pricing + `boostsSuperAttack` | — | Net test-count delta |
| `tests/fuel.test.mjs` | **Audit (24):** retune any ×3 / 300-burn / 8k-goal hardcodes IF goal→6k adopted; else only the ×3 audit | pure burn/state tests unaffected | — |
| `tests/bonusMath.test.mjs` | **Audit (18):** confirm it passes explicit `killedBossMaxHP` values (not `BOSS.baseHP`) so the baseHP change doesn't break it | likely unaffected | — |
| `tests/rally / shields / inviteCode` | **None** | — | — |

**Bonus-boss interaction (called out):** post-kill Super Attacks and idle already
route to `bonusDamageContributed`; both now carry the Overdrive ×2 when goal-hit, so
the bonus meter fills faster on engaged days — safe (the meter has no cap; tiers are
fractions of `bossMaxHP`, which rose with the retune, so thresholds scale in
lockstep). No change to the bonus reward stamping or `effectiveBoostMult`.

**Streak interaction:** none — streak keys off `lastDeployDate`, still written by the
Super Attack. The Overdrive ×2 multiplies AFTER the streak multiplier, same as crit.

## 8. Scene design (continuous loop + flurry)

**Continuous loop (per member, in `ConnectedBattleScene`):**
- One self-rescheduling timer per roster member. Period = `idleLoopCycleMs ×
  (winded ? windedCycleMult : 1) × (overdriveActive && isMe ? overdriveCycleMult : 1)`,
  first fire offset by `index × idleLoopStaggerMs`.
- Each tick: `fire(member.id, "basic", /* ambient, no number */ null)`. Resting
  members are skipped (their fighter also refuses the order — belt and suspenders).
- On roster/heroState change, restart the affected member's timer (latest-state ref,
  no stale closures — same pattern as the existing effect).

**Super Attack flurry (deploy event, `source: "deploy"`):**
- On the event, read `spent` → `N = clamp(round(spent/energyPerHit), min, max)`.
- Schedule `N` `fire(meId, …)` calls `hitStaggerMs` apart: the first `N−1` as
  `"basic"` with the split buildup damage, the last as `"special"` with the finisher
  damage. If a `fire` returns false (busy), retry once after `RETRY_MS` (existing).
- The overlay floating numbers flow from each impact as today (real, summing to
  `r.damage`). Teammate super-sized hits keep the single-special treatment for now
  (their real number on one impact); a short teammate flurry is an optional follow-up.

## 9. UI changes

**CommandDock:** COLLECT column (button + `+N` chip + caption) deleted. The DEPLOY
column becomes the SUPER ATTACK column — same gold hero button (`btn_deploy_gold`
plate reused), face word "SUPER", live energy cost + streak `×N.NN` chip + first-
strike-crit hint + first-use teaching pulse all retained. Its handler emits the
deploy event with `spent` so the scene sizes the flurry.

**OverdriveBar:** the charge meter + ACTIVATE button + activate-countdown are retired.
It becomes a slim status strip: **inactive** → progress toward the goal
("WALK TO YOUR GOAL FOR OVERDRIVE ×2", mirroring the steps ring); **active** →
"OVERDRIVE ×2 · UNTIL RESET" (calm, celebratory purple, no interaction). The goal-hit
moment already lights the steps-ring GOAL! chip in the dock, and the automatic
`overdriveStarted` banner ("OVERDRIVE ×2 — all day!") fires from the reactive diff.

## 10. Migration & verification plan

**Migration:** none required — every schema touch is a deprecation of an existing
optional field (`overdriveExcessSpent`) or a repurposed comment (`overdriveActiveUntil`).
Live users keep their fuel/energy/streak/shields; a stale `overdriveActiveUntil` from
the old manual system simply reads as inactive (its time has passed) and is
overwritten on the next goal-hit. `dev.resetAccount` clears it as today.

**Verification (STR-16/59/71-style browser sign-off before "done"), via DevPanel
time travel + a fresh anonymous account, numbers checked to the digit:**
1. **Continuous loop:** Battling → visible staggered swings; drain to Winded →
   cadence visibly slows; Resting → kneel, zero swings; wake → resumes. Zero damage
   numbers on ambient swings; boss flashes.
2. **Auto-apply, no collect:** COLLECT button absent; open with pending idle →
   "while you were away" volley banks the exact capped amount; no manual tap anywhere.
3. **Super Attack flurry:** small bank (~1.5k) → 2 hits; ~8k → 5 hits; multi-day
   stack (>15k) → capped `maxHits`; the impact numbers **sum to the real
   `r.damage`**; finisher is the largest.
4. **Overdrive retrigger:** cross the goal → Overdrive ×2 turns on automatically,
   banner fires; idle dph and the next Super Attack both show ×2; advance to the
   daily reset → Overdrive off (no punishment framing); re-cross next day → on again.
5. **Winded/Resting under Overdrive:** Winded ×0.5 × ×2 verified; Resting = 0.
6. **Bonus week:** kill early → crowned form; post-kill Super Attack + idle carry the
   ×2 into the bonus meter; tiers still fractions of the (new) `bossMaxHP`.
7. **Boss pacing:** engaged solo kills the `300k` boss ≈ day 5; Monday rollover
   tier-2 boss scales; jobs reset, fuel/energy/streak/shields persist.
8. **Regression:** streak still ticks daily off the Super Attack (survives rollover
   via shields); rally/guild/game-screen untouched; `npm run typecheck` clean; test
   suite green (overdrive rewritten, fuel/bonus audited).

## 11. Open questions for Neel — RESOLVED 2026-07-15

1. **Daily goal → 6,000.** `DAILY_STEP_GOAL 8,000→6,000`; re-anchor
   `FUEL.burnPerHourBattling 300→225` and retune the fuel/overdrive tests (owner
   decision — reachable goal so Overdrive fires daily).
2. **Boss baseHP → 300,000** as the starting retune; fine-tune in playtest.
3. **Overdrive on Super Attack → KEEP "all"** (`boostsSuperAttack: true`). The ×2
   multiplies the Super Attack too; the rare max-stack ceiling is accepted (all
   upside, never a punish).
4. **Settle idle on Super Attack → OFF** (default; keep the flurry number clean).
5. **Ambient specials → NO — basics only** (owner decision). The continuous loop is
   steady basic attacks; specials/ultimates are reserved for Super Attack, keeping
   that moment distinct and impactful.
6. **Combo finisher split → `finisherFrac 0.5`** (barrage feel, matches the "fast
   succession" vision).
