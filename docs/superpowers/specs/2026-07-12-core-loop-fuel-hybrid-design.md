# Core Loop Evolution — Fuel Hybrid (Design Spec)

> Status: **approved direction, tuning v1** (user sign-off 2026-07-12 on the hybrid
> model + the three open decisions). Research + rationale: `docs/gameplay-loop-design.pdf`.
> All numbers below are TUNABLE starting values in the `gameConfig.ts` tradition.

## 1. What changes, in one paragraph

Steps become **fuel** for a hero who fights the boss continuously, replacing the
abstract "idle multiplier drip" fiction. The existing DEPLOY (bank-and-burst with
crits + streak multiplier) survives unchanged as the daily appointment moment.
Two new systems: **Overdrive** (player-activated special-attack mode charged by
walking past the daily goal) and **Rally** (send a resting friend some fight time,
at a small cost to yourself). One new forgiveness system: **Streak Shields**
(auto-applied streak freezes, Duolingo-style). Two guardrails are locked:
the party is never punished for a member's inactivity, and loss-framing only
ever applies to bonuses — never to earned progress, XP, or the character.

## 2. Decisions locked with the user (2026-07-12)

1. **Model:** hybrid — 24/7 fuel-burning idle fight + daily DEPLOY + Overdrive.
2. **Fuel burn rate:** calculated below (300 steps/hour battling).
3. **Overdrive trigger:** player-activated (saved charge, popped when they choose).
4. **Rally (fuel sharing):** costs the giver a little (500 energy).

## 3. The fuel system

**Units:** fuel is measured in steps (1 step = 1 fuel). Time-to-empty is what the
UI shows ("Your hero can fight for 9 more hours").

**Burn-rate derivation:** anchor = the existing `DAILY_STEP_GOAL` (8,000). A full
24h of fighting should cost slightly LESS than a goal day, so goal-hitters build a
buffer instead of treading water: **300 fuel/hour** → 24h costs 7,200 steps; an
8k-goal day banks ≈ +2.7h surplus. (8,000/24 ≈ 333 would be exact break-even —
deliberately not chosen.)

**Hero states** (each maps to existing animation sets):

| State | Condition | Damage | Burn | Animation |
|---|---|---|---|---|
| **Battling** | fuel > 1,800 (6h) | `BASE_IDLE_DPH` (150) × job mult | 300/h | attack loop |
| **Winded** | 0 < fuel ≤ 1,800 | ×0.5 | 150/h (so the last 6 nominal hours stretch to 12 real hours) | slower attack loop |
| **Resting** | fuel = 0 | 0 | 0 | idle anim at campfire — cozy, never shameful; no HP loss, no party damage, no red UI |

**Tank:** cap 48h (14,400 fuel) — a big weekend carries a player through 2 rest
days. New users start with 24h (7,200 fuel) so the first session never shows a
resting hero. Fuel persists across weekly resets (like energy; jobs still reset).

**Offline interaction:** the existing `OFFLINE_CAP_HOURS` (10) still pauses idle
damage accrual — and fuel burn pauses WITH it. Being unable to open the app never
wastes the tank; absence pauses, never punishes.

**Energy is untouched:** every step still grants 1 deployable Energy (ledger −
spent) AND fuel. Fuel is a time-gate, energy is an amount — no splitting, no
double-spend. DEPLOY still spends the whole bank with crits + streak multiplier.
A rested-out hero can still DEPLOY (deploy is energy, not fuel) — walking a burst
after a lapse gives an immediate comeback moment.

### Config additions (`convex/gameConfig.ts`)

```ts
export const FUEL = {
  fuelPerStep: 1,            // TUNABLE
  burnPerHourBattling: 300,  // 24h of fighting ≈ 7,200 steps — just under the 8k goal
  tankCapHours: 48,          // 14,400 fuel max banked
  starterFuelHours: 24,      // new heroes fight from minute one
  windedThresholdHours: 6,   // = 1,800 fuel
  windedDamageMult: 0.5,
  windedBurnMult: 0.5,
} as const;
```

## 4. Overdrive (player-activated fever mode)

- **Charge:** every step ABOVE the daily goal charges the meter; **4,000 excess
  steps = 100%** (calibrated to the "20k in 2 days" example: 20k − 16k goal = 4k).
- **Activation:** manual — a charged button the player pops when they choose
  (agency makes it feel earned). Requires the hero not be Resting. One charge
  stored max; the meter holds at 100% until used.
- **Effect:** for **4 hours**, idle damage ×3 and the hero chains the per-job
  `special/` animations (the art already exists for all 40 jobs). Normal fuel
  burn — Overdrive is a pure reward, never a cost.
- Sizing check: Job 3 → 150 × 3.5 × 3 = 1,575 dph × 4h = 6,300 damage (~+4,200
  over baseline). Noticeable spike, clearly below a deploy — spikes live on
  attention, idle stays the floor.

```ts
export const OVERDRIVE = {
  fullChargeExcessSteps: 4_000, // steps past DAILY_STEP_GOAL charge the meter
  durationHours: 4,
  idleDamageMult: 3,
  maxStoredCharges: 1,
} as const;
```

## 5. Rally (teammate fuel gift)

- Giver spends **500 Energy** (≈6% of a goal day — real but small; gifts that
  cost something carry social weight) → receiver gains **6 hours of fuel**.
- Receiver must be **Winded or Resting** (it's a wake-up, not a subsidy — and
  prevents fuel-banking loops between friends). Tank cap still applies.
- Limit: **1 Rally sent per giver per day**. The receiver sees WHO sent it —
  the nudge comes from a friend, not the app (the pattern that beats push
  notifications).

```ts
export const RALLY = {
  energyCost: 500,
  fuelHoursGiven: 6,
  perGiverPerDay: 1,
} as const;
```

## 6. Streak Shields (forgiveness)

- Earn 1 Shield by hitting the daily step goal on **5 days within one Mon–Sun
  week**. Hold at most **2**.
- On a missed deploy day, a Shield **auto-applies silently** (protection is in
  the pocket before it's needed): the streak survives (doesn't increment, doesn't
  reset). One sick day never erases two weeks of momentum.

```ts
export const STREAK_SHIELD = {
  goalDaysPerWeekToEarn: 5,
  maxHeld: 2,
  autoApply: true,
} as const;
```

## 7. Boss HP retune

Per-member weekly output rises under this model (idle ≈ 77k for a goal-walker
climbing the job ladder, daily crit deploys ≈ 156k, occasional Overdrive). Raise
`BOSS.baseHP` **60,000 → 150,000** per member (TUNABLE) so an engaged crew kills
around day 5–6. `tierScaling` 1.4 unchanged. This also resolves the standing
"baseHP too low, deploys one-shot it" note in CLAUDE.md.

## 8. Guardrails (write in stone)

1. **The party is never punished for a member's inactivity.** A resting member
   means slower progress, never backsliding (Habitica's one proven mistake).
2. **Loss-framing only applies to bonuses** (streak multiplier, Overdrive
   charge) — never to earned progress, XP, energy, or the character itself.

## 9. Implementation seams (high level — details belong to the plan)

- **Fuel accounting** follows the existing derived-economy pattern: lifetime fuel
  earned (steps × fuelPerStep + starter + rallies) minus burn settled against the
  server-owned clock (`convex/time.ts`), same settle-on-interaction shape as idle
  accrual today. Burn is piecewise by state (Battling/Winded/paused-offline).
- **New per-user fields** (shape, not final names): settled fuel + settle
  timestamp, overdrive charge + active-until, shields held, rally-sent day marker.
- **Feedback layer:** state transitions (Battling→Winded→Resting, Overdrive
  start/end, Rally received) become semantic events in the existing
  `src/feedback/*` pipeline; animations map to existing sprite sets (attack /
  idle / special).
- **Dev tools:** extend `convex/dev.ts` with fuel/overdrive/rally time-travel
  controls so the whole loop is testable in the browser like Phase 2 was.

## 10. Session cadence this produces (the retention skeleton)

Two 30-second check-ins/day (collect + glance at the living battlefield) + one
deliberate session (DEPLOY, maybe pop Overdrive) + the weekly boss kill as the
shared co-op payoff. Matches the proven stack: idle floor, daily anchor,
attention spike, forgiving weekly arc.
