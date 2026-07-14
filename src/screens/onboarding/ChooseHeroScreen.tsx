// =============================================================================
// Beat 1 — Choose your hero (STR-46; onboarding spec §Flow Beat 1; comp HERO
// beat). One screen: live job-1 idle on stage, all 8 classes as tappable
// portraits (data-driven from the CLASSES registry — a 9th class appears
// automatically), one flavor line each, and the name field on the SAME screen
// (pre-filled; editing optional — forced naming is friction, per spec). No
// stats UI: class is flavor, steps are the only power. CTA: "THIS IS ME".
// =============================================================================
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageStyle,
} from "react-native";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import { CLASS_KEYS, CLASSES, type ClassKey } from "../../../convex/gameConfig";
import { PALETTE, SIZES, classAccent } from "../../config/assets";
import type { Viewer } from "./OnboardingFlow";

/** Hero names cap (mirrors users.setHeroIdentity's validated bound). */
const NAME_MAX = 20;

/** Idle frame timing: 4 frames at ~5fps, matching the preview pages'
 *  (state.tick >> 1) % 4 cadence over a 100ms tick. */
const IDLE_FRAME_MS = 200;

// -----------------------------------------------------------------------------
// Job-1 idle frames, statically required (React Native bundles images via
// static require(), so the paths can't be built at runtime). Hand-written for
// the 8 launch classes; M2's GENERATED spriteMap (fx-rn-port-plan) replaces
// this map wholesale. Partial so a 9th registry class still renders (accent
// monogram fallback below) before its art lands.
// -----------------------------------------------------------------------------
const IDLE_FRAMES: Partial<Record<ClassKey, number[]>> = {
  warrior: [
    require("../../../characters/warrior/1_rookie/animations/idle/frame_000.png"),
    require("../../../characters/warrior/1_rookie/animations/idle/frame_001.png"),
    require("../../../characters/warrior/1_rookie/animations/idle/frame_002.png"),
    require("../../../characters/warrior/1_rookie/animations/idle/frame_003.png"),
  ],
  mage: [
    require("../../../characters/mage/1_apprentice/animations/idle/frame_000.png"),
    require("../../../characters/mage/1_apprentice/animations/idle/frame_001.png"),
    require("../../../characters/mage/1_apprentice/animations/idle/frame_002.png"),
    require("../../../characters/mage/1_apprentice/animations/idle/frame_003.png"),
  ],
  medic: [
    require("../../../characters/medic/1_acolyte/animations/idle/frame_000.png"),
    require("../../../characters/medic/1_acolyte/animations/idle/frame_001.png"),
    require("../../../characters/medic/1_acolyte/animations/idle/frame_002.png"),
    require("../../../characters/medic/1_acolyte/animations/idle/frame_003.png"),
  ],
  archer: [
    require("../../../characters/archer/1_greenhorn/animations/idle/frame_000.png"),
    require("../../../characters/archer/1_greenhorn/animations/idle/frame_001.png"),
    require("../../../characters/archer/1_greenhorn/animations/idle/frame_002.png"),
    require("../../../characters/archer/1_greenhorn/animations/idle/frame_003.png"),
  ],
  assassin: [
    require("../../../characters/assassin/1_footpad/animations/idle/frame_000.png"),
    require("../../../characters/assassin/1_footpad/animations/idle/frame_001.png"),
    require("../../../characters/assassin/1_footpad/animations/idle/frame_002.png"),
    require("../../../characters/assassin/1_footpad/animations/idle/frame_003.png"),
  ],
  paladin: [
    require("../../../characters/paladin/1_squire/animations/idle/frame_000.png"),
    require("../../../characters/paladin/1_squire/animations/idle/frame_001.png"),
    require("../../../characters/paladin/1_squire/animations/idle/frame_002.png"),
    require("../../../characters/paladin/1_squire/animations/idle/frame_003.png"),
  ],
  warlock: [
    require("../../../characters/warlock/1_initiate/animations/idle/frame_000.png"),
    require("../../../characters/warlock/1_initiate/animations/idle/frame_001.png"),
    require("../../../characters/warlock/1_initiate/animations/idle/frame_002.png"),
    require("../../../characters/warlock/1_initiate/animations/idle/frame_003.png"),
  ],
  bard: [
    require("../../../characters/bard/1_busker/animations/idle/frame_000.png"),
    require("../../../characters/bard/1_busker/animations/idle/frame_001.png"),
    require("../../../characters/bard/1_busker/animations/idle/frame_002.png"),
    require("../../../characters/bard/1_busker/animations/idle/frame_003.png"),
  ],
};

/** Per-class flavor lines (comp HERO beat / spec Beat 1 drafts — Neel's copy
 *  pass refines these). Partial + fallback so a 9th class ships a line for
 *  free until its own is written. */
const FLAVOR: Partial<Record<ClassKey, string>> = {
  warrior: "Front of the line, every time.",
  mage: "Turns a long walk into a longer spell.",
  medic: "Keeps the whole crew standing.",
  archer: "Never misses a step.",
  assassin: "Quiet feet. Loud numbers.",
  paladin: "Walks in the light. Hits like a sunrise.",
  warlock: "Made a deal. It involves cardio.",
  bard: "Every journey needs a soundtrack.",
};
const FLAVOR_FALLBACK = "A new hero approaches.";

/** Crisp pixels on web: react-native-web passes unknown style props through to
 *  CSS, but RN's ImageStyle type doesn't know `imageRendering` — hence the
 *  cast. No-op on native (nearest-neighbor is fine for the placeholder). */
const PIXELATED: ImageStyle | null =
  Platform.OS === "web"
    ? ({ imageRendering: "pixelated" } as unknown as ImageStyle)
    : null;

export function ChooseHeroScreen({ viewer }: { viewer: Viewer }) {
  const setHeroIdentity = useMutation(api.users.setHeroIdentity);

  const [selected, setSelected] = useState<ClassKey>(CLASS_KEYS[0]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Name pre-fill: track the server default (ensureSession lands "Hero-XXXX"
  // just after mount) until the player actually types — then it's theirs.
  const [name, setName] = useState(viewer.displayName);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setName(viewer.displayName);
  }, [viewer.displayName]);

  // The live idle stage: cycle the 4 frames on a small interval.
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % 4), IDLE_FRAME_MS);
    return () => clearInterval(t);
  }, []);

  const cls = CLASSES[selected];
  const accent = classAccent(selected);
  const frames = IDLE_FRAMES[selected];
  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= NAME_MAX;

  async function onConfirm() {
    if (!nameOk || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await setHeroIdentity({ class: selected, displayName: trimmed });
      // viewer.class flips reactively; OnboardingFlow routes to Beat 2.
    } catch (e) {
      setNote(errMessage(e));
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.wordmark}>STRIDE QUEST</Text>
      <Text style={styles.heading}>CHOOSE YOUR HERO</Text>

      {/* Stage — the selected class's job-1 idle, live. All 4 frames stay
          mounted (opacity-swapped) so web never flickers on frame change. */}
      <View style={styles.stage}>
        {frames ? (
          frames.map((src, i) => (
            <Image
              key={i}
              source={src}
              style={[
                styles.stageSprite,
                PIXELATED,
                { opacity: i === frame ? 1 : 0 },
              ]}
              fadeDuration={0}
            />
          ))
        ) : (
          // A registry class whose art hasn't landed yet: accent monogram.
          <Text style={[styles.monogram, { color: accent }]}>
            {cls.displayName[0]}
          </Text>
        )}
      </View>
      <Text style={[styles.className, { color: accent }]}>
        {cls.displayName.toUpperCase()}
      </Text>
      <Text style={styles.flavor}>{FLAVOR[selected] ?? FLAVOR_FALLBACK}</Text>

      {/* 8 portraits, 2 rows of 4 (comp layout) — driven by the registry. */}
      <View style={styles.grid}>
        {CLASS_KEYS.map((k) => {
          const isSel = k === selected;
          const thumb = IDLE_FRAMES[k]?.[0];
          return (
            <Pressable
              key={k}
              onPress={() => setSelected(k)}
              style={[
                styles.portrait,
                { borderColor: isSel ? PALETTE.accent : PALETTE.panelBorder },
                isSel && styles.portraitSelected,
              ]}
            >
              {thumb ? (
                <Image
                  source={thumb}
                  style={[styles.portraitSprite, PIXELATED]}
                  fadeDuration={0}
                />
              ) : (
                <Text style={[styles.portraitMonogram, { color: classAccent(k) }]}>
                  {CLASSES[k].displayName[0]}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Name — same screen, pre-filled, editing optional (spec Beat 1). */}
      <View style={styles.nameBlock}>
        <Text style={styles.nameLabel}>YOUR NAME</Text>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={(t) => {
            dirty.current = true;
            setName(t);
          }}
          maxLength={NAME_MAX}
          placeholder="Your hero's name"
          placeholderTextColor={PALETTE.textDim}
        />
        <Text style={styles.nameHint}>Pre-picked — edit any time.</Text>
      </View>

      <Pressable
        onPress={onConfirm}
        disabled={busy || !nameOk}
        style={({ pressed }) => [
          styles.cta,
          (busy || !nameOk || pressed) && styles.ctaPressed,
        ]}
      >
        <Text style={styles.ctaText}>THIS IS ME</Text>
      </Pressable>

      {note && <Text style={styles.note}>{note}</Text>}
      <Text style={styles.footer}>
        Class is flavor — your steps are the power.
      </Text>
    </ScrollView>
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

const STAGE_SIZE = 248;
const PORTRAIT_SIZE = 64;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.bg },
  content: {
    alignItems: "center",
    padding: SIZES.screenPad,
    paddingTop: 54,
    paddingBottom: 40,
    gap: 6,
  },
  wordmark: {
    color: PALETTE.textDim,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 3,
  },
  heading: {
    color: PALETTE.accent,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 2,
  },
  stage: {
    width: STAGE_SIZE,
    height: STAGE_SIZE,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stageSprite: {
    position: "absolute",
    width: STAGE_SIZE,
    height: STAGE_SIZE,
  },
  monogram: { fontSize: 96, fontWeight: "900" },
  className: { fontSize: 24, fontWeight: "900", letterSpacing: 3 },
  flavor: {
    color: PALETTE.text,
    fontSize: 14,
    textAlign: "center",
    maxWidth: 300,
    minHeight: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    maxWidth: 4 * (PORTRAIT_SIZE + 10) + 10,
    marginTop: 12,
  },
  portrait: {
    width: PORTRAIT_SIZE,
    height: PORTRAIT_SIZE,
    borderWidth: 2,
    borderRadius: 10,
    backgroundColor: "#0c0e14",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  portraitSelected: { transform: [{ scale: 1.06 }] },
  portraitSprite: { width: PORTRAIT_SIZE + 14, height: PORTRAIT_SIZE + 14 },
  portraitMonogram: { fontSize: 28, fontWeight: "900" },
  nameBlock: { width: 280, marginTop: 16, gap: 6 },
  nameLabel: {
    color: PALETTE.textDim,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: PALETTE.panelBorder,
    backgroundColor: "#0c0e14",
    borderRadius: 10,
    color: PALETTE.text,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  nameHint: { color: PALETTE.textDim, fontSize: 11 },
  cta: {
    backgroundColor: PALETTE.accent,
    borderRadius: 12,
    paddingVertical: 14,
    width: 280,
    alignItems: "center",
    marginTop: 14,
  },
  ctaPressed: { opacity: 0.55 },
  ctaText: {
    color: "#11131a",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 2,
  },
  note: {
    color: PALETTE.accent,
    fontSize: 13,
    textAlign: "center",
    maxWidth: 280,
    marginTop: 6,
  },
  footer: {
    color: PALETTE.textDim,
    fontSize: 12,
    textAlign: "center",
    marginTop: 14,
  },
});
