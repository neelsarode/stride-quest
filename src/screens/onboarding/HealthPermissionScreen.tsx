// =============================================================================
// Beat 3 — Power source (STR-48; onboarding spec §Flow Beat 3; comp beats
// HEALTH / PERMISSION / SYNC).
// =============================================================================
// The HealthKit permission moment, MOVED here from the buried dashboard button,
// with two-step priming: THIS screen explains why before any native prompt (an
// instinctive "no" to a cold iOS dialog burns our one shot). Three states:
//   prime  — why we ask, what we read (steps, nothing else), CONNECT / LATER
//   payoff — the grant moment: steps already walked today load the Energy bank
//            before the first battle ("+4,832 steps… Your hero felt that.")
//   quiet  — the grant produced no data (Simulator, or read denied — iOS never
//            reveals which). Warm, never punitive: Settings deep-link + continue.
// "Maybe later" and every no-data path proceed on the 24h starter tank — the
// beat NEVER gates (binding guardrail). The dashboard's calm CONNECT HEALTH
// chip (never red) reopens this same screen later, so skipping costs nothing.
//
// On web/Android the beat doesn't render at all: OnboardingFlow auto-skips when
// healthkit.isAvailable() is false (the stub always says false). The DEV
// forceHealthBeat flag previews the screens in the browser — the stub then
// lands "connect" on the quiet state by construction.
// =============================================================================
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PALETTE, SIZES } from "../../config/assets";
import {
  readTodaySteps,
  requestStepPermission,
} from "../../health/healthkit";

type Phase =
  | { id: "prime" }
  | { id: "payoff"; steps: number }
  | { id: "quiet" };

export function HealthPermissionScreen({ onDone }: { onDone: () => void }) {
  const recordSteps = useMutation(api.steps.recordSteps);
  const [phase, setPhase] = useState<Phase>({ id: "prime" });
  const [busy, setBusy] = useState(false);

  // CONNECT → the REAL native prompt (requestStepPermission), then the first
  // sync (readTodaySteps → recordSteps — all existing seam functions). Real
  // steps → the payoff moment; null/0 → the quiet state (iOS never tells us
  // whether that's "denied" or "no data yet", so both get the same warmth).
  async function onConnect() {
    if (busy) return;
    setBusy(true);
    try {
      await requestStepPermission();
      const steps = await readTodaySteps();
      if (steps != null && steps > 0) {
        // recordSteps also stamps users.healthKitConnectedAt (the chip's
        // server-side "connected" signal) on this first real sync.
        await recordSteps({ stepCount: steps, source: "healthkit" });
        setPhase({ id: "payoff", steps });
      } else {
        setPhase({ id: "quiet" });
      }
    } catch {
      setPhase({ id: "quiet" });
    } finally {
      setBusy(false);
    }
  }

  if (phase.id === "payoff") {
    return (
      <Frame>
        <Text style={styles.payoffSteps}>
          +{phase.steps.toLocaleString()} STEPS
        </Text>
        <Text style={styles.body}>already walked today.</Text>
        <Text style={styles.headline}>YOUR HERO FELT THAT.</Text>
        <Btn gold label="TO BATTLE!" onPress={onDone} />
        <Text style={styles.footer}>
          Steps keep syncing on their own from here.
        </Text>
      </Frame>
    );
  }

  if (phase.id === "quiet") {
    return (
      <Frame>
        <Text style={styles.headline}>NO STEPS CAME{"\n"}THROUGH YET.</Text>
        <Text style={styles.body}>
          That's okay — your hero starts with a full 24-hour tank either way.
        </Text>
        <Text style={styles.hint}>
          If you said no to Health access earlier, iOS keeps that choice in
          Settings — you can change it there any time.
        </Text>
        {Platform.OS === "ios" && (
          <Btn label="OPEN SETTINGS" onPress={() => Linking.openSettings()} />
        )}
        <Btn gold label="CONTINUE" onPress={onDone} />
      </Frame>
    );
  }

  // prime — explain-then-ask, before any native prompt (comp HEALTH beat).
  return (
    <Frame>
      <Text style={styles.heart}>♥</Text>
      <Text style={styles.headline}>FUEL YOUR HERO</Text>
      <Text style={styles.body}>Your hero fights with your real steps.</Text>
      <Text style={styles.body}>
        Stride Quest asks Apple Health for your step count. That's all it ever
        reads — and it never leaves your guild.
      </Text>
      <Text style={styles.body}>Steps become Energy. Energy wins the week.</Text>
      <View style={styles.ctaBlock}>
        <Btn
          gold
          label="CONNECT APPLE HEALTH"
          onPress={onConnect}
          disabled={busy}
        />
        <Btn label="MAYBE LATER" onPress={onDone} disabled={busy} />
      </View>
      {busy && <ActivityIndicator color={PALETTE.accent} />}
      <Text style={styles.footer}>
        Later is fine — your hero starts with a full 24-hour tank.
      </Text>
    </Frame>
  );
}

// --- shared pieces (GuildStepScreens' visual language) -------------------------

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.wordmark}>STRIDE QUEST</Text>
      {children}
    </ScrollView>
  );
}

function Btn({
  label,
  onPress,
  disabled,
  gold,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  gold?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        gold ? styles.btnGold : styles.btnGhost,
        (disabled || pressed) && styles.btnPressed,
      ]}
    >
      <Text style={[styles.btnText, !gold && styles.btnTextGhost]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.bg },
  content: {
    alignItems: "center",
    padding: SIZES.screenPad,
    paddingTop: 54,
    paddingBottom: 40,
    gap: 12,
  },
  wordmark: {
    color: PALETTE.textDim,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: 14,
  },
  heart: { color: PALETTE.accent, fontSize: 44, marginTop: 12 },
  headline: {
    color: PALETTE.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    lineHeight: 32,
  },
  body: {
    color: PALETTE.text,
    fontSize: 14,
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 20,
  },
  hint: {
    color: PALETTE.textDim,
    fontSize: 12,
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 18,
  },
  footer: {
    color: PALETTE.textDim,
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
    maxWidth: 300,
  },
  payoffSteps: {
    color: PALETTE.accent,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 24,
  },
  ctaBlock: { gap: 8, marginTop: 14, alignItems: "center" },
  btn: {
    borderRadius: 12,
    paddingVertical: 13,
    minWidth: 260,
    alignItems: "center",
  },
  btnGold: { backgroundColor: PALETTE.accent },
  btnGhost: { borderWidth: 1, borderColor: PALETTE.panelBorder },
  btnPressed: { opacity: 0.55 },
  btnText: {
    color: "#11131a",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  btnTextGhost: { color: PALETTE.text },
});
