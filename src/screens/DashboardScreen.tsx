// =============================================================================
// DashboardScreen — Phase 2 home. Reads the server-authoritative reactive
// dashboard (the SERVER owns the clock now), animates feedback, and hosts the
// dev panel. Placeholder visuals; legible feedback.
// =============================================================================
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  HERO_STATE_STYLE,
  PALETTE,
  SIZES,
  classAccent,
} from "../config/assets";
import { DAILY_STEP_GOAL } from "../../convex/gameConfig";
import { fmtFightShort, fmtFightTime, fmtMoreTime } from "../fuelCopy";
import { DEV_FLAGS } from "../devConfig";
import { ConnectedBattleScene } from "../battle/ConnectedBattleScene";
import { AnimatedHPBar } from "../components/AnimatedHPBar";
import { AnimatedMeter } from "../components/AnimatedMeter";
import { BonusMeter } from "../components/BonusMeter";
import { DeployButton } from "../components/DeployButton";
import { OverdriveMeter } from "../components/OverdriveMeter";
import { GuildBoard } from "../components/GuildBoard";
import { DevPanel } from "../components/DevPanel";
// The shared brain (STR-66): all data/effects/actions live here now, consumed
// identically by GameScreen. This screen is a pure render of its return value.
import { useGameEngine } from "../game/useGameEngine";
import { HealthPermissionScreen } from "./onboarding/HealthPermissionScreen";
import { isAvailable as healthKitAvailable } from "../health/healthkit";

export function DashboardScreen() {
  // The whole screen brain lives in one shared hook now (STR-66). Extraction was
  // mechanical: same hooks, same order, same effects — this screen just renders
  // the result, so its behavior is byte-for-byte what it was before.
  const {
    data,
    overview,
    pendingIdle,
    busy,
    note,
    showHealthScreen,
    setShowHealthScreen,
    onDeploy,
    onCollectIdle,
  } = useGameEngine();

  if (data === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PALETTE.accent} />
        <Text style={styles.dim}>Loading your guild…</Text>
      </View>
    );
  }
  if (data === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Signing you in…</Text>
      </View>
    );
  }

  // Chip tap → the same Beat-3 priming screen, full-screen (STR-48: "reopens
  // this screen"). Its own onDone just returns here; if the sync landed real
  // steps the chip is gone reactively (health.connected flipped server-side).
  if (showHealthScreen) {
    return <HealthPermissionScreen onDone={() => setShowHealthScreen(false)} />;
  }

  const { player, guild, boss, steps, streak, dailyGoal, fuel, bonus, boost } = data;
  const m = data.meters;
  const bossActive = !!boss && !boss.defeated;
  // Bonus phase (STR-57): the crowned week. Deploys/collects stay LIVE — the
  // backend runs the identical pipeline and banks damage on the bonus meter
  // (the visible face of the STR-53 fix).
  const bonusPhase = bonus != null;
  const canFight = bossActive || bonusPhase;
  // Hero fuel state (STR-13): chip styling + copy per state. Resting is
  // DIGNIFIED (spec §3): calm neutrals, never red, never shame language.
  const hs = HERO_STATE_STYLE[fuel.state];
  const resting = fuel.state === "resting";
  const jobProgress = m.jobXp - m.jobThreshold;
  const jobSpan = m.nextJobThreshold != null ? m.nextJobThreshold - m.jobThreshold : 1;
  const jobMaxed = m.nextJobThreshold == null;
  // Registry-driven, off the VIEWER'S class (STR-49 nit): a Mage sees MAGE in
  // mage colors — never a hardcoded warrior. Server falls back to MVP_CLASS
  // for class-less accounts, so classKey is always a valid registry key.
  const accent = classAccent(player.classKey);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>STRIDE QUEST</Text>
      <Text style={styles.guild}>{guild ? guild.name : "Setting up your guild…"}</Text>

      {/* Calm CONNECT HEALTH chip (STR-48; comp BATTLE beat): only while Health
          was skipped/denied on a HealthKit-capable device. Never red, never a
          badge — a quiet door back to the Beat-3 priming screen. */}
      {(healthKitAvailable() || DEV_FLAGS.forceHealthBeat) &&
        !data.health.connected && (
          <Pressable
            onPress={() => setShowHealthScreen(true)}
            style={({ pressed }) => [styles.healthChip, pressed && styles.btnPressed]}
          >
            <Text style={styles.healthChipText}>♥ CONNECT HEALTH</Text>
          </Pressable>
        )}

      {/* THE BATTLE SCENE (STR-23, plan step 7) — the screen's centerpiece,
          replacing the old placeholder sprite box. Live party (your hero
          front, kneeling teammates snoring) vs the shared boss; deploys,
          collects, teammate hits, overdrive chains and the crowned week all
          animate HERE via the real event stream (STR-22). Per the
          dashboard-ui.html intent the scene carries the fantasy; the
          functional cards below stay in their current style — the full
          stone+gold pixel ui-kit HUD port is FUTURE POLISH, not this pass. */}
      <ConnectedBattleScene style={styles.scene} />

      {/* Player identity (the hero itself now lives in the scene above). */}
      <View style={styles.card}>
        <View style={styles.playerMeta}>
          <Text style={styles.playerName}>{player.displayName}</Text>
          <Text style={styles.dim}>
            {player.className} · Job {player.jobLevel} — {player.jobName}
          </Text>
          <Text style={[styles.badge, { color: accent }]}>idle ×{player.idleMultiplier}</Text>
          <Text style={styles.streakChip}>
            {streak.count > 0 ? `🔥 ${streak.count}-day streak` : "🔥 no streak"}
          </Text>
        </View>
      </View>

      {/* Fuel tank (STR-13) — the reason to walk today: hours of fight time +
          the hero state. Steps ARE fuel; the readout speaks in time, not fuel
          units (spec §3: "Your hero can fight for 9 more hours"). */}
      <View style={styles.card}>
        <View style={styles.fuelHeader}>
          <Text style={styles.cardLabel}>FUEL</Text>
          <View style={[styles.stateChip, { backgroundColor: hs.bg, borderColor: hs.color }]}>
            <Text style={[styles.stateChipText, { color: hs.color }]}>{hs.label}</Text>
          </View>
        </View>
        <AnimatedMeter
          label="TANK"
          value={fuel.current}
          max={fuel.tankCap}
          color={hs.color}
          valueText={
            resting ? "empty — resting" : `fights ${fmtFightShort(fuel.hoursToEmpty)} more`
          }
        />
        <Text style={styles.dimSmall}>
          {fuel.state === "battling" &&
            `Your hero can fight for ${fmtMoreTime(fuel.hoursToEmpty)}. Every step you walk is fuel.`}
          {fuel.state === "winded" &&
            `Winded — fighting at half strength, with ${fmtFightTime(fuel.hoursToEmpty)} of fight left. Any walk refills the tank.`}
          {fuel.state === "resting" &&
            "Catching breath — nothing is lost while resting. Any walk rejoins the fight."}
        </Text>
      </View>

      {/* Dual meters */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>METERS</Text>
        <AnimatedMeter
          label={`JOB XP · Job ${player.jobLevel}`}
          value={jobMaxed ? 1 : jobProgress}
          max={jobMaxed ? 1 : jobSpan}
          color={PALETTE.xp}
          valueText={
            jobMaxed
              ? "MAX JOB"
              : `${jobProgress.toLocaleString()} / ${jobSpan.toLocaleString()} → Job ${player.jobLevel + 1}`
          }
        />
        <AnimatedMeter
          label="ENERGY · deployable"
          value={m.energy}
          max={DAILY_STEP_GOAL}
          color={PALETTE.energy}
          valueText={`${m.energy.toLocaleString()} ⚡`}
        />
      </View>

      {/* Boss. During the bonus phase (STR-57) the card swaps to the crowned
          form: gold name (placeholder tint — the crowned art lands through the
          assets.ts seam with the M1.5 art ticket) and the ACCUMULATING meter
          in place of the red HP bar. */}
      <View style={styles.card}>
        <View style={styles.fuelHeader}>
          <Text style={styles.cardLabel}>
            {bonus ? "BONUS BOSS · VICTORY WEEK" : "WEEKLY BOSS"}
          </Text>
          {/* Persistent active-boost chip (STR-57): last week's earned reward,
              visible on the boss card all week. Absent when no boost — the
              ×1.0 floor is never rendered as a badge. */}
          {boost ? (
            <View style={styles.boostChip}>
              <Text style={styles.boostChipText}>⚡ ×{boost.mult} CREW POWER</Text>
            </View>
          ) : null}
        </View>
        {boss && bonus ? (
          <>
            <Text style={[styles.bossName, styles.bonusBossName]}>👑 {bonus.bossName}</Text>
            <Text style={styles.dimSmall}>
              The boss fell — its crowned form rose for the rest of the week.
              Every hit feeds next week's power.
            </Text>
            <BonusMeter total={bonus.totalDamage} tiers={bonus.tiers} />
            <View style={styles.bonusTotalsRow}>
              <Text style={styles.bonusTotal}>
                {Math.round(bonus.totalDamage).toLocaleString()} bonus damage
              </Text>
              <Text style={styles.dimSmall}>
                you: {Math.round(bonus.myDamage).toLocaleString()}
              </Text>
            </View>
            {/* Tier preview (STR-57): shares the server's pure tier helpers via
                the dashboard payload, so shown == what Monday stamps. Tier 0 is
                an invitation, never a loss ("Deal X to earn ×1.1"). */}
            <Text style={styles.bonusPreview}>{bonusPreviewLine(bonus)}</Text>
          </>
        ) : boss ? (
          <>
            <Text style={styles.bossName}>
              {boss.name} <Text style={styles.dim}>· tier {boss.tier}</Text>
            </Text>
            <AnimatedHPBar current={boss.currentHP} max={boss.maxHP} />
            <Text style={styles.dim}>
              {Math.round(boss.currentHP).toLocaleString()} / {boss.maxHP.toLocaleString()} HP
            </Text>
            <Text style={styles.dimSmall}>
              {boss.startDate} → {boss.endDate}
            </Text>
          </>
        ) : (
          <Text style={styles.dim}>Summoning this week's boss…</Text>
        )}
      </View>

      {/* Deploy — the dopamine action. STAYS LIVE in the bonus phase (STR-57,
          the STR-53 fix made visible): same full-juice pipeline, the damage
          just flows into the crowned meter. */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>DEPLOY</Text>
        <Text style={styles.dimSmall}>
          {bonusPhase
            ? "Unleash your whole Energy bank — every point feeds the bonus meter."
            : "Unleash your whole Energy bank as a burst hit on the boss."}
        </Text>
        <DeployButton
          energy={m.energy}
          streakCount={streak.count}
          streakMult={streak.multiplier}
          disabled={busy || m.energy <= 0 || !canFight}
          // First-deploy hint (STR-49): pulses while there's something to
          // deploy and this account has NEVER deployed. lastDeployDate is
          // server truth, so one deploy silences it forever, on every device.
          firstDeployHint={m.energy > 0 && !data.hasEverDeployed && canFight}
          onDeploy={onDeploy}
        />
      </View>

      {/* Overdrive (Core Loop v2 §5.4, STR-74) — RETRIGGERED: no longer a manual
          activate. Hitting the daily goal auto-arms ×2 until the reset, boosting
          idle AND the Super Attack. This card is now a status readout. */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>OVERDRIVE</Text>
        <OverdriveMeter
          active={data.overdrive.active}
          mult={data.overdrive.mult}
          stepsToday={data.overdrive.stepsToday}
          goal={data.overdrive.goal}
        />
      </View>

      {/* Idle combat */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>IDLE COMBAT</Text>
        <Text style={styles.dimSmall}>
          Your hero auto-attacks at ×{player.idleMultiplier}
          {data.overdrive.active ? ` · ⚡ OVERDRIVE ×${data.overdrive.mult}` : ""} —{" "}
          {Math.round(data.idle.dph).toLocaleString()} damage/hour right now. Accrues up to{" "}
          {Math.round(data.idle.capMs / 3_600_000)}h offline, then pauses.
        </Text>
        <View style={styles.idleRow}>
          <Text style={styles.idlePending}>+{pendingIdle.toLocaleString()} pending</Text>
          <Btn
            label="Collect"
            onPress={onCollectIdle}
            // Live through the bonus phase too (STR-57): the settle banks
            // idle damage into the crowned meter instead of discarding it.
            disabled={busy || pendingIdle <= 0 || !canFight}
            kind="ghost"
          />
        </View>
      </View>

      {/* Guild (co-op roster + recognition + the STR-15 rally surface +
          per-member bonus damage / shared boost chip, STR-57) */}
      {overview ? (
        <GuildBoard overview={overview} rally={data.rally} boost={boost} />
      ) : null}

      {/* Steps */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>YOUR STEPS</Text>
        <View style={styles.statsRow}>
          <Stat label="Today" value={steps.today} big accent={accent} />
          <Stat label="This week" value={steps.thisWeek} />
        </View>
        <View style={styles.goalRow}>
          <Text style={styles.dimSmall}>
            Daily goal: {dailyGoal.steps.toLocaleString()} / {dailyGoal.goal.toLocaleString()}
          </Text>
          {dailyGoal.hit ? <Text style={styles.goalHit}>✔ GOAL HIT!</Text> : null}
        </View>
      </View>

      {/* Dev panel */}
      {DEV_FLAGS.showDevPanel && <DevPanel stepsToday={steps.today} />}

      {note && <Text style={styles.note}>{note}</Text>}
      {busy && <ActivityIndicator color={PALETTE.accent} />}
      <Text style={styles.footer}>Platform: {Platform.OS} · Phase 2</Text>
    </ScrollView>
  );
}

// --- small presentational helpers --------------------------------------------

/** Tier-preview readout (STR-57, spec §6) — mirrors the streak "×N.NN power"
 *  preview. Data comes straight from the dashboard's bonus payload, which runs
 *  the SAME pure helpers Monday's rollover stamps with (bonusTierFor /
 *  nextBonusTierTarget), so the number shown here is BY CONSTRUCTION the
 *  number applied. Tier 0 is an invitation ("Deal X to earn ×1.1") — never
 *  "you're losing X" (loss-framing only ever applies to bonuses, and even
 *  then softly). */
function bonusPreviewLine(bonus: {
  currentTier: number;
  currentMult: number;
  nextTier: { damageToGo: number; boostMult: number } | null;
  tiers: { threshold: number; boostMult: number }[];
}): string {
  if (bonus.currentTier === 0) {
    const first = bonus.tiers[0];
    if (!first) return "";
    return `Deal ${Math.ceil(first.threshold).toLocaleString()} to earn ×${first.boostMult} power next week.`;
  }
  if (bonus.nextTier) {
    return `Next week: ×${bonus.currentMult} power — ${Math.ceil(
      bonus.nextTier.damageToGo,
    ).toLocaleString()} damage to ×${bonus.nextTier.boostMult}.`;
  }
  return `Next week: ×${bonus.currentMult} power — top tier secured!`;
}

function Stat({
  label,
  value,
  big,
  accent,
}: {
  label: string;
  value: number;
  big?: boolean;
  accent?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[styles.statValue, big && styles.statValueBig, accent ? { color: accent } : null]}
      >
        {value.toLocaleString()}
      </Text>
    </View>
  );
}

function Btn({
  label,
  onPress,
  disabled,
  kind,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind: "primary" | "ghost";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        kind === "primary" ? styles.btnPrimary : styles.btnGhost,
        (disabled || pressed) && styles.btnPressed,
      ]}
    >
      <Text style={[styles.btnText, kind === "ghost" && styles.btnTextGhost]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.bg },
  content: { padding: SIZES.screenPad, paddingTop: 70, gap: SIZES.gap },
  center: {
    flex: 1,
    backgroundColor: PALETTE.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  title: {
    color: PALETTE.accent,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 3,
    textAlign: "center",
  },
  guild: { color: PALETTE.textDim, fontSize: 14, textAlign: "center", marginBottom: 4 },
  // The calm Health chip (STR-48): ghost border + dim text — deliberately the
  // quietest interactive element on the screen (never red, never a badge).
  healthChip: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: PALETTE.panelBorder,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  healthChipText: {
    color: PALETTE.textDim,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  card: {
    backgroundColor: PALETTE.panel,
    borderColor: PALETTE.panelBorder,
    borderWidth: 1,
    borderRadius: SIZES.radius,
    padding: SIZES.screenPad,
    gap: 8,
  },
  cardLabel: { color: PALETTE.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },
  // The live battle scene's window (STR-23). Height is a screen-design number
  // (assets.ts); the scene lays itself out from whatever box it gets.
  scene: {
    height: SIZES.battleSceneHeight,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: PALETTE.panelBorder,
  },
  playerMeta: { flex: 1, gap: 4 },
  playerName: { color: PALETTE.text, fontSize: 20, fontWeight: "700" },
  badge: { fontSize: 13, fontWeight: "700" },
  bossName: { color: PALETTE.text, fontSize: 18, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: SIZES.gap },
  stat: { flex: 1 },
  statLabel: { color: PALETTE.textDim, fontSize: 12 },
  statValue: { color: PALETTE.text, fontSize: 22, fontWeight: "700" },
  statValueBig: { fontSize: 40 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: "center" },
  btnPrimary: { backgroundColor: PALETTE.accent },
  btnGhost: { borderWidth: 1, borderColor: PALETTE.panelBorder },
  btnPressed: { opacity: 0.55 },
  btnText: { color: "#11131a", fontWeight: "800", fontSize: 15 },
  btnTextGhost: { color: PALETTE.text },
  dim: { color: PALETTE.textDim, fontSize: 14 },
  dimSmall: { color: PALETTE.textDim, fontSize: 12, lineHeight: 18 },
  note: { color: PALETTE.good, fontSize: 13, textAlign: "center" },
  footer: { color: PALETTE.textDim, fontSize: 11, textAlign: "center", marginTop: 8 },
  streakChip: { color: PALETTE.crit, fontSize: 12, fontWeight: "700", marginTop: 2 },
  // Fuel/hero-state chip (STR-13): state colors come from HERO_STATE_STYLE —
  // teal battling, amber winded, calm neutral resting. Never red.
  fuelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stateChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  stateChipText: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  defeated: { color: PALETTE.good, fontSize: 14, fontWeight: "800" },
  // Bonus Boss card (STR-57): gold crowned treatment — celebration hierarchy.
  bonusBossName: { color: PALETTE.accent },
  bonusTotalsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  bonusTotal: { color: PALETTE.accent, fontSize: 18, fontWeight: "900" },
  bonusPreview: { color: PALETTE.accent, fontSize: 13, fontWeight: "700" },
  boostChip: {
    backgroundColor: "#241a04",
    borderColor: PALETTE.accent,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  boostChipText: {
    color: PALETTE.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  idleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  idlePending: { color: PALETTE.good, fontSize: 16, fontWeight: "800" },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  goalHit: { color: PALETTE.good, fontSize: 13, fontWeight: "800" },
});

