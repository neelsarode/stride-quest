// =============================================================================
// DevPanel — dev-only control panel (gated by DEV_FLAGS.showDevPanel + the
// backend ENABLE_DEV_TOOLS env var). Time-travel the server clock, inject steps,
// and manage simulated teammates so time-based + co-op mechanics are testable in
// minutes. Deliberately loud (magenta, dashed) so it reads as NOT-real UI.
// =============================================================================
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FX_ANCHORS } from "../battle/anchors";
import {
  Fighter,
  type FighterHandle,
  type FighterMode,
  type ReleaseEvent,
} from "../battle/Fighter";
import { CLASS_NAMES, FX } from "../battle/fxConfig";
import { Sprite } from "../battle/Sprite";
import { PALETTE, SIZES } from "../config/assets";
import { INJECTOR_AMOUNTS, TEAMMATE_STEP_AMOUNTS } from "../devConfig";

function fmtOffset(ms: number): string {
  if (ms === 0) return "live (no offset)";
  const sign = ms < 0 ? "−" : "+";
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  return `${sign}${d}d ${h}h`;
}

export function DevPanel({ stepsToday }: { stepsToday: number }) {
  const status = useQuery(api.dev.status, {});
  // M1 readout: same reactive query the real screens use (dedup'd by Convex),
  // so every scenario in STR-16 is numerically observable from this panel.
  const dash = useQuery(api.game.dashboard, {});
  const recordSteps = useMutation(api.steps.recordSteps);
  const advanceDay = useMutation(api.dev.advanceDay);
  const fastForwardIdle = useMutation(api.dev.fastForwardIdle);
  const resetClock = useMutation(api.dev.resetClock);
  const triggerWeeklyReset = useMutation(api.dev.triggerWeeklyReset);
  const addTeammate = useMutation(api.dev.addSimulatedTeammate);
  const injectFor = useMutation(api.dev.injectStepsFor);
  const simDeploy = useMutation(api.dev.simulateTeammateDeploy);
  const removeTeammates = useMutation(api.dev.removeSimulatedTeammates);
  const resetAccount = useMutation(api.dev.resetAccount);
  const resetOnboarding = useMutation(api.dev.resetOnboarding);
  const setFuelHours = useMutation(api.dev.setFuelHours);
  const fillOverdrive = useMutation(api.dev.fillOverdrive);
  const simRally = useMutation(api.dev.simulateTeammateRally);
  const drainTeammate = useMutation(api.dev.drainTeammate);
  const grantShield = useMutation(api.dev.grantShield);
  const consumeShield = useMutation(api.dev.consumeShield);
  // The REAL activation mutation (what STR-14's button will call) — exposed
  // here so Overdrive's ×3 window is testable before that UI exists.
  const activateOverdrive = useMutation(api.overdrive.activateOverdrive);

  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    setLastError(null);
    try {
      await fn();
    } catch (e: unknown) {
      // Surface rejections (rally daily limit, uncharged activate, …) in-panel
      // so negative paths are verifiable without the console.
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (status && !status.enabled) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>🛠 DEV TOOLS</Text>
        <Text style={styles.dim}>
          Disabled — set ENABLE_DEV_TOOLS=true on the deployment.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.header}>
        <Text style={styles.label}>🛠 DEV TOOLS</Text>
        <Text style={styles.dim}>{open ? "hide ▲" : "show ▼"}</Text>
      </Pressable>

      {/* Mocked-clock readout — always visible so you know "what day it is". */}
      <View style={styles.clock}>
        <Text style={styles.clockMain}>
          {status?.enabled ? status.date : "…"}{" "}
          <Text style={styles.dim}>
            ({status?.enabled ? fmtOffset(status.offsetMs) : ""})
          </Text>
        </Text>
        <Text style={styles.dim}>
          week {status?.enabled ? `${status.weekStart} → ${status.weekEnd}` : ""}
        </Text>
        {dash && (
          <>
            <Text style={styles.readout}>
              FUEL {dash.fuel.current.toLocaleString()} (
              {dash.fuel.hoursToEmpty.toFixed(1)}h) ·{" "}
              {dash.fuel.state.toUpperCase()}
            </Text>
            <Text style={styles.readout}>
              OD {dash.overdrive.chargePct}%
              {dash.overdrive.active
                ? ` · ACTIVE ${dash.overdrive.remainingSeconds}s left`
                : dash.overdrive.ready
                  ? " · READY"
                  : ""}{" "}
              · SHIELDS {dash.shields.held}/{dash.shields.max}
            </Text>
            <Text style={styles.readout}>
              ⚡{dash.meters.energy.toLocaleString()} · STREAK{" "}
              {dash.streak.count} (×{dash.streak.multiplier.toFixed(2)}) · JOB{" "}
              {dash.player.jobLevel}
            </Text>
            <Text style={styles.readout}>
              BOSS {dash.boss ? `${dash.boss.currentHP.toLocaleString()}/${dash.boss.maxHP.toLocaleString()} T${dash.boss.tier}` : "—"}
            </Text>
            {/* Bonus phase (STR-56): the accumulating meter + the tier preview
                the rollover will stamp — numerically verifiable pre-UI. */}
            {dash.bonus && (
              <Text style={styles.readout}>
                BONUS {dash.bonus.totalDamage.toLocaleString()} · T
                {dash.bonus.currentTier} ×{dash.bonus.currentMult.toFixed(2)}
                {dash.bonus.nextTier
                  ? ` · next ${Math.ceil(dash.bonus.nextTier.damageToGo).toLocaleString()}`
                  : " · MAX"}
              </Text>
            )}
            {/* Active guild-wide reward stamped on THIS week (STR-56). Absent
                = ×1.0 floor — no line, never a "×1.00" badge (never-punish). */}
            {dash.boost && (
              <Text style={styles.readout}>
                BOOST ×{dash.boost.mult.toFixed(2)} (from{" "}
                {dash.boost.sourceDamage.toLocaleString()})
              </Text>
            )}
          </>
        )}
        {lastError && <Text style={styles.err}>⛔ {lastError}</Text>}
      </View>

      {open && (
        <>
          <SpriteDemo />
          <FighterDemo />

          <Section title="TIME">
            <Btn label="Advance day +1" onPress={run(() => advanceDay({ days: 1 }))} busy={busy} />
            <Btn label="+10h idle" onPress={run(() => fastForwardIdle({ hours: 10 }))} busy={busy} />
            <Btn label="Weekly reset →" onPress={run(() => triggerWeeklyReset({}))} busy={busy} />
            <Btn label="Reset clock" onPress={run(() => resetClock({}))} busy={busy} />
          </Section>

          <Section title="INJECT MY STEPS">
            {INJECTOR_AMOUNTS.map((amt) => (
              <Btn
                key={amt}
                label={`+${amt.toLocaleString()}`}
                onPress={run(() =>
                  recordSteps({ stepCount: stepsToday + amt, source: "injector" }),
                )}
                busy={busy}
              />
            ))}
          </Section>

          <Section title="FUEL">
            <Btn label="Tank → 24h" onPress={run(() => setFuelHours({ hours: 24 }))} busy={busy} />
            <Btn label="Drain → Winded" onPress={run(() => setFuelHours({ hours: 3 }))} busy={busy} />
            <Btn label="Drain → Resting" onPress={run(() => setFuelHours({ hours: 0 }))} busy={busy} />
            <Btn label="⚡ Overdrive 100%" onPress={run(() => fillOverdrive({}))} busy={busy} />
            <Btn label="⚡ Activate ×3" onPress={run(() => activateOverdrive({}))} busy={busy} />
            <Btn label="+1 Shield" onPress={run(() => grantShield({}))} busy={busy} />
            <Btn label="−1 Shield" onPress={run(() => consumeShield({}))} busy={busy} />
          </Section>

          <Section title="TEAMMATES (co-op)">
            <Btn label="+ Add teammate" onPress={run(() => addTeammate({ name: undefined }))} busy={busy} />
            <Btn label="Remove all" onPress={run(() => removeTeammates({}))} busy={busy} />
          </Section>

          {status?.enabled &&
            status.teammates.map((tm) => (
              <View key={tm.userId} style={styles.teammate}>
                <Text style={styles.teammateName}>
                  {tm.displayName} · {tm.stepsToday.toLocaleString()} steps
                </Text>
                <View style={styles.row}>
                  {TEAMMATE_STEP_AMOUNTS.map((amt) => (
                    <Btn
                      key={amt}
                      label={`+${amt.toLocaleString()}`}
                      onPress={run(() =>
                        injectFor({ userId: tm.userId, stepCount: tm.stepsToday + amt }),
                      )}
                      busy={busy}
                    />
                  ))}
                  <Btn
                    label="⚔ Deploy"
                    onPress={run(() => simDeploy({ userId: tm.userId }))}
                    busy={busy}
                  />
                  {/* Rally ME (drain to Winded/Resting first — the real
                      eligibility check applies, like a friend's rally). */}
                  <Btn
                    label="📣 Rally me"
                    onPress={run(() => simRally({ giverId: tm.userId }))}
                    busy={busy}
                  />
                  {/* Drain THE BOT to Resting (STR-15): makes it eligible for
                      MY rally, so the real Send Rally path on the guild board
                      is exercisable end-to-end in the browser. */}
                  <Btn
                    label="💤 Drain"
                    onPress={run(() => drainTeammate({ userId: tm.userId }))}
                    busy={busy}
                  />
                </View>
              </View>
            ))}

          <Section title="ACCOUNT">
            <Btn label="Reset my account" onPress={run(() => resetAccount({}))} busy={busy} />
            {/* STR-45 re-test loop: clears class/onboardedAt + the solo guild,
                so the flow runs again from Beat 1 on the next render. */}
            <Btn label="Reset onboarding" onPress={run(() => resetOnboarding({}))} busy={busy} />
          </Section>
        </>
      )}
    </View>
  );
}

// STR-18 verification vehicle for src/battle/Sprite.tsx (plan D2): a looping
// warlord idle plus a one-shot attack, with a RENDER COUNT readout proving the
// D2 invariant — frame stepping happens on the UI thread, so React re-render
// count stays FLAT while the loop runs (it only ticks on real state changes:
// open/attack/onDone). Throwaway once the battle scene lands (plan step 5+).
function SpriteDemo() {
  // Incremented in the component body on EVERY React render — if frames were
  // driven by setState this would count up ~6×/sec. It must not.
  const renderCount = useRef(0);
  renderCount.current += 1;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "attack">("idle");
  const [playKey, setPlayKey] = useState(0);

  const attack = () => {
    setMode("attack");
    // playKey bump = restart token: replays the one-shot from frame 0 even if
    // an attack is already mid-flight (Sprite API, plan D2).
    setPlayKey((k) => k + 1);
  };
  const backToIdle = useCallback(() => setMode("idle"), []);

  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <Text style={styles.sectionTitle}>SPRITE DEMO {open ? "▲" : "▼"}</Text>
      </Pressable>
      {open && (
        <>
          <Text style={styles.readout}>
            RENDER COUNT {renderCount.current} · {mode.toUpperCase()}
          </Text>
          <View style={styles.spriteStage}>
            <Sprite
              // Preview-parity fps (assets/fx-engine.js): idle 6, attack 12.
              animKey={
                mode === "idle"
                  ? "warrior/5_warlord/idle"
                  : "warrior/5_warlord/attack"
              }
              fps={mode === "idle" ? 6 : 12}
              loop={mode === "idle"}
              playKey={playKey}
              onDone={backToIdle}
            />
          </View>
          <View style={styles.row}>
            <Btn label="⚔ Attack (one-shot)" onPress={attack} />
          </View>
        </>
      )}
    </View>
  );
}

// Job folder keys per class, derived from the generated anchors (keys sort
// correctly because job folders are prefixed 1_…5_). Demo-only lookup.
const JOBS_BY_CLASS: Record<string, string[]> = {};
for (const key of Object.keys(FX_ANCHORS)) {
  const [c, j] = key.split("/");
  (JOBS_BY_CLASS[c] ??= []).push(j);
}
for (const c of Object.keys(JOBS_BY_CLASS)) JOBS_BY_CLASS[c].sort();

// STR-19 verification vehicle for src/battle/Fighter.tsx (plan step 3): drive
// one fighter through basic/special/rest and log ACTUAL onRelease latency
// (measured from the button press) against EXPECTED release/fps ms — the
// ticket's Done-when is actual ≈ expected across 3 classes (D2 allows ±1
// frame ≈ 83ms drift). Throwaway once the battle scene lands (plan step 5+).
function FighterDemo() {
  const fighter = useRef<FighterHandle>(null);
  const [open, setOpen] = useState(false);
  const [clsIdx, setClsIdx] = useState(0);
  const [jobIdx, setJobIdx] = useState(4); // start at job 5 (ticket verifies job 5)
  const [resting, setResting] = useState(false);
  const [mode, setMode] = useState<FighterMode>("idle");
  const [log, setLog] = useState<string[]>([]);
  // Set at the accepted button press; onRelease measures latency against it.
  const pressT0 = useRef(0);

  const cls = CLASS_NAMES[clsIdx];
  const jobs = JOBS_BY_CLASS[cls] ?? [];
  const job = jobs[Math.min(jobIdx, jobs.length - 1)];

  const pushLog = (line: string) =>
    setLog((l) => [line, ...l].slice(0, 4));

  const attack = (kind: "basic" | "special") => {
    const t0 = Date.now();
    const ok =
      kind === "basic" ? fighter.current?.basic() : fighter.current?.special();
    if (ok) pressT0.current = t0;
    else pushLog(`${kind} IGNORED (mode=${fighter.current?.getMode()})`);
  };

  const onRelease = useCallback((e: ReleaseEvent) => {
    const actual = Date.now() - pressT0.current;
    const expected = Math.round(e.expectedDelayMs);
    setLog((l) =>
      [
        `${e.cls}/${e.job} ${e.kind}: rel ${actual}ms · exp ${expected}ms · Δ${
          actual - expected >= 0 ? "+" : ""
        }${actual - expected}ms (tip ${e.anchor.tipX},${e.anchor.tipY})`,
        ...l,
      ].slice(0, 4),
    );
  }, []);

  const toggleRest = () => {
    const next = !resting;
    setResting(next);
    fighter.current?.setResting(next);
  };

  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <Text style={styles.sectionTitle}>FIGHTER DEMO {open ? "▲" : "▼"}</Text>
      </Pressable>
      {open && (
        <>
          <Text style={styles.readout}>
            {cls}/{job} · MODE {mode.toUpperCase()}
            {resting ? " · REST REQUESTED" : ""} · atk@{FX.attackFps}fps spc@
            {FX.specialFps}fps
          </Text>
          <View style={styles.spriteStage}>
            <Fighter
              ref={fighter}
              cls={cls}
              job={job}
              onRelease={onRelease}
              onModeChange={setMode}
            />
          </View>
          <View style={styles.row}>
            <Btn
              label={`CLASS ${cls} ▸`}
              onPress={() => setClsIdx((i) => (i + 1) % CLASS_NAMES.length)}
            />
            <Btn
              label={`JOB ${jobIdx + 1} ▸`}
              onPress={() => setJobIdx((i) => (i + 1) % jobs.length)}
            />
            <Btn label="⚔ BASIC" onPress={() => attack("basic")} />
            <Btn label="✦ SPECIAL" onPress={() => attack("special")} />
            <Btn label={resting ? "REST ✓ (wake)" : "REST"} onPress={toggleRest} />
          </View>
          {log.map((line, i) => (
            <Text key={`${i}-${line}`} style={styles.readout}>
              {line}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.row}>{children}</View>
    </View>
  );
}

function Btn({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.btn, (busy || pressed) && styles.btnPressed]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1a0f1d",
    borderColor: PALETTE.dev,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: SIZES.radius,
    padding: SIZES.screenPad,
    gap: 10,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: PALETTE.dev, fontSize: 13, fontWeight: "800", letterSpacing: 1.5 },
  clock: {
    backgroundColor: "#0c0e14",
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  clockMain: { color: PALETTE.text, fontSize: 16, fontWeight: "700", fontFamily: "Courier" },
  readout: { color: "#9fe8c8", fontSize: 12, fontFamily: "Courier", fontWeight: "600" },
  err: { color: "#ff8a8a", fontSize: 12, fontFamily: "Courier", fontWeight: "700" },
  section: { gap: 6 },
  sectionTitle: { color: PALETTE.dev, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  spriteStage: {
    backgroundColor: "#0c0e14",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  teammate: { gap: 6, marginTop: 2 },
  teammateName: { color: PALETTE.text, fontSize: 13, fontWeight: "600" },
  btn: {
    backgroundColor: "#2a0f2e",
    borderColor: PALETTE.dev,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 9,
  },
  btnPressed: { opacity: 0.5 },
  btnText: { color: "#f5c2ff", fontWeight: "700", fontSize: 13 },
  dim: { color: PALETTE.textDim, fontSize: 12 },
});
