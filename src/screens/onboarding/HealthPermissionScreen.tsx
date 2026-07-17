// =============================================================================
// Beat 3 — Power source (STR-48; onboarding spec §Flow Beat 3; comp beats
// HEALTH / PERMISSION / SYNC).
// =============================================================================
// The HealthKit permission moment with two-step priming: THIS screen explains
// why before any native prompt (an instinctive "no" to a cold iOS dialog burns
// our one shot). Three states:
//   prime  — why we ask, what we read (steps, nothing else), CONNECT / LATER
//   payoff — the grant moment: steps already walked today load the Energy bank
//   quiet  — the grant produced no data (Simulator, or read denied — iOS never
//            reveals which). Warm, never punitive: Settings deep-link + continue.
// "Maybe later" and every no-data path proceed on the 24h starter tank — the
// beat NEVER gates (binding guardrail).
//
// On web/Android the beat doesn't render at all: OnboardingFlow auto-skips when
// healthkit.isAvailable() is false. The DEV forceHealthBeat flag previews it in
// the browser.
//
// Pixel-kit skin (STR-88): battlefield background + baked bitmap font + kit
// Button + the baked heart icon, replacing the flat placeholder. Logic
// unchanged. NOTE: the bitmap font has no apostrophe / em-dash, so the copy is
// lightly reworded (arcade caps) and pre-split into lines (PixelText can't wrap).
// =============================================================================
import { useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { readTodaySteps, requestStepPermission } from "../../health/healthkit";
import { BakedImage, Button, PixelText, UIScaleProvider } from "../../ui";
import { UI_PALETTE } from "../../ui/theme";
import { OnboardingBackground, useOnbLayout } from "./OnboardingBackground";

type Phase =
  | { id: "prime" }
  | { id: "payoff"; steps: number }
  | { id: "quiet" };

export function HealthPermissionScreen({ onDone }: { onDone: () => void }) {
  const { artScale } = useOnbLayout();
  const recordSteps = useMutation(api.steps.recordSteps);
  const [phase, setPhase] = useState<Phase>({ id: "prime" });
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    if (busy) return;
    setBusy(true);
    try {
      await requestStepPermission();
      const steps = await readTodaySteps();
      if (steps != null && steps > 0) {
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

  const head = artScale * 2;
  const body = artScale;

  if (phase.id === "payoff") {
    return (
      <Frame>
        <PixelText text={`+${phase.steps.toLocaleString()} STEPS`} color={UI_PALETTE.gold_light} scale={artScale * 3} />
        <PixelText text="ALREADY WALKED TODAY." color={UI_PALETTE.sky_mid} scale={body} style={{ marginTop: 6 * artScale }} />
        <PixelText text="YOUR HERO FELT THAT." color={UI_PALETTE.gold_light} scale={head} style={{ marginTop: 10 * artScale }} />
        <View style={{ marginTop: 16 * artScale }}>
          <Btn gold big label="TO BATTLE!" onPress={onDone} artScale={artScale} />
        </View>
        <Lines lines={["STEPS KEEP SYNCING ON THEIR OWN", "FROM HERE."]} color={UI_PALETTE.sky_dark} scale={body} top={16 * artScale} />
      </Frame>
    );
  }

  if (phase.id === "quiet") {
    return (
      <Frame>
        <PixelText text="NO STEPS YET." color={UI_PALETTE.gold_light} scale={head} />
        <Lines
          lines={["NO WORRIES - YOUR HERO STARTS", "WITH A FULL 24H TANK EITHER WAY."]}
          color={UI_PALETTE.sky_mid}
          scale={body}
          top={10 * artScale}
        />
        <Lines
          lines={["SAID NO EARLIER? IOS KEEPS THAT", "IN SETTINGS - CHANGE IT ANY TIME."]}
          color={UI_PALETTE.sky_dark}
          scale={body}
          top={10 * artScale}
        />
        <View style={{ marginTop: 16 * artScale, alignItems: "center", gap: 6 * artScale }}>
          {Platform.OS === "ios" && (
            <Btn label="OPEN SETTINGS" onPress={() => Linking.openSettings()} artScale={artScale} />
          )}
          <Btn gold big label="CONTINUE" onPress={onDone} artScale={artScale} />
        </View>
      </Frame>
    );
  }

  // prime — explain-then-ask, before any native prompt (comp HEALTH beat).
  return (
    <Frame>
      <BakedImage name="icon_heart" scale={artScale * 3} />
      <PixelText text="FUEL YOUR HERO" color={UI_PALETTE.gold_light} scale={head} style={{ marginTop: 8 * artScale }} />
      <Lines lines={["YOUR HERO FIGHTS WITH", "YOUR REAL STEPS."]} color={UI_PALETTE.white} scale={body} top={10 * artScale} />
      <Lines
        lines={["WE READ ONLY YOUR STEP COUNT.", "IT NEVER LEAVES YOUR GUILD."]}
        color={UI_PALETTE.sky_mid}
        scale={body}
        top={10 * artScale}
      />
      <Lines lines={["STEPS BECOME ENERGY.", "ENERGY WINS THE WEEK."]} color={UI_PALETTE.sky_mid} scale={body} top={10 * artScale} />
      <View style={{ marginTop: 16 * artScale, alignItems: "center", gap: 6 * artScale, opacity: busy ? 0.6 : 1 }}>
        <Btn gold big label="CONNECT APPLE HEALTH" onPress={onConnect} disabled={busy} artScale={artScale} />
        <Btn label="MAYBE LATER" onPress={onDone} disabled={busy} artScale={artScale} />
      </View>
      {busy && <PixelText text="CONNECTING..." color={UI_PALETTE.sky_dark} scale={body} style={{ marginTop: 8 * artScale }} />}
      <Lines lines={["LATER IS FINE - YOU START", "WITH A FULL 24H TANK."]} color={UI_PALETTE.sky_dark} scale={body} top={16 * artScale} />
    </Frame>
  );
}

// --- shared pieces (OnboardingBackground pixel language) ----------------------

function Frame({ children }: { children: React.ReactNode }) {
  const { artScale, insets } = useOnbLayout();
  return (
    <OnboardingBackground topDim={0.55}>
      <UIScaleProvider value={artScale}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <PixelText text="WALKPG" color={UI_PALETTE.silver_dark} scale={artScale} style={{ marginBottom: 12 * artScale }} />
          {children}
        </ScrollView>
      </UIScaleProvider>
    </OnboardingBackground>
  );
}

/** Stacked, centred bitmap-font lines (PixelText doesn't wrap). */
function Lines({
  lines,
  color,
  scale,
  top,
}: {
  lines: string[];
  color: string;
  scale: number;
  top?: number;
}) {
  return (
    <View style={{ alignItems: "center", gap: Math.round(scale * 1.5), marginTop: top }}>
      {lines.map((l, i) => (
        <PixelText key={i} text={l} color={color} scale={scale} />
      ))}
    </View>
  );
}

function Btn({
  label,
  onPress,
  disabled,
  gold,
  big,
  artScale,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  gold?: boolean;
  big?: boolean;
  artScale: number;
}) {
  return (
    <Button
      material={gold ? "gold" : "silver"}
      label={label}
      labelScale={big ? 2 : 1}
      scale={artScale}
      disabled={disabled}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { alignItems: "center", paddingHorizontal: 20, gap: 4 },
});

export default HealthPermissionScreen;
