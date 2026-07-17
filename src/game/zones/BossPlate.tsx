// =============================================================================
// BossPlate — GameScreen boss zone: gold name + "WEEKLY BOSS - TIER N" + the
// full-width gold hi-fi HP bar (ghost chip-damage + white hit flash). On the
// crowned victory week it swaps to the ACCUMULATING bonus meter (tier ticks +
// "N TO X1.2" bonus-framed label). A persistent boost chip rides the plate all
// week whenever last week's reward is in force.
// STR-67 (top HUD). Owns this file — full content + position within it.
//
// Layout target: dashboard-ui.html #bossbar + battlefield-ui.html's live boss
// bar / `__setBonusHud` prototype. The HP bar is driven from the SAME reactive
// values AnimatedHPBar reads today (boss.currentHP / boss.maxHP): value springs
// on the STR-64 Bar, the ghost holds the pre-hit fill then catches down, the
// flash blinks — all on Reanimated shared values (Bar internals), so the render
// count stays FLAT while the bar animates (spec §12). The bonus meter reuses
// BonusMeter's math (cap = top tier, ticks at each threshold). Reactive read of
// api.game.dashboard; no engine effects (see TopBar note).
//
// NEVER-PUNISH copy (M1.5 guardrail): the bonus label is only ever "what's
// earned + what's next" — never "missed it"; the ×1.0 floor is never a chip.
// The pixel font has no "×" glyph, so multipliers render as "X" (kit convention).
// =============================================================================
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { GAME_ZONES } from "../../config/assets";
import { usePrevious } from "../../feedback/usePrevious";
import { Bar, type BarHandle, Chip, PixelText, UIScaleProvider } from "../../ui";
import { UI_PALETTE, WELL_INSETS } from "../../ui/theme";
import { usePendingIdle } from "../../usePendingIdle";
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

// --- local layout feel (component-local by design; the shared VERTICAL rhythm
// lives in GAME_ZONES, reconciled in STR-71 — the plate's own row gaps / gutter
// stay here where they're read).
const PLATE_GAP = 6; // dp between plate rows (name / subtitle / bar) — was 2, too cramped
const OUTER_PAD = 18; // total side gutter (9 dp each) — battlefield-ui BOSS_BAR_W math
const GHOST_HOLD_MS = 300; // how long the red chip lingers before catching down

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Bonus-meter label — earned + next only (never "missed it"). */
function bonusLabel(bonus: NonNullable<BonusData>): string {
  if (bonus.nextTier) {
    return `${fmt(bonus.nextTier.damageToGo)} TO X${bonus.nextTier.boostMult}`;
  }
  return `MAX X${bonus.currentMult}`;
}

type BonusData = {
  bossName: string;
  totalDamage: number;
  tiers: { threshold: number; boostMult: number }[];
  currentMult: number;
  nextTier: { damageToGo: number; boostMult: number } | null;
} | null;

export function BossPlate() {
  const { topPad, artScale, width } = useGameLayout();
  const data = useQuery(api.game.dashboard, {});

  // Hooks run unconditionally (guarded bodies) so hook order never forks.
  const barRef = useRef<BarHandle>(null);
  const boss = data?.boss ?? null;
  const bonus: BonusData = data?.bonus ?? null;

  // LIVE HP (Problem 2): the boss's TRUE current HP is the settled remaining
  // MINUS the uncollected idle still accruing server-side — fold that in so the
  // number ticks down as the party attacks instead of only jumping at settles.
  // usePendingIdle projects it from idle.dph + the effective clock and snaps to
  // ~0 on each settle (in the same payload that drops settledHP), so `currentHP`
  // stays continuous. Called unconditionally (idle is always in the payload) to
  // keep hook order stable across the bonus/boss render branches.
  const livePending = usePendingIdle(data?.idle, data?.now);
  const settledHP = boss?.currentHP ?? 0;
  const maxHP = boss?.maxHP ?? 0;
  const currentHP = Math.max(0, settledHP - livePending);
  const hpFrac = maxHP > 0 ? clamp01(currentHP / maxHP) : 0;

  // HP ghost chip: on a SETTLE (a real damage land — a Super Attack, a teammate
  // hit, an idle collect) hold the pre-hit fill in red for a beat, flash, then
  // catch down. Keyed on the SETTLED HP, so the every-second idle creep (which
  // leaves settledHP unchanged and only grows livePending) NEVER flashes — the
  // gold just recedes smoothly. Rendered as `ghostHold ?? hpFrac`: with no hit in
  // flight ghost === value (no red chip) and it tracks the live fill as idle
  // drains it; during the 300ms hold it's the frozen pre-hit slice.
  const prevSettledHP = usePrevious(settledHP);
  const prevFrac = usePrevious(hpFrac);
  const [ghostHold, setGhostHold] = useState<number | null>(null);
  useEffect(() => {
    if (bonus) return; // the bonus meter has no depleting ghost
    if (prevSettledHP != null && settledHP < prevSettledHP && maxHP > 0) {
      setGhostHold(prevFrac ?? hpFrac); // freeze the pre-hit fill (the red slice)
      barRef.current?.flash();
      const t = setTimeout(() => setGhostHold(null), GHOST_HOLD_MS);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledHP, maxHP, bonus]);
  const ghost = ghostHold ?? hpFrac;

  // Bonus meter flash: a banked hit pulses the crowned bar (the "kill moment").
  const prevBonusTotal = usePrevious(bonus?.totalDamage);
  useEffect(() => {
    if (!bonus) return;
    if (prevBonusTotal != null && bonus.totalDamage > prevBonusTotal) {
      barRef.current?.flash();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonus?.totalDamage]);

  if (!data) return null;
  const boost = data.boost;
  const barArtW = Math.max(40, Math.floor((width - OUTER_PAD) / artScale));

  // Persistent active-boost chip (never the ×1.0 floor — absent means floor).
  // Rides the sub row so it adds no vertical height to the plate.
  const boostChip =
    boost && boost.mult > 1 ? (
      <Chip label={`X${boost.mult} POWER`} color="gold" />
    ) : null;

  let body: ReactNode;
  if (bonus) {
    // ---- Crowned victory week: accumulating meter -------------------------
    const cap = bonus.tiers.length > 0 ? bonus.tiers[bonus.tiers.length - 1].threshold : 1;
    const value = cap > 0 ? clamp01(bonus.totalDamage / cap) : 0;
    const inset = WELL_INSETS.full;
    const wellW = barArtW - inset.dw;
    body = (
      <>
        <View style={[styles.nameRow, { width: barArtW * artScale }]}>
          <View style={styles.nameLeft}>
            <PixelText text={bonus.bossName} color={UI_PALETTE.gold_light} />
            {boostChip}
          </View>
          <PixelText text="VICTORY WEEK" color={UI_PALETTE.gold_mid} />
        </View>
        <View style={{ width: barArtW * artScale, height: 20 * artScale }}>
          <Bar
            ref={barRef}
            variant="full"
            width={barArtW}
            value={value}
            fill="gold"
            label={bonusLabel(bonus)}
          />
          {/* tier ticks ON the meter (the top tier is the bar's own right end) */}
          {bonus.tiers
            .filter((t) => t.threshold < cap)
            .map((t, i) => {
              const reached = bonus.totalDamage >= t.threshold;
              const tickX = inset.x + wellW * (t.threshold / cap);
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: tickX * artScale,
                    top: inset.y * artScale,
                    width: 1 * artScale,
                    height: (20 - inset.dh) * artScale,
                    backgroundColor: reached ? UI_PALETTE.white : UI_PALETTE.sky_dark,
                  }}
                />
              );
            })}
        </View>
      </>
    );
  } else if (boss) {
    // ---- Live weekly boss: gold HP bar ------------------------------------
    body = (
      <>
        {/* Name row spanning the bar width: boss name left, "WEEKLY BOSS - TIER
            N" right (was two stacked centered rows — the single row reclaims a
            line so the whole cluster sits higher). */}
        <View style={[styles.nameRow, { width: barArtW * artScale }]}>
          <View style={styles.nameLeft}>
            <PixelText text={boss.name} color={UI_PALETTE.gold_light} />
            {boostChip}
          </View>
          <PixelText
            text={`WEEKLY BOSS - TIER ${boss.tier}`}
            color={UI_PALETTE.silver_dark}
          />
        </View>
        <Bar
          ref={barRef}
          variant="full"
          width={barArtW}
          value={hpFrac}
          ghost={ghost}
          fill="gold"
          label={`${fmt(currentHP)} / ${fmt(maxHP)}`}
        />
      </>
    );
  } else {
    // ---- No challenge yet -------------------------------------------------
    body = <PixelText text="SUMMONING THE BOSS" color={UI_PALETTE.gold_mid} />;
  }

  return (
    <View
      testID="zone-boss-plate"
      style={[
        zoneStyles.zone,
        zoneStyles.centeredRow,
        { top: topPad + GAME_ZONES.bossPlateTop },
      ]}
    >
      <UIScaleProvider value={artScale}>
        <View style={styles.plate}>{body}</View>
      </UIScaleProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { alignItems: "center", gap: PLATE_GAP },
  // Name + subtitle share one full-bar-width row (name left, subtitle right).
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  // Left group: boss name + optional persistent boost chip.
  nameLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
});

export default BossPlate;
