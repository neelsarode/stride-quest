# Stride Quest ⚔️

A **co-op, step-tracking RPG** for a small friend group. Everyone's real daily
steps pool as damage against a shared weekly boss — cooperative, not
competitive. Steps are the only source of power, forever.

Pixel-art battle scene, React Native + Expo, Convex backend, Apple HealthKit.

## Orientation

| What | Where |
|---|---|
| Architecture, decisions, status (living doc) | [`CLAUDE.md`](CLAUDE.md) |
| Core-loop design (fuel hybrid) | [`docs/superpowers/specs/2026-07-12-core-loop-fuel-hybrid-design.md`](docs/superpowers/specs/2026-07-12-core-loop-fuel-hybrid-design.md) |
| Retention research + rationale (PDF) | [`docs/gameplay-loop-design.pdf`](docs/gameplay-loop-design.pdf) |
| Monetization strategy | [`docs/superpowers/specs/2026-07-12-monetization-strategy.md`](docs/superpowers/specs/2026-07-12-monetization-strategy.md) |
| Battle-scene RN port plan | [`docs/fx-rn-port-plan.md`](docs/fx-rn-port-plan.md) |
| Work tracking | [Linear → Stride Quest](https://linear.app/stridequest/project/stride-quest-40ccda389ff9) |

## Run it

```bash
# Terminal 1 — backend (Convex cloud dev deployment)
npx convex dev

# Terminal 2 — app in the browser
npm run web
```

Browser previews of the battle layer (no build needed): open
`battlefield-ui.html` (live battle mock) or `preview.html` (sprite gallery).
FX regression check: `fx-test.html?verify=1` must print `PASS — 80/80`.
