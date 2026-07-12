// =============================================================================
// DevPanel — dev-only control panel (gated by DEV_FLAGS.showDevPanel + the
// backend ENABLE_DEV_TOOLS env var). Time-travel the server clock, inject steps,
// and manage simulated teammates so time-based + co-op mechanics are testable in
// minutes. Deliberately loud (magenta, dashed) so it reads as NOT-real UI.
// =============================================================================
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
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
  const setFuelHours = useMutation(api.dev.setFuelHours);
  const fillOverdrive = useMutation(api.dev.fillOverdrive);
  const simRally = useMutation(api.dev.simulateTeammateRally);
  const grantShield = useMutation(api.dev.grantShield);
  const consumeShield = useMutation(api.dev.consumeShield);

  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await fn();
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
      </View>

      {open && (
        <>
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
                </View>
              </View>
            ))}

          <Section title="ACCOUNT">
            <Btn label="Reset my account" onPress={run(() => resetAccount({}))} busy={busy} />
          </Section>
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
  section: { gap: 6 },
  sectionTitle: { color: PALETTE.dev, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
