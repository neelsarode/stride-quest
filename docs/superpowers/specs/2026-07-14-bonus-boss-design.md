# The Bonus Boss — Victory Week (Design Spec)

> Status: **approved direction, tuning v1** (user sign-off 2026-07-13 on the
> bonus-boss concept: upgraded post-kill boss, accumulating damage meter, tiered
> next-week reward). Supersedes the STR-53 "victory-lap deploy" quick fix —
> this feature IS the fix. All numbers below are TUNABLE starting values in the
> `gameConfig.ts` tradition (data, not logic). Linear: milestone
> **M1.5 — Bonus Boss (victory week)**.

## 1. What changes, in one paragraph

When the crew kills the weekly boss before Sunday, an **upgraded Bonus Boss**
spawns immediately — the same monster, crazier, wearing a scary crown (crowned/
corrupted form of the boss the crew just killed). The party fights it for the
rest of the week. It has **no health bar**: instead an **accumulating damage
meter** counts every point of party damage dealt to it. At Monday rollover the
crew earns a **guild-wide damage multiplier for the whole next week**, tiered by
total bonus damage (×1.1 / ×1.2 / ×1.35). Post-kill deploys and idle damage now
have a real target — which **resolves bug STR-53** (deploy vs a dead boss
silently no-oped: energy wasn't spent, the streak didn't tick, and streaks died
through held shields — engaged players were punished for killing early).

## 2. Why this shape (and what it fixes)

- **STR-53, verified live 2026-07-13:** kill the boss on day 5 (every engaged
  solo player does, at current tuning) → every later deploy that week silently
  did nothing → streak 5 → 0 across the rollover *through a held Streak Shield*
  (two "missed" days = unsalvageable). Direct violation of the never-punish-
  engagement guardrail. With the Bonus Boss, post-kill deploys run the **full
  normal deploy pipeline** — energy spends, first-of-day crit fires, streak
  ticks, shields untouched — the damage just lands on the bonus meter.
- **The victory week stays alive.** Today a Wednesday kill means 4 dead days.
  Now the strongest weeks (early kills) get the most gameplay, and walking keeps
  mattering every single day.
- **Accumulating (not depleting) meter** = pure bonus framing. There is nothing
  to fail: no HP to finish, no decay, no deadline pressure. Every hit only adds.
- **The reward softens the difficulty ramp it feeds.** Each kill makes next
  week's boss +40% tougher (`tierScaling` 1.4). The bonus boost (max +35%) is
  deliberately **smaller** than the ramp — it helps the crew climb the wall
  their victory built, but can never cancel it (no runaway snowball).

## 3. Mechanics — the bonus phase

**Spawn:** the moment `resolveBoss` flips the challenge `active → won`
(the existing single shared kill-write), the same write stamps the bonus phase:
the crowned form appears with a "THE CROWNED <BOSS> RISES" banner. No new
challenge row — the bonus phase lives ON the won challenge (see §5).

**Duration:** from the kill until the week ends (Sunday, guild-tz). A Saturday-
night kill gets a short window; that's fine — the floor is ×1.0, never a loss.

**Damage routing while the challenge is `won`:**

| Source | Behavior |
|---|---|
| **Deploy** | Full normal pipeline: spends the whole Energy bank, first-of-day guaranteed crit, streak multiplier, streak ticks, shields settle — identical math to a live-boss deploy. Damage lands in the member's `bonusDamageContributed`. (This is the STR-53 fix.) |
| **Idle / fuel** | The hero keeps fighting: `settleFuelAndIdle` banks its damage into `bonusDamageContributed` instead of discarding it (today's victory-lap `collectIdle` settles fuel but throws the damage away — a subtle punishment, also fixed). `OFFLINE_CAP_HOURS` unchanged. |
| **Overdrive / Rally** | Work unchanged — they modify idle damage / fuel, which now has a target. |

**The meter:** party total = Σ `bonusDamageContributed` across the week's
progress rows (same derived pattern as boss HP — each member writes only their
own row, no write contention). It only ever counts up.

## 4. The reward — tiers, numbers, math

**What it is:** a **guild-wide damage multiplier stamped on next week's
challenge**. Everyone in the guild gets the same boost regardless of personal
contribution (shared co-op payoff, like the shared boss).

**What it applies to — decision: ALL damage** (deploys + idle + next week's own
bonus-phase damage), marked TUNABLE. Rationale: (a) legibility — "all your
damage is ×1.2 this week" is one sentence with no fine print; (b) playstyle
fairness — the fuel hybrid made idle a first-class channel, so a deploys-only
boost would quietly favor deploy-heavy players, and an idle-only boost would be
invisible at the most exciting moment (the deploy); (c) compounding safety
comes from the **cap**, not the scope. Implementation is exactly two multiply
sites (deploy damage line + idle settle), so re-scoping later is a config flip.

**Thresholds scale automatically.** Tier thresholds are **fractions of the
killed boss's `bossMaxHP`** — which already scales with member count AND
difficulty tier (`baseHP × members × tierScaling^(tier−1)`). Small guilds and
late tiers inherit the right scale for free, and any future `baseHP` retune
carries the bonus tiers with it. No separate scaling formula to keep in sync.

### Config (`convex/gameConfig.ts`) — all TUNABLE starting values

```ts
/** Bonus Boss: when the weekly boss dies early, its crowned form rises for the
 *  rest of the week. No HP — an ACCUMULATING damage meter. At rollover the
 *  guild earns a next-week damage multiplier tiered by total bonus damage.
 *  Floor is ×1.0 (ignoring it costs nothing); boost is EARNED by walking only. */
export const BONUS_BOSS = {
  namePrefix: "Crowned",        // display name: "Crowned <bossName>" — TUNABLE
  // Reward tiers — thresholds are FRACTIONS of the killed boss's bossMaxHP
  // (already scaled by member count × tier, like everything else).
  tiers: [
    { thresholdFrac: 0.25, boostMult: 1.1 },  // TUNABLE start
    { thresholdFrac: 0.5,  boostMult: 1.2 },  // TUNABLE start
    { thresholdFrac: 1.0,  boostMult: 1.35 }, // a full second boss — TUNABLE start
  ],
  maxBoostMult: 1.5,            // hard safety ceiling — TUNABLE start
  boostAppliesTo: "all" as "all" | "deploys" | "idle", // decided: all — TUNABLE
} as const;

/** Pure helpers (shape like streakMultiplierFrom — deploy and UI preview MUST
 *  share them so the number shown == the number applied):
 *  bonusTierFor(totalBonusDamage, killedBossMaxHP) → { tier: 0..3, mult: 1.0..1.35 }
 *  nextBonusTierTarget(totalBonusDamage, killedBossMaxHP) → { damageToGo, mult } | null
 */
```

### Example math — 4-member guild, week tier 1

- `bossMaxHP` = 150,000 × 4 members = **600,000**.
- Bonus tiers: **T1 = 150,000 → ×1.1** · **T2 = 300,000 → ×1.2** ·
  **T3 = 600,000 → ×1.35** (deal a whole second boss's worth).
- Engaged crew (~10k steps/day each) kills the boss around **day 5** (STR-16
  verified pacing) → ~2-day bonus window.
- Late-week output per engaged member ≈ 35–40k damage/day (Job 4 idle ≈
  150 × 6 dph fueled, + a daily crit/streak deploy ≈ 20–40k).
- 4 members × 2 days × ~37k ≈ **~300k → lands Tier 2 (×1.2)**. Tier 1 is the
  near-guaranteed floor for any crew still playing (needs only ~19k each over
  2 days); Tier 3 takes an early (day 3–4) kill or a monster weekend.
- Next week: tier-2 boss = 600,000 × 1.4 = **840,000 HP**, fought at ×1.2 —
  plays like ~700,000. The boost softens the ramp, never cancels it.
- **Solo sanity check:** boss 150k → T1 = 37.5k / T2 = 75k / T3 = 150k; a
  2-day window at ~35k/day ≈ 70k → T1 comfortably, T2 within reach. Scales
  because the thresholds are fractions of the member-scaled HP.

### Cap interplay with the streak multiplier

Deploy worst case today: streak cap ×3.0. With the boost: 3.0 × 1.35 =
**×4.05** (a modest +35% on the extreme case). `maxBoostMult: 1.5` hard-caps
the boost even if tiers are added later → absolute worst case ×4.5. The boost
also cannot self-compound: it's recomputed from scratch each week from that
week's bonus damage, and higher weekly tiers raise both the boss HP *and* the
bonus thresholds in lockstep.

## 5. Schema + rollover changes (minimal shape)

All widens are `v.optional(...)` — non-breaking, no migration.

**`challenges`** (the bonus phase lives on the won challenge — no second row
per week, so `ensureCurrentChallenge`'s "one challenge per weekStart" invariant
holds):

```ts
// --- Bonus Boss (M1.5). Stamped by resolveBoss at the kill write:
bonusStartedAt: v.optional(v.number()),   // effective ms of the kill; presence = bonus phase ran
bonusBossName: v.optional(v.string()),    // "Crowned <bossName>"
// --- Stamped by spawnBoss on the NEXT week's challenge (reward in force):
boostMult: v.optional(v.number()),        // guild-wide damage mult this week (absent = ×1.0)
boostSourceDamage: v.optional(v.number()),// last week's total bonus damage (reward banner/history)
```

**`challengeProgress`**:

```ts
bonusDamageContributed: v.optional(v.number()), // per-member, defaults 0 — meter = Σ
```

**Phase is derived, not stored:** bonus phase active ⇔ `status === "won"` ∧
week not over. No new status literal; the existing victory-lap branch of
`ensureCurrentChallenge` (won challenge returned unchanged until Monday) is
already correct.

**Write sites:**

1. **`resolveBoss`** (combat.ts — the existing single shared kill transition,
   so the bonus spawn can't double-fire): patch `status: "won"` +
   `bonusStartedAt: now` + `bonusBossName`.
2. **`deploy` / `applyDeploy`**: the `status !== "active"` rejection is
   **deleted**. `won` → identical pipeline, damage written to
   `bonusDamageContributed` (skip `resolveBoss` — nothing to resolve).
3. **`collectIdle` victory-lap branch**: replace "settle fuel, discard damage"
   with "settle fuel + bank damage into `bonusDamageContributed`".
4. **`spawnBoss`** (called only from `ensureCurrentChallenge`, the single
   writer of weekly rollover — the reward computation belongs HERE): when the
   prior week's challenge is `won`, sum its progress rows'
   `bonusDamageContributed`, run `bonusTierFor(total, prior.bossMaxHP)`, and
   stamp `boostMult` + `boostSourceDamage` on the new challenge (omit both when
   tier 0 / prior expired). Single writer ⇒ stamped exactly once.
5. **Boost application** (exactly two multiply sites, `boostAppliesTo`-gated):
   `applyDeploy`'s damage line and `settleFuelAndIdle`'s banked damage (callers
   pass the current challenge's `boostMult ?? 1`).
6. **ConvexError polish (folded from STR-53):** remaining rejections in
   `deploy` ("No guild yet"), `activateOverdrive`, and `sendRally` switch from
   plain `Error` to `ConvexError` with friendly player-readable messages, so
   STR-14/15 UIs can display them. The "Boss already defeated" throw disappears
   entirely — it becomes the bonus deploy.
7. **Dev tools:** existing `simulateTeammateDeploy` and `triggerWeeklyReset`
   already route through `applyDeploy` / `ensureCurrentChallenge`, so the whole
   phase is browser-testable; add a dev readout of bonus totals + stamped boost.

**Dashboard (`game.ts`)** additions:

```ts
bonus: {                 // null unless boss.status === "won"
  bossName,              // "Crowned Sloth Tyrant"
  totalDamage,           // party accumulating meter (Σ bonusDamageContributed)
  myDamage,              // viewer's contribution
  tiers,                 // [{ threshold (absolute), boostMult }] — thresholdFrac × bossMaxHP
  currentTier,           // 0..3
  currentMult,           // 1.0 | 1.1 | 1.2 | 1.35 (what rollover would stamp NOW)
  nextTier,              // { damageToGo, boostMult } | null — the preview readout
} | null,
boost: {                 // this week's active reward, null if none
  mult,                  // challenge.boostMult
  sourceDamage,          // last week's bonus damage that earned it
} | null,
```

## 6. UI requirements

- **Boss swap moment:** on the kill, the victory banner plays as today, then
  the crowned form rises (banner: "THE CROWNED <BOSS> RISES — every hit counts
  toward next week's power"). Boss art swaps to the bonus form; the boss
  auto-scale rule holds (never shorter than the party — the crown helps).
- **Accumulating damage meter** replaces the HP bar during the bonus phase:
  counts **up**, never drains. Gold/celebration treatment per the UI art
  direction (stone base + gold = high-hierarchy), visually distinct from the
  red depleting HP bar. **Tier markers** sit on the meter at the three
  thresholds, labeled with their mults (×1.1 / ×1.2 / ×1.35); crossing one
  fires a banner + FX moment (these crossings are the phase's "kill moments").
- **Tier-preview readout** under the meter, mirroring the streak "×N.NN power"
  preview: "Next week: **×1.2 power** — 38,400 damage to ×1.35". MUST share the
  pure helper with the rollover stamping so shown == applied. At tier 0 it
  reads "Deal 150,000 to earn ×1.1 next week" — never "you're losing X".
- **Deploy button stays live** in the bonus phase (the visible face of the
  STR-53 fix): full juice — crit flashes, floating numbers flow into the meter,
  streak flame ticks.
- **Reward banner** at the Monday rollover (first open): "The crew dealt
  412,000 bonus damage — **×1.2 power all this week!**" via the existing
  Banner/feedback pipeline. The new boss card shows a persistent **active-boost
  chip** (e.g. "⚡ ×1.2") all week, and teammate/guild views show it too —
  shared payoff should be visible to everyone.
- **Tier 0 rollover:** the normal new-boss arrival, nothing else. No "you
  missed the bonus" messaging anywhere, ever.
- **Guild board:** per-member `bonusDamage` shown alongside weekly contribution
  (data via `guild.overview`); recognition badges stay improvement-based —
  bonus damage must NOT become a raw-output leaderboard.

## 7. Guardrails (write in stone — spec §8 of the fuel-hybrid doc extends here)

1. **Never punish.** Ignoring the Bonus Boss costs nothing: reward floor is
   ×1.0, the meter never decays, resting heroes rest identically, and there is
   no failure state in the phase. Loss-framing only on bonuses ("38k to ×1.35"
   — never "you lost ×1.35").
2. **Steps stay the only source of power.** The boost is earned exclusively by
   walking-generated damage, exactly like the streak multiplier. It is **never
   purchasable** (binding note for M3 monetization) and capped modestly
   (`maxBoostMult` 1.5; shipped tiers max ×1.35 → worst case with streak ×4.05).
3. **The reward is guild-wide and uniform.** One boost for the whole crew, not
   per-member — co-op payoff, no competitive pressure, no member left behind.
4. **Thresholds inherit boss scaling.** Fractions of the killed boss's
   `bossMaxHP` (members × tier already inside) — small guilds can always reach
   tiers; a rebalance of `baseHP` can never orphan the bonus tuning.
5. **Single-writer rollover.** The reward is computed and stamped only inside
   `ensureCurrentChallenge`/`spawnBoss` — exactly once, no double-stamp.

## 8. Art requirements (generation deferred to the M1.5 art ticket)

Per the established boss pipeline (memory `boss-asset-spec` + repo skill
`.claude/skills/generate-vfx` — the skill MUST be read before any
`mcp__pixellab__*` call):

- **Scope now: ONE bonus form** — the crowned/corrupted horse, upgraded from
  the existing `characters/bosses/horse_256/` (has `attack/ hurt/ idle/
  idle_alt/ static.png`). The convention is designed for reuse: **every future
  boss gets a `<boss>_crowned_256` bonus form** (`armored_cat_256` is next).
- **Format:** 256×256 via PixelLab `create_1_direction_object` (view
  `sidescroller` — 256 is the animatable ceiling), facing **LEFT** (boss sits
  on the right edge, heroes on the left), upscaled 2× nearest-neighbor to
  512px for display. Save under `characters/bosses/horse_crowned_256/` with
  `static.png` + `<anim>/frame_*.png`.
- **Look:** unmistakably the SAME monster, escalated — a scary/jagged crown,
  corrupted palette (darker hide, glowing eyes, ember/void accents), wilder
  mane, heavier stance. It must read as "the thing we killed came back
  angrier", not a new species. Confirm style frame with the user before batch
  generation (established boss style: armored evil monster, werecat reference).
- **Animations:** `idle` **required** (via `animate_object` v3); `hurt`
  strongly recommended (impact feedback — the FX engine flashes the boss on
  hit; hurt frames make crossings juicier). No attack anim needed — bosses
  never attack back in the current design.
- **Auto-scale rule:** the bonus boss must never render shorter than the party
  (existing battlefield rule); the crown's extra height should be inside the
  256 canvas, not cropped.

## 9. Open questions (playtest / later)

1. **Window-length fairness:** thresholds don't prorate by remaining days — an
   early kill earns a longer bonus window *by design* (engagement → more reward
   opportunity). Watch for a snowball (boost → earlier kill → higher tier →
   repeat); the counterweights are the +40%/week tier ramp and the ×1.5 cap.
   If it runs away in playtest, prorating `thresholdFrac` by window length is
   the knob.
2. **Tier-crossing spectacle:** are banner + FX enough of a "kill moment", or
   does the crowned form want visual escalation per tier (crown glows → cracks)?
   Art stretch goal — revisit after the first playtest week.
3. **Boost scope flip:** `boostAppliesTo: "all"` includes next week's own
   bonus-phase damage (one step of soft compounding, cap-guarded). If tuning
   ever wants deploys-only, it's a config flip — the two multiply sites are
   already gated.
4. **Energy hoarding across rollover:** banking a deploy past Monday to spend
   it boosted is possible but self-defeating (hoarding lowers the bonus damage
   that sets the boost, and forfeits streak ticks + first-of-day crits). No
   rule needed; verify the intuition in playtest.
5. **Bonus-boss roster:** when the boss roster expands (STR-40), does each boss
   ship with its crowned form at the same time, or lazily? Recommend: same
   time — the pipeline batches well.
