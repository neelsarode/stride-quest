// =============================================================================
// Beat 2 — Your guild (STR-47; onboarding spec §Flow Beat 2; comp beats
// GUILD / CREATE / CODE / JOIN / CONFIRM + the three error states).
// =============================================================================
// The fork: found a guild, or join with a friend's code.
//  - Founder: name pre-filled "{Hero}'s Guild" → ONE atomic createGuild →
//    code reveal (huge, native Share, skippable — inviting is never a gate).
//  - Joiner: six-box entry (normalized as you type) → previewInviteCode
//    CONFIRM CARD before any join ("no surprise guilds") → joinGuildByCode.
//    Structured ConvexError codes map to the comp's warm inline states —
//    cozy, never punitive, no red UI (binding guardrail).
//
// Pixel-kit skin (STR-88): battlefield background (OnboardingBackground) + the
// baked bitmap font (PixelText) + kit Button / Portrait + pixel code boxes,
// replacing the old flat-dark / system-font placeholder. The state machine,
// mutations, preview, and warm error routing are UNCHANGED — only the skin.
// NOTE: the bitmap font has no apostrophe, so fixed copy drops it (arcade
// style); user-supplied guild names render in a mono <Text> (any character).
// =============================================================================
import { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import { GUILD } from "../../../convex/gameConfig";
import { portraitSpriteFor } from "../../config/assets";
import { useFeedback } from "../../feedback/FeedbackProvider";
import {
  BakedImage,
  Button,
  PixelText,
  Portrait,
  UIScaleProvider,
} from "../../ui";
import { UI_PALETTE } from "../../ui/theme";
import { OnboardingBackground, useOnbLayout } from "./OnboardingBackground";
import type { Viewer } from "./OnboardingFlow";

/** Mirrors guild.createGuild's validated bound. */
const GUILD_NAME_MAX = 30;
const WARM = "#ffe08a"; // warm amber for the "never red" error states (guardrail)

/** Client-side mirror of convex/inviteCode.normalizeInviteCode (+ length cap
 *  for the six boxes): uppercase, drop the separators people type. */
function normalizeAsTyped(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .slice(0, GUILD.inviteCodeLength);
}

/** The share payload for both the code-reveal screen and the guild board. */
export function inviteShareMessage(code: string): string {
  return `Join my guild on WalkPG! Enter invite code ${code} — every step we walk hits the same boss.`;
}

/** Native share with a web-desktop fallback (copy to clipboard). */
export async function shareInviteCode(code: string): Promise<string | null> {
  try {
    await Share.share({ message: inviteShareMessage(code) });
    return null;
  } catch {
    try {
      if (
        Platform.OS === "web" &&
        typeof navigator !== "undefined" &&
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(inviteShareMessage(code));
        return "COPIED - PASTE IT TO YOUR CREW.";
      }
    } catch {
      // fall through to the calm no-share note
    }
    return "SHARING ISNT AVAILABLE HERE - YOUR CODE LIVES ON THE GUILD BOARD.";
  }
}

// Crew huddle on the fork — three job-1 heroes sell "guild" better than an
// emblem (mage / warrior / medic; the warrior in the middle wears the ring).
const HUDDLE: readonly string[] = ["mage", "warrior", "medic"];

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
  const { artScale } = useOnbLayout();
  const [step, setStep] = useState<Step>({ id: "fork" });

  switch (step.id) {
    case "fork":
      return (
        <Frame>
          <View style={[styles.huddle, { marginBottom: 6 * artScale }]}>
            {HUDDLE.map((k, i) => {
              const sp = portraitSpriteFor(k, 1);
              return (
                <View key={k} style={{ width: 30 * artScale, height: 30 * artScale }}>
                  <Portrait size={30} source={sp.src} sourceSize={sp.size} cropKey={k} scale={artScale} />
                  {i === 1 && (
                    <View pointerEvents="none" style={ring(artScale)} />
                  )}
                </View>
              );
            })}
          </View>
          <PixelText text="NO HERO FIGHTS" color={UI_PALETTE.gold_light} scale={artScale * 2} />
          <PixelText text="ALONE." color={UI_PALETTE.gold_light} scale={artScale * 2} style={{ marginTop: 2 * artScale }} />
          <PixelP
            lines={["EVERY STEP YOUR CREW WALKS", "HITS THE SAME BOSS.", "WIN SUNDAYS TOGETHER."]}
            color={UI_PALETTE.sky_mid}
            scale={artScale}
            style={{ marginTop: 6 * artScale }}
          />
          <View style={{ marginTop: 12 * artScale, alignItems: "center", gap: 6 * artScale }}>
            <Btn gold big label="START A GUILD" onPress={() => setStep({ id: "create" })} artScale={artScale} />
            <PixelText text="MINT A CODE TO SHARE" color={UI_PALETTE.sky_dark} scale={artScale} />
            <Btn label="I HAVE A CODE" onPress={() => setStep({ id: "join" })} artScale={artScale} />
            <PixelText text="A FRIEND ALREADY SENT YOU ONE" color={UI_PALETTE.sky_dark} scale={artScale} />
          </View>
          <PixelText
            text={`A GUILD HOLDS UP TO ${GUILD.maxMembers} HEROES.`}
            color={UI_PALETTE.sky_dark}
            scale={artScale}
            style={{ marginTop: 16 * artScale }}
          />
        </Frame>
      );
    case "create":
      return (
        <CreateGuildStep
          viewer={viewer}
          onBack={() => setStep({ id: "fork" })}
          onCreated={(guildName, inviteCode) => setStep({ id: "reveal", guildName, inviteCode })}
        />
      );
    case "reveal":
      return (
        <CodeRevealStep guildName={step.guildName} inviteCode={step.inviteCode} onDone={onDone} />
      );
    case "join":
      return <JoinGuildStep onStartInstead={() => setStep({ id: "create" })} onDone={onDone} />;
  }
}

// --- Beat 2a, step 1: start a guild ------------------------------------------

function CreateGuildStep({
  viewer,
  onBack,
  onCreated,
}: {
  viewer: Viewer;
  onBack: () => void;
  onCreated: (guildName: string, inviteCode: string) => void;
}) {
  const { artScale } = useOnbLayout();
  const createGuild = useMutation(api.guild.createGuild);
  const [name, setName] = useState(`${viewer.displayName}'s Guild`);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= GUILD_NAME_MAX;

  async function onCreate() {
    if (!nameOk || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await createGuild({
        name: trimmed,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      onCreated(trimmed, r.inviteCode);
    } catch (e) {
      setNote(errMessage(e));
      setBusy(false);
    }
  }

  return (
    <Frame>
      <PixelText text="START A GUILD" color={UI_PALETTE.gold_light} scale={artScale * 2} />
      <View style={[styles.panel, { marginTop: 12 * artScale }]}>
        <PixelText text="GUILD NAME" color={UI_PALETTE.sky_mid} scale={artScale} />
        <View style={[styles.well, { marginTop: 6 }]}>
          <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={GUILD_NAME_MAX} selectionColor={UI_PALETTE.gold_mid} />
        </View>
        <PixelText text="RENAME IT ANY TIME." color={UI_PALETTE.sky_dark} scale={artScale} style={{ marginTop: 6 }} />
        <View style={styles.divider} />
        <PixelText text="FOUNDING A GUILD MINTS:" color={UI_PALETTE.white} scale={artScale} />
        <MintRow icon="icon_banner" text="YOUR INVITE CODE" artScale={artScale} />
        <MintRow icon="icon_swords" text="THE WEEKLY BOSS" artScale={artScale} />
        <MintRow icon="icon_gem" text="A 24H STARTER TANK" artScale={artScale} />
        <PixelText text="FRIENDS JOIN ANY TIME." color={UI_PALETTE.sky_mid} scale={artScale} style={{ marginTop: 4 }} />
      </View>
      <View style={{ marginTop: 14 * artScale, opacity: busy || !nameOk ? 0.5 : 1 }}>
        <Btn gold big label="CREATE GUILD" onPress={onCreate} disabled={busy || !nameOk} artScale={artScale} />
      </View>
      <Link label="BACK" onPress={onBack} artScale={artScale} />
      {note && <Text style={styles.note}>{note}</Text>}
    </Frame>
  );
}

function MintRow({ icon, text, artScale }: { icon: "icon_banner" | "icon_swords" | "icon_gem"; text: string; artScale: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
      <BakedImage name={icon} scale={artScale} />
      <PixelText text={text} color={UI_PALETTE.white} scale={artScale} />
    </View>
  );
}

// --- Beat 2a, step 2: the code reveal -----------------------------------------

function CodeRevealStep({
  guildName,
  inviteCode,
  onDone,
}: {
  guildName: string;
  inviteCode: string;
  onDone: () => void;
}) {
  const { artScale } = useOnbLayout();
  const [note, setNote] = useState<string | null>(null);
  return (
    <Frame>
      <PixelText text="GUILD CREATED!" color={UI_PALETTE.gold_light} scale={artScale * 2} />
      <Text style={styles.guildName}>{guildName}</Text>
      <PixelText text="YOUR INVITE CODE" color={UI_PALETTE.sky_mid} scale={artScale} style={{ marginTop: 8 * artScale }} />
      <CodeBoxes chars={inviteCode} minted artScale={artScale} />
      <PixelP
        lines={["SEND IT TO YOUR CREW.", "THEY FIGHT BESIDE YOU ALL WEEK."]}
        color={UI_PALETTE.sky_mid}
        scale={artScale}
        style={{ marginTop: 10 * artScale }}
      />
      <View style={{ marginTop: 14 * artScale, alignItems: "center", gap: 6 * artScale }}>
        <Btn gold big label="SHARE CODE" onPress={async () => setNote(await shareInviteCode(inviteCode))} artScale={artScale} />
        <Btn label="SKIP FOR NOW" onPress={onDone} artScale={artScale} />
      </View>
      {note && <PixelText text={note} color={UI_PALETTE.sky_mid} scale={artScale} style={{ marginTop: 8 * artScale }} />}
      <PixelText text="IT ALSO LIVES ON YOUR GUILD BOARD." color={UI_PALETTE.sky_dark} scale={artScale} style={{ marginTop: 16 * artScale }} />
    </Frame>
  );
}

// --- Beat 2b: join by code ----------------------------------------------------

type JoinError =
  | { kind: "not_found" }
  | { kind: "full"; guildName: string }
  | { kind: "message"; message: string };

function JoinGuildStep({
  onStartInstead,
  onDone,
}: {
  onStartInstead: () => void;
  onDone: () => void;
}) {
  const { artScale } = useOnbLayout();
  const joinGuildByCode = useMutation(api.guild.joinGuildByCode);
  const { emit } = useFeedback();
  const [code, setCode] = useState("");
  const [checkCode, setCheckCode] = useState<string | null>(null);
  const [err, setErr] = useState<JoinError | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const preview = useQuery(
    api.guild.previewInviteCode,
    checkCode !== null ? { code: checkCode } : "skip",
  );

  const complete = code.length === GUILD.inviteCodeLength;

  function editCode(next: string) {
    setCode(normalizeAsTyped(next));
    setCheckCode(null);
    setErr(null);
  }

  async function onJoin() {
    if (busy) return;
    setBusy(true);
    try {
      await joinGuildByCode({ code });
      if (preview != null) {
        emit({
          type: "guildJoined",
          guildName: preview.guildName,
          memberCount: preview.memberCount + 1,
        });
      }
      onDone();
    } catch (e) {
      if (e instanceof ConvexError && typeof e.data === "object" && e.data) {
        const d = e.data as { code?: string; message?: string };
        if (d.code === "already_member") {
          onDone();
          return;
        }
        if (d.code === "not_found") setErr({ kind: "not_found" });
        else if (d.code === "full")
          setErr({ kind: "full", guildName: preview?.guildName ?? "That guild" });
        else setErr({ kind: "message", message: d.message ?? "Try again." });
      } else {
        setErr({ kind: "message", message: "Something went wrong — try again." });
      }
      setCheckCode(null);
      setBusy(false);
    }
  }

  const showNotFound =
    err?.kind === "not_found" || (checkCode !== null && preview === null);
  const showFull =
    err?.kind === "full" ||
    (checkCode !== null && preview != null && preview.isFull);
  const fullName =
    err?.kind === "full" ? err.guildName : (preview?.guildName ?? "That guild");
  const showConfirm =
    !showNotFound && !showFull && checkCode !== null && preview != null;

  return (
    <Frame>
      <PixelText text="ENTER YOUR CODE" color={UI_PALETTE.gold_light} scale={artScale * 2} />
      <PixelText text={`${GUILD.inviteCodeLength} LETTERS FROM YOUR FRIEND`} color={UI_PALETTE.sky_mid} scale={artScale} style={{ marginTop: 6 * artScale }} />

      {/* Six boxes + a hidden input that actually holds the value. */}
      <Pressable onPress={() => inputRef.current?.focus()}>
        <CodeBoxes chars={code} caretAt={code.length} artScale={artScale} />
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={editCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
        />
      </Pressable>
      <PixelText text="TYPE ANY CASE - WE UPPERCASE IT." color={UI_PALETTE.sky_dark} scale={artScale} style={{ marginTop: 8 * artScale }} />

      {showNotFound && (
        <View style={styles.inlineBlock}>
          <PixelText text="HMM - NO GUILD WEARS THAT CODE." color={WARM} scale={artScale} />
          <PixelText text="CHECK IT WITH YOUR FRIEND AND RETRY." color={UI_PALETTE.sky_mid} scale={artScale} />
          <Link label="OR START A GUILD INSTEAD" onPress={onStartInstead} artScale={artScale} />
        </View>
      )}

      {showFull && (
        <View style={styles.inlineBlock}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            <Text style={styles.guildNameSmall}>{fullName}</Text>
            <PixelText text={`  IS FULL - ${GUILD.maxMembers} STRONG.`} color={WARM} scale={artScale} />
          </View>
          <PixelText text="YOUR CODE WAS RIGHT. NO SEATS LEFT." color={UI_PALETTE.sky_mid} scale={artScale} />
          <Btn gold big label="START MY OWN GUILD" onPress={onStartInstead} artScale={artScale} />
          <Link
            label="TRY ANOTHER CODE"
            onPress={() => {
              setCode("");
              setCheckCode(null);
              setErr(null);
            }}
            artScale={artScale}
          />
        </View>
      )}

      {showConfirm && preview != null && (
        <View style={[styles.panel, styles.confirmCard]}>
          <PixelText text="CODE FOUND!" color={UI_PALETTE.gold_light} scale={artScale} />
          <Text style={styles.guildName}>{preview.guildName}</Text>
          <PixelText
            text={`${preview.memberCount} ${preview.memberCount === 1 ? "HERO FIGHTS" : "HEROES FIGHT"} BESIDE YOU.`}
            color={UI_PALETTE.white}
            scale={artScale}
          />
          <PixelText text={`${preview.memberCount} OF ${preview.maxMembers} SPOTS FILLED`} color={UI_PALETTE.sky_dark} scale={artScale} />
          <View style={{ marginTop: 8, opacity: busy ? 0.5 : 1 }}>
            <Btn gold big label="JOIN GUILD" onPress={onJoin} disabled={busy} artScale={artScale} />
          </View>
          <Link label="NOT THIS ONE" onPress={() => setCheckCode(null)} artScale={artScale} />
        </View>
      )}

      {err?.kind === "message" && (
        <Text style={[styles.note, { color: WARM }]}>{err.message}</Text>
      )}

      {!showConfirm && !showFull && (
        <View style={{ alignItems: "center", marginTop: 12 * artScale, gap: 6 * artScale }}>
          {complete ? (
            <View style={{ opacity: checkCode !== null && preview === undefined ? 0.5 : 1 }}>
              <Btn gold big label="CHECK CODE" onPress={() => setCheckCode(code)} disabled={checkCode !== null && preview === undefined} artScale={artScale} />
            </View>
          ) : (
            <>
              <View style={{ opacity: 0.45 }}>
                <Btn gold big label="CHECK CODE" onPress={() => {}} disabled artScale={artScale} />
              </View>
              <PixelText text={`ENTER ALL ${GUILD.inviteCodeLength} CHARACTERS FIRST`} color={UI_PALETTE.sky_dark} scale={artScale} />
            </>
          )}
          {!showNotFound && (
            <Link label="NO CODE? START A GUILD" onPress={onStartInstead} artScale={artScale} />
          )}
        </View>
      )}
    </Frame>
  );
}

// --- shared pieces ------------------------------------------------------------

/** Six-box code row: minted gold faces on the reveal, recessed entry wells
 *  (with a gold caret slot) while typing. Chars are the bitmap font. */
function CodeBoxes({
  chars,
  minted,
  caretAt,
  artScale,
}: {
  chars: string;
  minted?: boolean;
  caretAt?: number;
  artScale: number;
}) {
  const s = artScale;
  return (
    <View style={[styles.codeRow, { marginTop: 8 * s }]}>
      {Array.from({ length: GUILD.inviteCodeLength }, (_, i) => {
        const ch = chars[i];
        const active = !minted && caretAt === i;
        return (
          <View
            key={i}
            style={[
              styles.codeBox,
              { width: 20 * s, height: 26 * s, borderRadius: 4 * s, borderWidth: 2 },
              minted && styles.codeBoxMinted,
              active && { borderColor: UI_PALETTE.gold_mid },
            ]}
          >
            {ch ? (
              <PixelText text={ch} color={minted ? "#2a1e08" : UI_PALETTE.white} scale={s * 2} />
            ) : active ? (
              <View style={{ width: 2 * s, height: 12 * s, backgroundColor: UI_PALETTE.gold_mid }} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { artScale, insets } = useOnbLayout();
  return (
    <OnboardingBackground topDim={0.55}>
      <UIScaleProvider value={artScale}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <PixelText text="WALKPG" color={UI_PALETTE.silver_dark} scale={artScale} style={{ marginBottom: 10 * artScale }} />
          {children}
        </ScrollView>
      </UIScaleProvider>
    </OnboardingBackground>
  );
}

/** Stacked, centred bitmap-font lines (PixelText doesn't wrap). */
function PixelP({
  lines,
  color,
  scale,
  style,
}: {
  lines: string[];
  color: string;
  scale: number;
  style?: object;
}) {
  return (
    <View style={[{ alignItems: "center", gap: Math.round(scale * 1.5) }, style]}>
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

function Link({ label, onPress, artScale }: { label: string; onPress: () => void; artScale: number }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 4 * artScale, alignItems: "center" }}>
      <PixelText text={label} color={UI_PALETTE.gold_light} scale={artScale} />
      <View style={{ height: 1, alignSelf: "stretch", backgroundColor: UI_PALETTE.gold_mid, marginTop: 1 }} />
    </Pressable>
  );
}

/** A gold selection ring overlaying a portrait tile (no layout shift). */
function ring(artScale: number) {
  return {
    position: "absolute" as const,
    left: -2 * artScale,
    top: -2 * artScale,
    right: -2 * artScale,
    bottom: -2 * artScale,
    borderWidth: 2 * artScale,
    borderColor: UI_PALETTE.gold_mid,
    borderRadius: 6 * artScale,
  };
}

/** Structured ConvexError payloads carry a friendly `message`; show it. */
function errMessage(e: unknown): string {
  if (e instanceof ConvexError && typeof e.data === "object" && e.data !== null) {
    const d = e.data as { message?: string };
    if (d.message) return d.message;
  }
  return "Something went wrong — try again.";
}

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { alignItems: "center", paddingHorizontal: 20, gap: 4 },
  huddle: { flexDirection: "row", gap: 10, alignItems: "center" },
  panel: {
    width: 300,
    backgroundColor: "#141d30",
    borderColor: UI_PALETTE.silver_dark,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  divider: { height: 1, backgroundColor: "#2b3446", marginVertical: 8, alignSelf: "stretch" },
  well: {
    height: 42,
    backgroundColor: "#0c0e14",
    borderWidth: 1.5,
    borderColor: UI_PALETTE.silver_dark,
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  input: { color: UI_PALETTE.white, fontSize: 15, letterSpacing: 1, fontFamily: MONO, padding: 0 },
  guildName: {
    color: UI_PALETTE.gold_light,
    fontSize: 18,
    letterSpacing: 1,
    fontFamily: MONO,
    marginTop: 6,
    textAlign: "center",
  },
  guildNameSmall: { color: WARM, fontSize: 14, fontFamily: MONO },
  codeRow: { flexDirection: "row", gap: 6 },
  codeBox: {
    borderColor: UI_PALETTE.silver_dark,
    backgroundColor: "#0c0e14",
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxMinted: {
    backgroundColor: UI_PALETTE.gold_mid,
    borderColor: UI_PALETTE.gold_dark,
  },
  hiddenInput: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0 },
  inlineBlock: { gap: 8, alignItems: "center", marginTop: 10 },
  confirmCard: { alignItems: "center", gap: 6, marginTop: 10 },
  note: { color: UI_PALETTE.sky_mid, fontSize: 13, textAlign: "center", maxWidth: 280, marginTop: 8 },
});

export default GuildStepScreens;
