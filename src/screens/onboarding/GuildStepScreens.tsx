// =============================================================================
// Beat 2 — Your guild (SCAFFOLD — STR-45).
// =============================================================================
// Routing-only placeholder proving the STR-45 state machine: the fork, the real
// createGuild / joinGuildByCode calls, and the founder's code-reveal step (kept
// alive by OnboardingFlow's guildSettled — see its header). STR-47 replaces the
// internals with the comp's screens (six-box entry, preview-confirm, warm error
// states, native Share).
// =============================================================================
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import { PALETTE } from "../../config/assets";
import type { Viewer } from "./OnboardingFlow";

type Step =
  | { id: "fork" }
  | { id: "create" }
  | { id: "reveal"; guildName: string; inviteCode: string }
  | { id: "join" };

export function GuildStepScreens({
  viewer,
  onDone,
}: {
  viewer: Viewer;
  onDone: () => void;
}) {
  const createGuild = useMutation(api.guild.createGuild);
  const joinGuildByCode = useMutation(api.guild.joinGuildByCode);
  const [step, setStep] = useState<Step>({ id: "fork" });
  const [guildName, setGuildName] = useState(`${viewer.displayName}'s Guild`);
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    setBusy(true);
    setNote(null);
    try {
      const r = await createGuild({
        name: guildName,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      setStep({ id: "reveal", guildName, inviteCode: r.inviteCode });
    } catch (e) {
      setNote(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    setBusy(true);
    setNote(null);
    try {
      await joinGuildByCode({ code });
      onDone(); // membership landed; OnboardingFlow stamps + lands the dashboard
    } catch (e) {
      setNote(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      {step.id === "fork" && (
        <>
          <Text style={styles.title}>HEROES DON'T FIGHT ALONE.</Text>
          <Btn label="START A GUILD" onPress={() => setStep({ id: "create" })} />
          <Btn label="I HAVE A CODE" onPress={() => setStep({ id: "join" })} />
        </>
      )}
      {step.id === "create" && (
        <>
          <Text style={styles.title}>START A GUILD</Text>
          <TextInput
            style={styles.input}
            value={guildName}
            onChangeText={setGuildName}
          />
          <Btn label="CREATE GUILD" onPress={onCreate} disabled={busy} />
        </>
      )}
      {step.id === "reveal" && (
        <>
          <Text style={styles.title}>GUILD CREATED!</Text>
          <Text style={styles.code}>{step.inviteCode}</Text>
          <Btn label="CONTINUE" onPress={onDone} />
        </>
      )}
      {step.id === "join" && (
        <>
          <Text style={styles.title}>ENTER YOUR CODE</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
          />
          <Btn label="JOIN" onPress={onJoin} disabled={busy} />
        </>
      )}
      {note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

/** Structured ConvexError payloads carry a friendly `message`; show it. */
function errMessage(e: unknown): string {
  if (e instanceof ConvexError && typeof e.data === "object" && e.data !== null) {
    const d = e.data as { message?: string };
    if (d.message) return d.message;
  }
  return "Something went wrong — try again.";
}

function Btn({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, (disabled || pressed) && styles.pressed]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PALETTE.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  title: {
    color: PALETTE.accent,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: "center",
  },
  code: {
    color: PALETTE.text,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: PALETTE.panelBorder,
    borderRadius: 10,
    color: PALETTE.text,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 240,
    fontSize: 15,
  },
  btn: {
    backgroundColor: PALETTE.accent,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 220,
    alignItems: "center",
  },
  pressed: { opacity: 0.6 },
  btnText: { color: "#11131a", fontSize: 15, fontWeight: "800" },
  note: { color: PALETTE.accent, fontSize: 13, textAlign: "center", maxWidth: 280 },
});
