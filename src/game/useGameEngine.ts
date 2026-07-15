// =============================================================================
// useGameEngine — the single "brain" shared by BOTH the classic DashboardScreen
// and the new GameScreen (spec §9 / STR-66). It owns EVERY data read, effect,
// and action the home screen runs: the reactive dashboard query, the guild
// overview, the auto-collect-on-open, rally-seen, boost-reward banner, teaching
// moments, once-per-launch ensureSession, the silent HealthKit re-sync, the
// busy/note UI state, and the deploy / collect / overdrive action handlers.
//
// This is the M2.75 safety guarantee: while both screens exist behind
// DEV_FLAGS.useGameScreen, they consume ONE hook, so their game behavior
// cannot fork. The extraction from DashboardScreen was mechanical — the hook
// body below is that screen's original logic verbatim, in the same order, so
// the classic screen renders and behaves exactly as before.
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { TEACHING } from "../config/assets";
import { useGameEvents } from "../feedback/useGameEvents";
import { useTeammateDamage } from "../feedback/useTeammateDamage";
import { useFeedback } from "../feedback/FeedbackProvider";
import { friendlyError } from "../feedback/errors";
import { usePendingIdle } from "../usePendingIdle";
import {
  isAvailable as healthKitAvailable,
  readTodaySteps,
} from "../health/healthkit";

/**
 * Runs all of the home screen's data/effects/actions and returns exactly what
 * a view needs to render it. Call this ONCE at the top of a screen (before any
 * early return), the way DashboardScreen used to inline these hooks — the hook
 * order below is preserved from that screen so React sees an identical order.
 */
export function useGameEngine() {
  const data = useQuery(api.game.dashboard, {});
  const recordSteps = useMutation(api.steps.recordSteps);
  const ensureSession = useMutation(api.users.ensureSession);
  const deployMut = useMutation(api.combat.deploy);
  const collectIdleMut = useMutation(api.combat.collectIdle);
  const activateOverdriveMut = useMutation(api.overdrive.activateOverdrive);
  const markRalliesSeenMut = useMutation(api.rally.markRalliesSeen);
  const markBoostSeenMut = useMutation(api.users.markBoostSeen);
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

  // Received-rally celebration (STR-15): every unseen rally plays ONCE — a
  // banner naming the SENDER (the nudge comes from a friend, not the app) —
  // then the batch is acknowledged server-side. The played-set guards the
  // reactive window between the emit and markRalliesSeen's write landing.
  const playedRallies = useRef(new Set<string>());
  const unseenRallies = data?.rally.unseen;
  useEffect(() => {
    if (!unseenRallies || unseenRallies.length === 0) return;
    let sawNew = false;
    for (const r of unseenRallies) {
      if (playedRallies.current.has(r.rallyId)) continue;
      playedRallies.current.add(r.rallyId);
      sawNew = true;
      emit({
        type: "rallyReceived",
        senderName: r.senderName,
        hours: Math.round(r.hours),
      });
    }
    if (sawNew) markRalliesSeenMut({}).catch(() => {});
  }, [unseenRallies, emit, markRalliesSeenMut]);

  // Reward banner (STR-57 + STR-61): "the crew dealt X bonus damage — ×N power
  // all this week!" — fires once EVER per boosted week, by server state: the
  // dashboard's boost.seen reflects users.boostSeenChallengeId, and we stamp it
  // right after showing. The ref only guards the reactive window between the
  // emit and the stamp's write landing (same shape as the rally played-set).
  // A tier-0 rollover has boost = null and shows NOTHING extra (never-punish).
  const boostBannerFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data?.boost || data.boost.seen || !data.boss) return;
    if (boostBannerFor.current === data.boss.id) return;
    boostBannerFor.current = data.boss.id;
    emit({
      type: "boostActive",
      mult: data.boost.mult,
      sourceDamage: data.boost.sourceDamage,
    });
    markBoostSeenMut({ challengeId: data.boss.id }).catch(() => {});
  }, [data, emit, markBoostSeenMut]);

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

  return {
    data,
    overview,
    pendingIdle,
    busy,
    note,
    showHealthScreen,
    setShowHealthScreen,
    onDeploy,
    onCollectIdle,
    onActivateOverdrive,
  };
}

/** The shape returned by {@link useGameEngine} — the props every home-screen
 *  view consumes. Exported so GameScreen's zones can be typed against it. */
export type GameEngine = ReturnType<typeof useGameEngine>;
