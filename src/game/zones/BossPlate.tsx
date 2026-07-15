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
import { useGameLayout } from "../useGameLayout";
import { zoneStyles } from "./zoneStyle";

// --- local layout feel (component-local by design; the shared VERTICAL rhythm
// lives in GAME_ZONES, reconciled in STR-71 — the plate's own row gaps / gutter
// stay here where they're read).
const PLATE_GAP = 2; // dp between plate text rows
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
  const currentHP = boss?.currentHP ?? 0;

  // HP ghost chip: hold the pre-hit fill, flash, then catch down to the new fill.
  const maxHP = boss?.maxHP ?? 0;
  const hpFrac = maxHP > 0 ? clamp01(currentHP / maxHP) : 0;
  const prevHP = usePrevious(currentHP);
  const [ghost, setGhost] = useState(hpFrac);
  useEffect(() => {
    if (bonus) return; // the bonus meter has no depleting ghost
    if (prevHP != null && currentHP < prevHP && maxHP > 0) {
      setGhost(clamp01(prevHP / maxHP)); // reveal the just-lost slice in red
      barRef.current?.flash();
      const t = setTimeout(() => setGhost(hpFrac), GHOST_HOLD_MS);
      return () => clearTimeout(t);
    }
    setGhost(hpFrac); // heal / respawn / first paint: ghost tracks the fill
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHP, maxHP, bonus]);

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
        <PixelText text={bonus.bossName} color={UI_PALETTE.gold_light} />
        <View style={styles.subRow}>
          <PixelText text="VICTORY WEEK" color={UI_PALETTE.gold_mid} />
          {boostChip}
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
        <PixelText text={boss.name} color={UI_PALETTE.gold_light} />
        <View style={styles.subRow}>
          <PixelText
            text={`WEEKLY BOSS - TIER ${boss.tier}`}
            color={UI_PALETTE.silver_dark}
          />
          {boostChip}
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
  subRow: { flexDirection: "row", alignItems: "center", gap: 6 },
});

export default BossPlate;
