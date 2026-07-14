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
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import {
  HERO_STATE_STYLE,
  PALETTE,
  SIZES,
  TEACHING,
  classAccent,
} from "../config/assets";
import { CLASSES, DAILY_STEP_GOAL } from "../../convex/gameConfig";
import { DEV_FLAGS } from "../devConfig";
import { AnimatedHPBar } from "../components/AnimatedHPBar";
import { AnimatedMeter } from "../components/AnimatedMeter";
import { DeployButton } from "../components/DeployButton";
import { OverdriveMeter } from "../components/OverdriveMeter";
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
  const activateOverdriveMut = useMutation(api.overdrive.activateOverdrive);
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

  // Auto-collect idle once on open ("while you were away…"). The snapshot in
  // this closure is the PRE-collect one, so hasEverCollectedIdle still says
  // whether this is the account's first payout — the one-time "Your hero
  // never stops." teaching suffix (STR-49; server state, never localStorage).
  const didCollect = useRef(false);
  useEffect(() => {
    if (didCollect.current || !data) return;
    didCollect.current = true;
    const firstTime = !data.hasEverCollectedIdle;
    collectIdleMut({})
      .then((r) => {
        if (r && r.collected > 0)
          emit({ type: "idleCollected", amount: r.collected, firstTime });
      })
      .catch(() => {});
  }, [collectIdleMut, emit, data]);

  // Teaching layer (STR-49): the boss-arrival banner frames the week on the
  // FIRST post-onboarding render — keyed off the onboardedAt stamp's
  // freshness (the stamp lands seconds before this screen mounts), so
  // tomorrow's app-open stays quiet. Once per mount, only while the boss is
  // actually up.
  const didBossAppears = useRef(false);
  useEffect(() => {
    if (didBossAppears.current || !data?.boss || data.boss.defeated) return;
    const onboardedAt = data.player.onboardedAt;
    if (onboardedAt == null) return;
    if (Date.now() - onboardedAt > TEACHING.bossAppearsFreshMs) return;
    didBossAppears.current = true;
    emit({ type: "bossAppears", bossName: data.boss.name });
  }, [data, emit]);

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

  // Pop the charged Overdrive (STR-14). The OVERDRIVE! banner fires from the
  // reactive diff (useGameEvents), so a success needs no emit here; friendly
  // server rejections (uncharged / resting / already running) surface as calm
  // toasts via their ConvexError message.
  async function onActivateOverdrive() {
    setBusy(true);
    try {
      await activateOverdriveMut({});
    } catch (e) {
      emit({ type: "actionRejected", message: friendlyError(e) });
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

  const { player, guild, boss, steps, streak, dailyGoal, fuel } = data;
  const m = data.meters;
  const bossActive = !!boss && !boss.defeated;
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

      {/* Player + placeholder sprite. While Resting the box frames the
          dignified kneel — the per-job `rest` animation lands with STR-38
          through this same assets.ts seam (placeholder glyph until then). */}
      <View style={styles.card}>
        <View style={styles.playerRow}>
          <View
            style={[
              styles.sprite,
              { borderColor: resting ? hs.color : accent },
              resting && styles.spriteResting,
            ]}
          >
            <Text style={[styles.spriteLabel, { color: resting ? hs.color : accent }]}>
              {resting ? "🧎" : CLASSES[player.classKey].displayName.toUpperCase()}
            </Text>
            <Text style={styles.spriteSub}>{player.jobName}</Text>
            <Text style={styles.spriteTag}>
              {resting ? "[rest sprite]" : "[sprite]"}
            </Text>
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
          // First-deploy hint (STR-49): pulses while there's something to
          // deploy and this account has NEVER deployed. lastDeployDate is
          // server truth, so one deploy silences it forever, on every device.
          firstDeployHint={m.energy > 0 && !data.hasEverDeployed && bossActive}
          onDeploy={onDeploy}
        />
      </View>

      {/* Overdrive (STR-14) — the player-activated fever mode. Sits with the
          action cluster: DEPLOY is the daily anchor, this is the earned spike. */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>OVERDRIVE</Text>
        <OverdriveMeter
          chargePct={data.overdrive.chargePct}
          ready={data.overdrive.ready}
          active={data.overdrive.active}
          remainingSeconds={data.overdrive.remainingSeconds}
          idleDamageMult={data.overdrive.idleDamageMult}
          durationHours={data.overdrive.durationHours}
          resting={resting}
          busy={busy}
          onActivate={onActivateOverdrive}
        />
      </View>

      {/* Idle combat */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>IDLE COMBAT</Text>
        <Text style={styles.dimSmall}>
          Your hero auto-attacks at ×{player.idleMultiplier}
          {data.overdrive.active ? ` · ⚡ OVERDRIVE ×${data.overdrive.idleDamageMult}` : ""} —{" "}
          {Math.round(data.idle.dph).toLocaleString()} damage/hour right now. Accrues up to{" "}
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

/** Friendly message from a server rejection: ConvexError carries a structured
 *  {code, message} written for players (the STR-44/53 pattern); anything else
 *  falls back to a generic line rather than leaking an internal error string. */
function friendlyError(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { message?: string } | string;
    const msg = typeof data === "string" ? data : data?.message;
    if (msg) return msg;
  }
  return "That didn't go through — give it another try in a moment.";
}

// Fuel time formatting (STR-13): the tank speaks in REAL fight time
// (hoursToEmpty already stretches the winded tail). Compact form for the gauge
// ("21h" / "9.5h" / "40m"), sentence forms for the readout copy.
function fmtFightShort(hours: number): string {
  if (hours >= 10) return `${Math.round(hours)}h`;
  if (hours >= 1) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.max(1, Math.round(hours * 60))}m`;
}

function fmtFightTime(hours: number): string {
  if (hours >= 10) return `${Math.round(hours)} hours`;
  if (hours >= 1) {
    const h = Math.round(hours * 10) / 10;
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  const mins = Math.max(1, Math.round(hours * 60));
  return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
}

function fmtMoreTime(hours: number): string {
  if (hours >= 10) return `${Math.round(hours)} more hours`;
  if (hours >= 1) {
    const h = Math.round(hours * 10) / 10;
    return `${h} more ${h === 1 ? "hour" : "hours"}`;
  }
  const mins = Math.max(1, Math.round(hours * 60));
  return `${mins} more ${mins === 1 ? "minute" : "minutes"}`;
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
  // The resting kneel framing: slightly dimmed, calm — dignified, not grayed-out.
  spriteResting: { opacity: 0.85 },
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

