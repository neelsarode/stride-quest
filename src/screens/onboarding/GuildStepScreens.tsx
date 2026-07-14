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
// The solo-guild-switch path needs no extra UI: the same confirm card fronts
// it, and the backend cascades the caller's empty solo guild inside
// joinGuildByCode. OnboardingFlow keeps this component mounted through the
// reactive hasGuild flip until onDone (see its header).
// =============================================================================
import { useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageStyle,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import { GUILD } from "../../../convex/gameConfig";
import { PALETTE, SIZES } from "../../config/assets";
import type { Viewer } from "./OnboardingFlow";

/** Mirrors guild.createGuild's validated bound. */
const GUILD_NAME_MAX = 30;

/** Client-side mirror of convex/inviteCode.normalizeInviteCode (+ length cap
 *  for the six boxes): uppercase, drop the separators people type when reading
 *  a code aloud. Look-alike characters are NOT corrected — the server's
 *  alphabet check turns them into an honest not_found. */
function normalizeAsTyped(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .slice(0, GUILD.inviteCodeLength);
}

/** The share payload for both the code-reveal screen and the guild board. */
export function inviteShareMessage(code: string): string {
  return `Join my guild on Stride Quest! Enter invite code ${code} — every step we walk hits the same boss.`;
}

/** Native share with a web-desktop fallback (no navigator.share there):
 *  copy to clipboard instead. Returns a user-facing note, or null. */
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
        return "Copied — paste it to your crew.";
      }
    } catch {
      // fall through to the calm no-share note
    }
    return "Sharing isn't available here — your code lives on the guild board.";
  }
}

// Crew huddle on the fork (comp GUILD beat) — three job-1 heroes sell "guild"
// better than an emblem. Static requires; M2's generated spriteMap replaces
// these one-offs along with ChooseHeroScreen's map.
const HUDDLE = [
  require("../../../characters/mage/1_apprentice/animations/idle/frame_000.png"),
  require("../../../characters/warrior/1_rookie/animations/idle/frame_000.png"),
  require("../../../characters/medic/1_acolyte/animations/idle/frame_000.png"),
];

const PIXELATED: ImageStyle | null =
  Platform.OS === "web"
    ? ({ imageRendering: "pixelated" } as unknown as ImageStyle)
    : null;

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
  const [step, setStep] = useState<Step>({ id: "fork" });

  switch (step.id) {
    case "fork":
      return (
        <Frame>
          <View style={styles.huddle}>
            {HUDDLE.map((src, i) => (
              <View
                key={i}
                style={[
                  styles.huddlePortrait,
                  i === 1 && { borderColor: PALETTE.accent },
                ]}
              >
                <Image source={src} style={[styles.huddleSprite, PIXELATED]} fadeDuration={0} />
              </View>
            ))}
          </View>
          <Text style={styles.headline}>HEROES DON'T{"\n"}FIGHT ALONE.</Text>
          <Text style={styles.body}>
            Every step your crew walks hits the same boss. Win Sundays
            together.
          </Text>
          <View style={styles.forkButtons}>
            <Btn gold label="START A GUILD" onPress={() => setStep({ id: "create" })} />
            <Text style={styles.hint}>Mint a code to share</Text>
            <Btn label="I HAVE A CODE" onPress={() => setStep({ id: "join" })} />
            <Text style={styles.hint}>A friend already sent you one</Text>
          </View>
          <Text style={styles.footer}>
            A guild holds up to {GUILD.maxMembers} heroes.
          </Text>
        </Frame>
      );
    case "create":
      return (
        <CreateGuildStep
          viewer={viewer}
          onBack={() => setStep({ id: "fork" })}
          onCreated={(guildName, inviteCode) =>
            setStep({ id: "reveal", guildName, inviteCode })
          }
        />
      );
    case "reveal":
      return (
        <CodeRevealStep
          guildName={step.guildName}
          inviteCode={step.inviteCode}
          onDone={onDone}
        />
      );
    case "join":
      return (
        <JoinGuildStep
          onStartInstead={() => setStep({ id: "create" })}
          onDone={onDone}
        />
      );
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
      <Text style={styles.headline}>START A GUILD</Text>
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>GUILD NAME</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={GUILD_NAME_MAX}
        />
        <Text style={styles.hint}>Rename it any time.</Text>
      </View>
      <View style={styles.mintList}>
        <Text style={styles.mintTitle}>Founding a guild mints:</Text>
        <Text style={styles.mintRow}>• your invite code</Text>
        <Text style={styles.mintRow}>• this week's boss</Text>
        <Text style={styles.mintRow}>• a 24h starter tank</Text>
        <Text style={styles.hint}>Friends join any time.</Text>
      </View>
      <Btn gold label="CREATE GUILD" onPress={onCreate} disabled={busy || !nameOk} />
      <Link label="Back" onPress={onBack} />
      {note && <Text style={styles.note}>{note}</Text>}
    </Frame>
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
  const [note, setNote] = useState<string | null>(null);
  return (
    <Frame>
      <Text style={[styles.headline, { color: PALETTE.accent }]}>
        GUILD CREATED!
      </Text>
      <Text style={styles.subline}>{guildName}</Text>
      <Text style={styles.fieldLabel}>YOUR INVITE CODE</Text>
      <CodeBoxes chars={inviteCode} minted />
      <Text style={styles.body}>
        Send it to your crew. They enter it and fight beside you all week.
      </Text>
      <Btn
        gold
        label="SHARE CODE"
        onPress={async () => setNote(await shareInviteCode(inviteCode))}
      />
      <Btn label="SKIP FOR NOW" onPress={onDone} />
      {note && <Text style={styles.note}>{note}</Text>}
      <Text style={styles.footer}>
        Sharing can wait — your code lives on the guild board too.
      </Text>
    </Frame>
  );
}

// --- Beat 2b: join by code ----------------------------------------------------

/** The joiner's inline states (comp beats JOIN/CONFIRM/NOT FOUND/FULL/MEMBER).
 *  `checkCode` drives the reactive preview; a join rejection overrides it. */
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
  const joinGuildByCode = useMutation(api.guild.joinGuildByCode);
  const [code, setCode] = useState("");
  const [checkCode, setCheckCode] = useState<string | null>(null);
  const [err, setErr] = useState<JoinError | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Preview-confirm BEFORE joining (spec: "no surprise guilds"). null result =
  // unknown/bad-format code → the warm not_found state.
  const preview = useQuery(
    api.guild.previewInviteCode,
    checkCode !== null ? { code: checkCode } : "skip",
  );

  const complete = code.length === GUILD.inviteCodeLength;

  function editCode(next: string) {
    setCode(normalizeAsTyped(next));
    setCheckCode(null); // typing again clears any prior verdict
    setErr(null);
  }

  async function onJoin() {
    if (busy) return;
    setBusy(true);
    try {
      await joinGuildByCode({ code });
      onDone(); // membership landed; OnboardingFlow stamps + lands the game
    } catch (e) {
      if (e instanceof ConvexError && typeof e.data === "object" && e.data) {
        const d = e.data as { code?: string; message?: string };
        if (d.code === "already_member") {
          // Typed their own guild's code — a homecoming, not an error: the
          // membership already exists, so route straight through.
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

  // Which inline block rides under the boxes right now?
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
      <Text style={styles.headline}>ENTER YOUR CODE</Text>
      <Text style={styles.body}>
        {GUILD.inviteCodeLength} letters from your friend
      </Text>

      {/* Six boxes + a hidden input that actually holds the value. */}
      <Pressable onPress={() => inputRef.current?.focus()}>
        <CodeBoxes chars={code} caretAt={code.length} />
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
      <Text style={styles.hint}>Type any case — we uppercase it.</Text>

      {showNotFound && (
        <View style={styles.inlineBlock}>
          <Text style={styles.warm}>Hmm — no guild wears that code.</Text>
          <Text style={styles.body}>
            Check it with your friend and try again.
          </Text>
          <Link label="Or start a guild instead" onPress={onStartInstead} />
        </View>
      )}

      {showFull && (
        <View style={styles.inlineBlock}>
          <Text style={styles.warm}>
            {fullName} is full — {GUILD.maxMembers} heroes strong.
          </Text>
          <Text style={styles.body}>
            Your code was right. The bench is just out of seats.
          </Text>
          <Btn gold label="START MY OWN GUILD" onPress={onStartInstead} />
          <Link
            label="Try another code"
            onPress={() => {
              setCode("");
              setCheckCode(null);
              setErr(null);
            }}
          />
        </View>
      )}

      {showConfirm && preview != null && (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>CODE FOUND!</Text>
          <Text style={styles.confirmGuild}>{preview.guildName}</Text>
          <Text style={styles.body}>
            {preview.memberCount}{" "}
            {preview.memberCount === 1 ? "hero fights" : "heroes fight"} beside
            you.
          </Text>
          <Text style={styles.hint}>
            {preview.memberCount} of {preview.maxMembers} spots filled
          </Text>
          <Btn
            gold
            label={`JOIN ${preview.guildName.toUpperCase()}`}
            onPress={onJoin}
            disabled={busy}
          />
          <Link label="Not this one" onPress={() => setCheckCode(null)} />
        </View>
      )}

      {err?.kind === "message" && <Text style={styles.warm}>{err.message}</Text>}

      {!showConfirm && !showFull && (
        <>
          {complete ? (
            <Btn
              gold
              label="CHECK CODE"
              onPress={() => setCheckCode(code)}
              disabled={checkCode !== null && preview === undefined}
            />
          ) : (
            <>
              <View style={styles.ctaDisabled}>
                <Text style={styles.ctaDisabledText}>CHECK CODE</Text>
              </View>
              <Text style={styles.hint}>
                Enter all {GUILD.inviteCodeLength} characters first
              </Text>
            </>
          )}
          {/* The not_found block has its own founder escape hatch. */}
          {!showNotFound && (
            <Link label="No code? Start a guild" onPress={onStartInstead} />
          )}
        </>
      )}
    </Frame>
  );
}

// --- shared pieces ------------------------------------------------------------

/** The six-box code row (comp codeBoxes): minted gold faces on the reveal,
 *  recessed entry wells (with a caret slot) while typing. */
function CodeBoxes({
  chars,
  minted,
  caretAt,
}: {
  chars: string;
  minted?: boolean;
  caretAt?: number;
}) {
  return (
    <View style={styles.codeRow}>
      {Array.from({ length: GUILD.inviteCodeLength }, (_, i) => (
        <View
          key={i}
          style={[
            styles.codeBox,
            minted && styles.codeBoxMinted,
            !minted && caretAt === i && styles.codeBoxActive,
          ]}
        >
          <Text style={[styles.codeChar, minted && styles.codeCharMinted]}>
            {chars[i] ?? (!minted && caretAt === i ? "|" : "")}
          </Text>
        </View>
      ))}
    </View>
  );
}

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

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
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
  huddle: { flexDirection: "row", gap: 10, marginBottom: 6 },
  huddlePortrait: {
    width: 56,
    height: 56,
    borderWidth: 2,
    borderColor: PALETTE.panelBorder,
    borderRadius: 10,
    backgroundColor: "#0c0e14",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  huddleSprite: { width: 64, height: 64 },
  headline: {
    color: PALETTE.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    lineHeight: 32,
  },
  subline: { color: PALETTE.text, fontSize: 16, fontWeight: "700" },
  body: {
    color: PALETTE.text,
    fontSize: 14,
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 20,
  },
  hint: { color: PALETTE.textDim, fontSize: 12, textAlign: "center" },
  footer: { color: PALETTE.textDim, fontSize: 12, textAlign: "center", marginTop: 16 },
  forkButtons: { gap: 8, marginTop: 12, alignItems: "center" },
  fieldBlock: { width: 280, gap: 6, marginTop: 4 },
  fieldLabel: {
    color: PALETTE.textDim,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  input: {
    borderWidth: 1,
    borderColor: PALETTE.panelBorder,
    backgroundColor: "#0c0e14",
    borderRadius: 10,
    color: PALETTE.text,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  mintList: {
    width: 280,
    backgroundColor: PALETTE.panel,
    borderColor: PALETTE.panelBorder,
    borderWidth: 1,
    borderRadius: SIZES.radius,
    padding: 14,
    gap: 4,
  },
  mintTitle: { color: PALETTE.text, fontSize: 13, fontWeight: "700" },
  mintRow: { color: PALETTE.textDim, fontSize: 13 },
  codeRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  codeBox: {
    width: 44,
    height: 54,
    borderWidth: 2,
    borderColor: PALETTE.panelBorder,
    borderRadius: 8,
    backgroundColor: "#0c0e14",
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxActive: { borderColor: PALETTE.accent },
  codeBoxMinted: { backgroundColor: PALETTE.accent, borderColor: PALETTE.accent },
  codeChar: { color: PALETTE.text, fontSize: 26, fontWeight: "900" },
  codeCharMinted: { color: "#11131a" },
  hiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: 0,
  },
  inlineBlock: { gap: 8, alignItems: "center", marginTop: 6 },
  warm: {
    color: "#ffe08a", // warm, never red (guardrail)
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    maxWidth: 300,
  },
  confirmCard: {
    width: 300,
    backgroundColor: PALETTE.panel,
    borderColor: PALETTE.panelBorder,
    borderWidth: 1,
    borderRadius: SIZES.radius,
    padding: 16,
    gap: 8,
    alignItems: "center",
    marginTop: 6,
  },
  confirmTitle: {
    color: PALETTE.textDim,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  confirmGuild: { color: PALETTE.accent, fontSize: 20, fontWeight: "900" },
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
  ctaDisabled: {
    borderRadius: 12,
    paddingVertical: 13,
    minWidth: 260,
    alignItems: "center",
    backgroundColor: PALETTE.panel,
  },
  ctaDisabledText: {
    color: PALETTE.textDim,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  link: {
    color: PALETTE.accent,
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
    padding: 6,
  },
  note: { color: PALETTE.textDim, fontSize: 13, textAlign: "center", maxWidth: 280 },
});
