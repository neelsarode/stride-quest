# Monetization Strategy (Design Spec)

> Status: **researched + proposed, tuning open** (2026-07-12). Based on three
> research sweeps: fitness/habit-app monetization, casual/idle-game monetization,
> and the iOS/Expo implementation stack. Tracked in Linear: Stride Quest → M3.
> Build order: AFTER the core loop (M1) proves itself with real friends (M4
> TestFlight). Architect the seams now; ship monetization later.

## 1. Positioning in one line

**Monetize identity, content, and generosity — never power, never guilt.**
Steps stay the ONLY source of damage, forever. That single rule is what every
successful health app respects and every backlash case violated.

## 2. What the research says (the load-bearing facts)

- **Subscriptions are the category's engine, cosmetics are the proof it can be
  kind.** Duolingo: ~83% of revenue from subs, ~8–9% of monthly users convert
  (exceptional). Strava: ~85–90% sub revenue. Finch (self-care pet, closest in
  spirit): **$30–40M ARR bootstrapped where premium is largely cosmetic** —
  "you're paying to customize and support the developer," never to unlock
  wellbeing features.
- **Never sell the healthy behavior.** Habitica codified it ("Play to Win, Not
  Pay to Win"). Walkr sells progress-speedups and draws criticism for it. In a
  co-op game it's worse: bought damage devalues teammates' real steps — the
  entire premise.
- **Never re-paywall what was free.** Strava's 2020 leaderboard paywall and
  Pokémon GO's 2023 remote-raid price hike (revenue fell ~40% in two months to a
  five-year low) are the canonical backlash cases.
- **Forgiveness monetization only works as the LAST rung of a free-first
  ladder.** Duolingo: free equipped freezes → free 3-day restore challenge →
  paid repair → subscription includes a free monthly repair. Snapchat: one free
  restore ever → $0.99/streak → Plus includes one/month. Paid repair with no
  free rung reads as extortion.
- **Battle/season passes are the dominant casual converter** (98% of top-20%
  grossing casual games; typical $4.99, ~1-month seasons) and they convert
  low spenders that straight IAP never reaches. Pokémon GO ($544M in 2024,
  ticketed research as a "faux subscription") and Pikmin Bloom ($100M lifetime,
  per-event Premium Pass at 999 coins + $1.99 tickets) prove people pay for
  **content around real-world walking**.
- **Rewarded ads: opt-in video only.** ~85% of players view rewarded ads
  favorably; US iOS eCPM ≈ $15–25; engagers retain up to 3.5× better. Banners
  are worthless (~$0.60 eCPM) and interstitials damage retention — never ship
  either. Apple 3.2.2: rewarded ads must be optional, never the only earn path.
- **Cosmetics monetize in proportion to social visibility** — good news: the
  battle screen literally puts all 8 heroes on stage every session. Direct
  purchase and bundles, NOT paid gacha/loot boxes (banned in Belgium, FTC
  Genshin settlement, EU Digital Fairness Act pressure).
- **Reality check at our scale:** at 1k–10k MAU, everything is
  hundreds-to-low-thousands $/mo (ads ≈ $200/mo at 1k MAU; median subscription
  app reaches only $8.3k/mo after 18 months). Monetization here is about being
  ready and ethical when the app grows beyond the friend group — not early
  revenue.

## 3. The plan

### Pillar A — Cosmetics: "The Wardrobe" (build first)
Per-class hero skins, direct purchase, no gacha.
- **Art-cost answer** (the known concern): start with **palette-swap skins** —
  recolors of existing frames are a scripted transform, not a PixelLab regen, so
  one skin = all 5 jobs × all animations of a class for near-zero art cost.
  Full redraw "legendary" skins (PixelLab regen per job via the `generate-vfx`
  pipeline) come later at a premium price, on the weekly-drop cadence already
  envisioned. Launch with a small starter shop (3–5 palette skins), add weekly.
- Pricing (Fortnite-style anchoring, scaled down): palette skins $1.99–2.99,
  full-redraw skins $4.99, bundles (skin + projectile tint + campfire flair)
  anchored above. Also **boss trophies / guild banner cosmetics** — the co-op
  wall is shared social identity.

### Pillar B — Season Pass: "The Campaign" ($4.99 / 4-week season)
One season = 4 weekly bosses, matching the existing Monday cycle (weekly is too
short to sell; 4–8 weeks is the researched sweet spot).
- **Free track for everyone** (cosmetic bits, a Streak Shield, trophy) — casual
  games skew generous on the free track. **Premium track = concentrated cosmetic
  value** + 1 free streak repair/season + supporter flair.
- **Tiers advance ONLY by walking** (steps + goal-days). The pass monetizes
  commitment, not power — the Pokémon GO ticketed-research model mapped onto our
  boss calendar. No tier-skip purchases.

### Pillar C — Streak Repair ladder (the "$1 streak save," done right)
The free-first ladder, matching what M1 already builds:
1. **Free:** Streak Shields (earned, auto-applied — already in the M1 spec)
2. **Free:** "Restore challenge" — hit your step goal 3 days straight to earn
   the streak back (the healthy version of a paid repair)
3. **Paid:** Streak Repair **$0.99** OR **watch 1 rewarded ad** (one, not
   three — a 3-ad chain is hostile UX and the research says respect converts
   better; the ad option also satisfies Apple's "optional" rule)
4. **Pass holders:** 1 free repair per season baked in
Never monetize the base forgiveness; shields stay free and earnable forever.

### Later (architect, don't build)
- **Guild Pass:** one friend buys a season pass for the whole crew at a group
  price. Apple has no IAP gifting, but **server-side group entitlements are the
  legal standard pattern** (buyer pays via IAP; our backend grants the perk to
  the `groups` record; everyone benefits via the reactive query). Generosity as
  monetization — it rhymes with Rally.
- **Rewarded ads beyond the repair ladder:** only ever for forgiveness-adjacent
  items (e.g., an extra Rally). NEVER for damage, idle boosts, fuel, or energy —
  that's selling power with extra steps. Quite possibly skip entirely; at small
  scale the revenue is noise and the vibe cost is real.
- **Supporter tip jar** (Finch/Gentler Streak goodwill pattern): a one-time
  non-consumable "buy the party a campfire" with a cosmetic flair as thanks.

## 4. Red lines (write in stone, same tier as the gameplay guardrails)

1. Steps are the only source of damage/power. No purchase or ad ever adds
   damage, energy, fuel, XP, or tier-skips.
2. Nothing that is free ever moves behind a paywall.
3. Forgiveness is free-first; paid repair is the last rung, never the only one.
4. No paid gacha/loot boxes. Direct purchase and transparent bundles only.
5. Rewarded video only, always optional, never required, never interstitials or
   banners.
6. Health data never touches ad targeting or leaves HealthKit's boundary
   (Apple 5.1.3 prohibits it anyway; we don't even pass step counts to ad SDKs).
7. No guilt-framed upsells. The campfire is cozy, not a paywall.

## 5. Implementation stack (decided by research, confirm at build time)

| Concern | Choice | Why |
|---|---|---|
| IAP/subscriptions | **RevenueCat** (`react-native-purchases` v10+) | Official Expo config plugin, New Architecture OK, react-native-web support (browser preview keeps working), free below $2.5k/mo tracked revenue. Fallback: `expo-iap` if the 1% fee ever matters. |
| Entitlements | RevenueCat webhooks → **Convex httpAction** mirror (community `convex-revenuecat` pattern) | Per-user AND per-group entitlement records; resolve user server-side from auth (never trust a client-passed userId). |
| Ads (if/when) | **AdMob** via `react-native-google-mobile-ads` | Only mature Expo path; verify config plugin against SDK 56 (known SDK 54 breakage report). Mediation is overkill at our scale. |
| Local testing | **StoreKit Configuration files** in Xcode/Simulator | The entire purchase flow (trials, renewals, refunds) is testable WITHOUT the $99 Apple account — same free-until-real-device posture as HealthKit. |
| Store economics | **Apple Small Business Program** | 15% (not 30%) commission under $1M/yr — manual enrollment in App Store Connect once the account exists. |
| Products | Consumable: streak repair. Non-consumable: skins, tip jar. Auto-renew or 4-week non-renewing: season pass (decide at build). | Family Sharing is irrelevant (family-bound, not friend-bound) — Guild Pass is server-side. |

## 6. Sequencing

Monetization ships only after: M1 (fuel loop) verified → M4 TestFlight → the
friend group actually retains for a few boss weeks. Then: Wardrobe (palette
skins) → repair ladder → first Campaign season. Seams built early (cheap now,
expensive later): entitlement records + dashboard exposure, data-driven skin
registry (same pattern as `CLASSES`), and purchases NEVER writing `stepEntries`
(ledger stays pure walking).
