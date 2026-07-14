// =============================================================================
// Beat 1 — Choose your hero (SCAFFOLD — STR-45).
// =============================================================================
// Routing-only placeholder so the STR-45 state machine is walkable end-to-end:
// registry-driven class list + the real setHeroIdentity call. STR-46 replaces
// the internals with the comp's layout (live job-1 idle stage, 8 portraits,
// flavor lines, name field, gold "THIS IS ME").
// =============================================================================
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CLASS_KEYS, CLASSES, type ClassKey } from "../../../convex/gameConfig";
import { PALETTE } from "../../config/assets";
import type { Viewer } from "./OnboardingFlow";

export function ChooseHeroScreen({ viewer: _viewer }: { viewer: Viewer }) {
  const setHeroIdentity = useMutation(api.users.setHeroIdentity);
  const [busy, setBusy] = useState(false);

  async function pick(cls: ClassKey) {
    setBusy(true);
    try {
      await setHeroIdentity({ class: cls });
      // viewer.class flips reactively; OnboardingFlow routes to Beat 2.
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>CHOOSE YOUR HERO</Text>
      {CLASS_KEYS.map((k) => (
        <Pressable
          key={k}
          disabled={busy}
          onPress={() => pick(k)}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        >
          <Text style={styles.btnText}>{CLASSES[k].displayName}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PALETTE.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
  title: {
    color: PALETTE.accent,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 10,
  },
  btn: {
    borderWidth: 1,
    borderColor: PALETTE.panelBorder,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    minWidth: 200,
    alignItems: "center",
  },
  pressed: { opacity: 0.6 },
  btnText: { color: PALETTE.text, fontSize: 15, fontWeight: "700" },
});
