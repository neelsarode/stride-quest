// =============================================================================
// DashboardScreen — Phase 2 home. Reads the server-authoritative reactive
// dashboard (the SERVER owns the clock now), animates feedback, and hosts the
// dev panel. Placeholder visuals; legible feedback.
// =============================================================================
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { PALETTE, SIZES, classAccent } from "../config/assets";
import { DAILY_STEP_GOAL } from "../../convex/gameConfig";
import { DEV_FLAGS } from "../devConfig";
import { AnimatedHPBar } from "../components/AnimatedHPBar";
import { AnimatedMeter } from "../components/AnimatedMeter";
import { DeployButton } from "../components/DeployButton";
import { GuildBoard } from "../components/GuildBoard";
import { DevPanel } from "../components/DevPanel";
import { useGameEvents } from "../feedback/useGameEvents";
import { useTeammateDamage } from "../feedback/useTeammateDamage";
import { useFeedback } from "../feedback/FeedbackProvider";
import { usePendingIdle } from "../usePendingIdle";
import { HealthPermissionScreen } from "./onboarding/HealthPermissionScreen";
import {
  isAvailable as healthKitAvailable,
  readTodaySteps,
} from "../health/healthkit";

export function DashboardScreen() {
  const data = useQuery(api.game.dashboard, {});
  const recordSteps = useMutation(api.steps.recordSteps);
  const ensureSession = useMutation(api.users.ensureSession);
  const deployMut = useMutation(api.combat.deploy);
  const collectIdleMut = useMutation(api.combat.collectIdle);
  const { emit } = useFeedback();

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The calm CONNECT HEALTH chip (STR-48) reopens the Beat-3 priming screen.
  const [showHealthScreen, setShowHealthScreen] = useState(false);

  // Live "pending idle" ticker (display-only; server is authoritative on collect).
  const pendingIdle = usePendingIdle(data?.idle, data?.now);

  // Reactive-state changes → feedback animations (job-up, goal, boss defeated).
  useGameEvents(data);

  // Co-op roster (shared boss contributions + recognition). Teammate hits
  // animate on this screen via the damage diff.
  const overview = useQuery(api.guild.overview, {});
  useTeammateDamage(overview?.members);

  // Auto-collect idle once on open ("while you were away…").
  const didCollect = useRef(false);
  useEffect(() => {
    if (didCollect.current || !data) return;
    didCollect.current = true;
    collectIdleMut({})
      .then((r) => {
        if (r && r.collected > 0) emit({ type: "idleCollected", amount: r.collected });
      })
      .catch(() => {});
  }, [collectIdleMut, emit, data]);

  async function onDeploy() {
    setBusy(true);
    setNote(null);
    try {
      const r = await deployMut({});
      if (r) emit({ type: "damageDealt", amount: r.damage, source: "deploy", crit: r.crit });
    } catch (e) {
      setNote(`Deploy failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onCollectIdle() {
    setBusy(true);
    try {
      const r = await collectIdleMut({});
      if (r && r.collected > 0) emit({ type: "damageDealt", amount: r.collected, source: "idle" });
    } finally {
      setBusy(false);
    }
  }

  // One-time per-launch session maintenance (STR-44: formerly bootstrap — it
  // no longer creates a guild; the onboarding fork owns that). Tells the server
  // our timezone for day/week math.
  const didEnsureSession = useRef(false);
  useEffect(() => {
    if (didEnsureSession.current) return;
    didEnsureSession.current = true;
    ensureSession({ tzOffsetMinutes: new Date().getTimezoneOffset() }).catch(
      (e) => setNote(`Setup error: ${String(e)}`),
    );
  }, [ensureSession]);

  // Silent HealthKit re-sync on open, once Health is CONNECTED (STR-48: the
  // permission moment moved into onboarding; the buried manual sync button it
  // replaced becomes automatic — "steps keep syncing on their own from here").
  // Read-then-record through the existing seam; null/0 reads are simply
  // skipped (the ledger is append-only, so re-syncs are always safe).
  const didHealthSync = useRef(false);
  const healthConnected = data?.health.connected === true;
  useEffect(() => {
    if (didHealthSync.current || !healthConnected || !healthKitAvailable()) return;
    didHealthSync.current = true;
    readTodaySteps()
      .then((steps) => {
        if (steps != null && steps > 0) {
          return recordSteps({ stepCount: steps, source: "healthkit" }).then(
            () => undefined,
          );
        }
      })
      .catch(() => {});
  }, [healthConnected, recordSteps]);

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

  const { player, guild, boss, steps, streak, dailyGoal } = data;
  const m = data.meters;
  const bossActive = !!boss && !boss.defeated;
  const jobProgress = m.jobXp - m.jobThreshold;
  const jobSpan = m.nextJobThreshold != null ? m.nextJobThreshold - m.jobThreshold : 1;
  const jobMaxed = m.nextJobThreshold == null;
  const accent = classAccent("warrior");

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

      {/* Player + placeholder sprite */}
      <View style={styles.card}>
        <View style={styles.playerRow}>
          <View style={[styles.sprite, { borderColor: accent }]}>
            <Text style={[styles.spriteLabel, { color: accent }]}>WARRIOR</Text>
            <Text style={styles.spriteSub}>{player.jobName}</Text>
            <Text style={styles.spriteTag}>[sprite]</Text>
          </View>
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

      {/* Boss */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>WEEKLY BOSS</Text>
        {boss ? (
          <>
            <Text style={styles.bossName}>
              {boss.name} <Text style={styles.dim}>· tier {boss.tier}</Text>
              {boss.defeated ? <Text style={styles.defeated}>  ☠ DEFEATED</Text> : null}
            </Text>
            <AnimatedHPBar current={boss.currentHP} max={boss.maxHP} />
            <Text style={styles.dim}>
              {Math.round(boss.currentHP).toLocaleString()} / {boss.maxHP.toLocaleString()} HP
            </Text>
            <Text style={styles.dimSmall}>
              {boss.defeated
                ? "Victory! Next boss arrives Monday."
                : `${boss.startDate} → ${boss.endDate}`}
            </Text>
          </>
        ) : (
          <Text style={styles.dim}>Summoning this week's boss…</Text>
        )}
      </View>

      {/* Deploy — the dopamine action */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>DEPLOY</Text>
        <Text style={styles.dimSmall}>
          Unleash your whole Energy bank as a burst hit on the boss.
        </Text>
        <DeployButton
          energy={m.energy}
          streakCount={streak.count}
          streakMult={streak.multiplier}
          disabled={busy || m.energy <= 0 || !bossActive}
          onDeploy={onDeploy}
        />
      </View>

      {/* Idle combat */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>IDLE COMBAT</Text>
        <Text style={styles.dimSmall}>
          Your hero auto-attacks at ×{player.idleMultiplier}. Accrues up to{" "}
          {Math.round(data.idle.capMs / 3_600_000)}h offline, then pauses.
        </Text>
        <View style={styles.idleRow}>
          <Text style={styles.idlePending}>+{pendingIdle.toLocaleString()} pending</Text>
          <Btn
            label="Collect"
            onPress={onCollectIdle}
            disabled={busy || pendingIdle <= 0 || !bossActive}
            kind="ghost"
          />
        </View>
      </View>

      {/* Guild (co-op roster + recognition) */}
      {overview ? <GuildBoard overview={overview} /> : null}

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
  playerRow: { flexDirection: "row", gap: SIZES.gap, alignItems: "center" },
  sprite: {
    width: SIZES.spriteBox,
    height: SIZES.spriteBox,
    borderWidth: 2,
    borderRadius: 10,
    backgroundColor: "#0c0e14",
    alignItems: "center",
    justifyContent: "center",
  },
  spriteLabel: { fontSize: 13, fontWeight: "800", letterSpacing: 1 },
  spriteSub: { color: PALETTE.text, fontSize: 12, marginTop: 2 },
  spriteTag: { color: PALETTE.textDim, fontSize: 10, marginTop: 4 },
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
  defeated: { color: PALETTE.good, fontSize: 14, fontWeight: "800" },
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

