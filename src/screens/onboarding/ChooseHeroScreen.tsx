// =============================================================================
// Beat 1 — Choose your hero (STR-46; onboarding spec §Flow Beat 1; comp HERO
// beat). One screen: live job-1 idle on stage, all 8 classes as tappable
// portraits (data-driven from the CLASSES registry — a 9th class appears
// automatically), one flavor line each, and the name field on the SAME screen
// (pre-filled; editing optional — forced naming is friction, per spec). No
// stats UI: class is flavor, steps are the only power. CTA: "THIS IS ME".
//
// Pixel-kit skin (STR-88): battlefield background (OnboardingBackground) + the
// baked bitmap font (PixelText) + kit Portrait tiles + a gold Button, replacing
// the old flat-dark / system-font placeholder. The class-select / name / submit
// LOGIC is unchanged — only the presentation is re-skinned.
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
  useWindowDimensions,
  type ImageStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import { CLASS_KEYS, CLASSES, type ClassKey } from "../../../convex/gameConfig";
import {
  ART_SCALE_BREAKPOINT_DP,
  classAccent,
  portraitSpriteFor,
} from "../../config/assets";
import { Button, PixelText, Portrait, UIScaleProvider } from "../../ui";
import { UI_PALETTE } from "../../ui/theme";
import { PixelCrisp } from "../../../modules/pixel-crisp";
import { OnboardingBackground } from "./OnboardingBackground";
import type { Viewer } from "./OnboardingFlow";

/** Hero names cap (mirrors users.setHeroIdentity's validated bound). */
const NAME_MAX = 20;

/** Idle frame timing: 4 frames at ~5fps, matching the preview pages'
 *  (state.tick >> 1) % 4 cadence over a 100ms tick. */
const IDLE_FRAME_MS = 200;

// -----------------------------------------------------------------------------
// Job-1 idle frames, statically required (React Native bundles images via
// static require(), so the paths can't be built at runtime). Hand-written for
// the 8 launch classes; drives the live stage. Partial so a 9th registry class
// still renders (accent monogram fallback below) before its art lands.
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

/** Per-class flavor lines (comp HERO beat / spec Beat 1 drafts). Partial +
 *  fallback so a 9th class ships a line for free until its own is written. */
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

/** Crisp pixels on web (RN-web passes unknown style props to CSS). */
const PIXELATED: ImageStyle | null =
  Platform.OS === "web"
    ? ({ imageRendering: "pixelated" } as unknown as ImageStyle)
    : null;

const STAGE_DP = 168; // the live idle stage (dp; the sprite upscales into it)

export function ChooseHeroScreen({ viewer }: { viewer: Viewer }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const artScale = width < ART_SCALE_BREAKPOINT_DP ? 2 : 3;
  const setHeroIdentity = useMutation(api.users.setHeroIdentity);

  const [selected, setSelected] = useState<ClassKey>(CLASS_KEYS[0]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Name pre-fill: track the server default ("Hero-XXXX") until the player types.
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
  const disabled = busy || !nameOk;

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

  const headScale = artScale + 1;
  const classScale = Math.round(artScale * 2.4);
  const tile = 30 * artScale; // Portrait size 30 → the grid tile art footprint

  return (
    <OnboardingBackground topDim={0.5}>
      <UIScaleProvider value={artScale}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <PixelText text="WALKPG" color={UI_PALETTE.silver_dark} scale={artScale} />
          <PixelText
            text="CHOOSE YOUR HERO"
            color={UI_PALETTE.gold_light}
            scale={headScale}
            style={{ marginTop: 5 * artScale }}
          />

          {/* Stage — the selected class's job-1 idle, live (all 4 frames stay
              mounted, opacity-swapped, so web never flickers on frame change). */}
          {/* PixelCrisp → nearest-neighbor on iOS so the hero preview stays crisp
              pixel art when upscaled (matches the battle-scene sprites); a plain
              View elsewhere, where PIXELATED handles web crispness. */}
          <PixelCrisp style={[styles.stage, { marginTop: 4 * artScale }]}>
            {frames ? (
              frames.map((src, i) => (
                <Image
                  key={i}
                  source={src}
                  style={[styles.stageSprite, PIXELATED, { opacity: i === frame ? 1 : 0 }]}
                  fadeDuration={0}
                />
              ))
            ) : (
              <PixelText text={cls.displayName[0]} color={accent} scale={artScale * 8} />
            )}
          </PixelCrisp>

          <PixelText
            text={cls.displayName}
            color={UI_PALETTE.gold_light}
            scale={classScale}
          />
          <PixelText
            text={FLAVOR[selected] ?? FLAVOR_FALLBACK}
            color={UI_PALETTE.sky_mid}
            scale={artScale}
            style={{ marginTop: 3 * artScale }}
          />

          {/* 8 portraits, 2 rows of 4 — driven by the registry. */}
          <View style={[styles.grid, { maxWidth: (30 + 6) * artScale * 4, marginTop: 8 * artScale }]}>
            {CLASS_KEYS.map((k) => {
              const isSel = k === selected;
              const sp = portraitSpriteFor(k, 1);
              return (
                <Pressable key={k} onPress={() => setSelected(k)} style={{ margin: 3 * artScale }}>
                  <View style={{ width: tile, height: tile }}>
                    <Portrait
                      size={30}
                      source={sp.src}
                      sourceSize={sp.size}
                      cropKey={k}
                      scale={artScale}
                    />
                    {isSel && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: "absolute",
                          left: -2 * artScale,
                          top: -2 * artScale,
                          right: -2 * artScale,
                          bottom: -2 * artScale,
                          borderWidth: 2 * artScale,
                          borderColor: UI_PALETTE.gold_mid,
                          borderRadius: 6 * artScale,
                        }}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Name — same screen, pre-filled, editing optional (spec Beat 1). The
              editable field can't be the bitmap font, so it's a monospace well
              framed to sit with the pixel chrome; label + hint stay PixelText. */}
          <View style={[styles.nameBlock, { marginTop: 14 * artScale }]}>
            <PixelText text="YOUR NAME" color={UI_PALETTE.sky_mid} scale={artScale} />
            <View style={styles.nameWell}>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={(t) => {
                  dirty.current = true;
                  setName(t);
                }}
                maxLength={NAME_MAX}
                placeholder="YOUR HERO'S NAME"
                placeholderTextColor={UI_PALETTE.sky_dark}
                selectionColor={UI_PALETTE.gold_mid}
              />
            </View>
            <PixelText text="PRE-PICKED - EDIT ANY TIME" color={UI_PALETTE.sky_dark} scale={artScale} />
          </View>

          <View style={{ marginTop: 12 * artScale, opacity: disabled ? 0.5 : 1 }}>
            <Button
              material="gold"
              label="THIS IS ME"
              labelScale={2}
              width={120}
              scale={artScale}
              disabled={disabled}
              onPress={onConfirm}
            />
          </View>

          {note && <Text style={styles.note}>{note}</Text>}
          <PixelText
            text="CLASS IS FLAVOR - YOUR STEPS ARE THE POWER."
            color={UI_PALETTE.sky_dark}
            scale={artScale}
            style={{ marginTop: 14 * artScale }}
          />
        </ScrollView>
      </UIScaleProvider>
    </OnboardingBackground>
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

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 4,
  },
  stage: {
    width: STAGE_DP,
    height: STAGE_DP,
    alignItems: "center",
    justifyContent: "center",
  },
  stageSprite: { position: "absolute", width: STAGE_DP, height: STAGE_DP },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },
  nameBlock: { width: 280, gap: 8, alignItems: "flex-start" },
  nameWell: {
    width: 280,
    height: 44,
    backgroundColor: "#0c0e14",
    borderWidth: 1.5,
    borderColor: UI_PALETTE.silver_dark,
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  nameInput: {
    color: UI_PALETTE.white,
    fontSize: 15,
    letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    padding: 0,
  },
  note: {
    color: "#ff9a78",
    fontSize: 13,
    textAlign: "center",
    maxWidth: 280,
    marginTop: 8,
  },
});

export default ChooseHeroScreen;
