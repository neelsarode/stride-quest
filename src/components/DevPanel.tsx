// =============================================================================
// DevPanel — dev-only control panel (gated by DEV_FLAGS.showDevPanel + the
// backend ENABLE_DEV_TOOLS env var). Time-travel the server clock, inject steps,
// and manage simulated teammates so time-based + co-op mechanics are testable in
// minutes. Deliberately loud (magenta, dashed) so it reads as NOT-real UI.
// =============================================================================
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useMutation, useQuery } from "convex/react";
import {
  Badge,
  Bar,
  type BarHandle,
  Beacon,
  Button,
  Chip,
  Modal,
  PixelText,
  Popover,
  Portrait,
  Ring,
  Sheet,
  StatusDot,
  UIScaleProvider,
} from "../ui";
import { BakedImage } from "../ui/Baked";
import { UI_PALETTE } from "../ui/theme";
import { api } from "../../convex/_generated/api";
import { FX_ANCHORS } from "../battle/anchors";
import { BattleScene, type SceneHero } from "../battle/BattleScene";
import { ConnectedBattleScene } from "../battle/ConnectedBattleScene";
import { Boss, type BossHandle } from "../battle/Boss";
import {
  Fighter,
  type AttackKind,
  type FighterHandle,
  type FighterMode,
  type ReleaseEvent,
} from "../battle/Fighter";
import { CLASS_NAMES, FX, type ClassName } from "../battle/fxConfig";
import {
  computeShotGeometry,
  Projectile,
  type Rect,
} from "../battle/Projectile";
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
  const simRally = useMutation(api.dev.simulateTeammateRally);
  const drainTeammate = useMutation(api.dev.drainTeammate);
  const grantShield = useMutation(api.dev.grantShield);
  const consumeShield = useMutation(api.dev.consumeShield);
  // Overdrive is auto-armed on a goal-hit now (Core Loop v2 §5.4, STR-74): the
  // fillOverdrive + activateOverdrive dev tools are retired — inject a goal day
  // (the +N step buttons ≥ the goal) to arm it, advanceDay to watch it end.

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
              OD{" "}
              {dash.overdrive.active
                ? `×${dash.overdrive.mult} ACTIVE ${dash.overdrive.remainingSeconds}s left`
                : `${dash.overdrive.stepsToday}/${dash.overdrive.goal} to goal`}{" "}
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
          <UiGallery />
          <SpriteDemo />
          <FighterDemo />
          <BattleDemo />
          <BattleSceneDemo />
          <LiveSceneDemo />

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
            {/* Overdrive is goal-armed now (STR-74): inject a goal day above. */}
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

// =============================================================================
// STR-64 verification vehicle — the UI GALLERY. Renders every src/ui primitive
// in every state, at 2x AND 3x (toggle), on the S8 CELESTIAL SILVER background,
// so it can be screenshot side-by-side against ui-style-lab.html. The RENDER
// COUNT readout is the M2 zero-re-render proof: with ANIMATE on, the fills,
// flash, beacon and ring all move on shared values while the count stays FLAT.
// Dev-only (lives inside the already-gated DevPanel). Throwaway once GameScreen
// composes these for real.
// =============================================================================
const GALLERY_PORTRAITS = {
  warrior: require("../../characters/warrior/5_warlord/south.png"),
  mage: require("../../characters/mage/5_archmage/south.png"),
  archer: require("../../characters/archer/5_sentinel/south.png"),
  medic: require("../../characters/medic/5_hierophant/south.png"),
} as const;
// south.png intrinsic sizes (RN-web has no Image.resolveAssetSource).
const GALLERY_PORTRAIT_SIZE: Record<keyof typeof GALLERY_PORTRAITS, number> = {
  warrior: 128,
  mage: 120,
  archer: 128,
  medic: 128,
};

const GALLERY_PARTY = [
  { cls: "warrior", state: "battling" },
  { cls: "mage", state: "battling" },
  { cls: "archer", state: "winded" },
  { cls: "medic", state: "resting" },
] as const;

function GLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.galLabel}>{children}</Text>;
}

// Memoised (no props) so the Dashboard's ambient 1Hz idle-ticker re-renders
// don't cascade in — the RENDER COUNT then reflects ONLY this component's own
// state changes, so with ANIMATE on it stays perfectly flat while the
// shared-value chrome runs at 60fps (the M2 zero-re-render acceptance proof).
const UiGallery = memo(function UiGallery() {
  // Incremented on EVERY React render — with ANIMATE on it MUST stay flat.
  const renderCount = useRef(0);
  renderCount.current += 1;

  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(2);
  const [animate, setAnimate] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Shared-value drives for the ANIMATE proof — updating these never touches
  // React (no setState), so they animate with the render count frozen.
  const barLoop = useSharedValue(0.55);
  const ghostLoop = useSharedValue(0.72);
  const ringLoop = useSharedValue(0.78);
  const flashRef = useRef<BarHandle>(null);

  useEffect(() => {
    if (animate) {
      barLoop.value = withRepeat(
        withTiming(0.92, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
      ghostLoop.value = withRepeat(
        withTiming(0.99, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
      ringLoop.value = withRepeat(
        withTiming(1, { duration: 2800, easing: Easing.linear }),
        -1,
        false,
      );
      flashRef.current?.flash();
      const id = setInterval(() => flashRef.current?.flash(), 1400);
      return () => clearInterval(id);
    }
    cancelAnimation(barLoop);
    cancelAnimation(ghostLoop);
    cancelAnimation(ringLoop);
    barLoop.value = 0.55;
    ghostLoop.value = 0.72;
    ringLoop.value = 0.78;
  }, [animate, barLoop, ghostLoop, ringLoop]);

  const BAR_W = 118;

  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <Text style={styles.sectionTitle}>UI GALLERY {open ? "▲" : "▼"}</Text>
      </Pressable>
      {open && (
        <>
          <View style={styles.row}>
            <Btn label={`SCALE ${scale}x ▸`} onPress={() => setScale((v) => (v === 2 ? 3 : 2))} />
            <Btn label={animate ? "ANIMATE ✓" : "ANIMATE"} onPress={() => setAnimate((a) => !a)} />
            <Btn label="⚡ FLASH" onPress={() => flashRef.current?.flash()} />
          </View>
          <Text style={styles.readout}>
            RENDER COUNT {renderCount.current} · {scale}x ·{" "}
            {animate ? "ANIMATING (count must stay flat)" : "static"}
          </Text>

          <UIScaleProvider value={scale}>
            <View nativeID="ui-gallery-stage" style={styles.galStage}>
              {/* ---- BARS ---- */}
              <GLabel>BARS · boss (full, gold) + ghost chip</GLabel>
              <Bar variant="full" width={BAR_W} value={0.62} ghost={0.74} fill="gold" label="62,000 / 100,000" />
              <GLabel>fuel / xp / overdrive (slim)</GLabel>
              <Bar variant="slim" width={BAR_W} value={0.44} fill="sky" label="FIGHTS 21H" />
              <Bar variant="slim" width={BAR_W} value={0.48} fill="sky" label="12,000 / 25,000 XP" />
              <Bar variant="slim" width={BAR_W} value={0.62} fill="gold" label="62%" />
              <GLabel>fill families + flash (tap ⚡ FLASH)</GLabel>
              <View style={styles.galRow}>
                <Bar variant="slim" width={46} value={0.85} fill="gold" />
                <Bar variant="slim" width={46} value={0.6} fill="sky" />
                <Bar variant="slim" width={46} value={0.5} fill="green" />
                <Bar variant="slim" width={46} value={0.35} fill="yellow" />
                <Bar variant="slim" width={46} value={0.15} fill="red" />
              </View>
              <Bar ref={flashRef} variant="full" width={BAR_W} value={0.7} fill="gold" label="FLASH" />
              <GLabel>ANIMATED (shared-value driven — render count stays flat)</GLabel>
              <Bar variant="full" width={BAR_W} progress={barLoop} ghostProgress={ghostLoop} fill="gold" label="LIVE" />
              <Bar variant="slim" width={BAR_W} progress={barLoop} fill="sky" />

              {/* ---- BUTTONS ---- */}
              <GLabel>BUTTONS (pressed = content drops 1 art px — tap to see)</GLabel>
              <View style={styles.galRow}>
                <Button asset="btn_deploy_gold" label="DEPLOY" />
                <Button material="silver" label="MENU" />
                <Button material="gold" label="GO" />
                <Button material="silver" label="OK" />
                <Button material="silver" label="?" labelScale={2} />
              </View>
              <View style={styles.galRow}>
                <Button asset="btn_nav_silver">
                  <BakedImage name="icon_banner" scale={scale} />
                </Button>
                <Button asset="btn_collect_silver">
                  <BakedImage name="icon_star" scale={scale} />
                </Button>
                <Button asset="btn_close_gold" label="X" />
              </View>

              {/* ---- CHIPS + BADGES ---- */}
              <GLabel>CHIPS + BADGES</GLabel>
              <View style={styles.galRow}>
                <Chip label="+320" color="gold" />
                <Chip label="+1,050" color="green" />
                <Chip label="RALLY" color="red" />
                <Badge label="1" />
                <Badge label="5" />
                <Badge label="12" />
              </View>

              {/* ---- STATUS DOTS ---- */}
              <GLabel>STATUS DOTS (battling / winded / resting / rally)</GLabel>
              <View style={styles.galRow}>
                <StatusDot state="battling" />
                <StatusDot state="winded" />
                <StatusDot state="resting" />
                <StatusDot state="rally" />
              </View>

              {/* ---- PORTRAITS ---- */}
              <GLabel>PORTRAITS (30 hero · 18 party rail w/ dots + beacon · empty)</GLabel>
              <View style={styles.galRow}>
                <Portrait
                  size={30}
                  source={GALLERY_PORTRAITS.warrior}
                  cropKey="warrior"
                  sourceSize={GALLERY_PORTRAIT_SIZE.warrior}
                />
                {GALLERY_PARTY.map((m) => (
                  <View key={m.cls} style={{ width: 18 * scale, height: 18 * scale }}>
                    {m.state === "resting" && (
                      <View style={{ position: "absolute", left: -1 * scale, top: -1 * scale }}>
                        <Beacon active={animate} />
                      </View>
                    )}
                    <Portrait
                      size={18}
                      source={GALLERY_PORTRAITS[m.cls as keyof typeof GALLERY_PORTRAITS]}
                      cropKey={m.cls}
                      sourceSize={GALLERY_PORTRAIT_SIZE[m.cls as keyof typeof GALLERY_PORTRAITS]}
                    />
                    <View style={{ position: "absolute", right: 0, bottom: 0 }}>
                      <StatusDot state={m.state} />
                    </View>
                  </View>
                ))}
                <Portrait size={22} />
              </View>

              {/* ---- RING + BEACON ---- */}
              <GLabel>STEPS RING (0 / .25 / .5 / .78 / 1 · animated) + rally beacon</GLabel>
              <View style={styles.galRow}>
                <Ring value={0} />
                <Ring value={0.25} />
                <Ring value={0.5} />
                <Ring value={0.78} />
                <Ring value={1} />
                <Ring progress={ringLoop} />
                <Beacon active />
              </View>

              {/* ---- PIXEL TEXT ---- */}
              <GLabel>PIXEL TEXT · plain / outlined / engraved</GLabel>
              <View style={styles.galRow}>
                <PixelText text="HERO-EHB8" color={UI_PALETTE.white} />
                <PixelText text="THE NIGHTMARE" color={UI_PALETTE.gold_mid} />
              </View>
              <View style={{ backgroundColor: UI_PALETTE.gold_mid, padding: 3 * scale }}>
                <PixelText text="62,000 / 100,000" variant="outlined" />
              </View>
              <View style={styles.galRow}>
                <PixelText text="DEPLOY" variant="engraved" color={UI_PALETTE.outline} rimColor={UI_PALETTE.gold_light} />
                <PixelText text="SETTINGS" variant="engraved" color={UI_PALETTE.outline} rimColor={UI_PALETTE.silver_rim} />
              </View>

              {/* ---- POPOVER (parity: SAM-MEDIC + SEND RALLY) ---- */}
              <GLabel>POPOVER (member stats + rally)</GLabel>
              <View style={{ paddingTop: 4 * scale, alignItems: "center", width: 132 * scale }}>
                <Popover height={72} side="top" arrowOffset={15}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <PixelText text="SAM - MEDIC" color={UI_PALETTE.silver_rim} />
                    <PixelText text="RESTING" color={UI_PALETTE.sky_mid} />
                  </View>
                  <GalStat label="STEPS TODAY" value="1,050" top={8} scale={scale} />
                  <GalStat label="DMG WEEK" value="8,750" top={17} scale={scale} />
                  <GalStat label="STREAK" value="0 DAYS" top={26} scale={scale} />
                  <View style={{ position: "absolute", left: 0, top: 39 * scale }}>
                    <Button material="silver" label="SEND RALLY 500" width={126} />
                  </View>
                </Popover>
              </View>

              {/* ---- SHEET + MODAL ---- */}
              <GLabel>SHEET + MODAL (overlay the app)</GLabel>
              <View style={styles.galRow}>
                <Btn label="OPEN SHEET" onPress={() => setSheetOpen(true)} />
                <Btn label="OPEN MODAL" onPress={() => setModalOpen(true)} />
              </View>
            </View>

            <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
              <View style={{ gap: 6 * scale }}>
                <PixelText text="GUILD BOARD" color={UI_PALETTE.gold_mid} scale={scale + 1} />
                <PixelText text="SLIDE-UP DETAIL PANEL" color={UI_PALETTE.sky_mid} />
                <View style={{ marginTop: 8 * scale }}>
                  <Button material="gold" label="CLOSE" onPress={() => setSheetOpen(false)} />
                </View>
              </View>
            </Sheet>

            <Modal visible={modalOpen} onClose={() => setModalOpen(false)} title="HOW TO PLAY" height={86}>
              <View style={{ gap: 3 * scale }}>
                <PixelText text="WALK EVERY DAY." color={UI_PALETTE.silver_rim} />
                <PixelText text="STEPS BECOME ENERGY." color={UI_PALETTE.sky_mid} />
                <PixelText text="DEPLOY TO STRIKE THE" color={UI_PALETTE.silver_rim} />
                <PixelText text="WEEKLY BOSS TOGETHER." color={UI_PALETTE.sky_mid} />
                <View style={{ marginTop: 5 * scale, alignItems: "center" }}>
                  <Button material="silver" label="OK" onPress={() => setModalOpen(false)} />
                </View>
              </View>
            </Modal>
          </UIScaleProvider>
        </>
      )}
    </View>
  );
});

// A popover stat line: dim label left, bright value right (kit statLine).
function GalStat({
  label,
  value,
  top,
  scale,
}: {
  label: string;
  value: string;
  top: number;
  scale: number;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: top * scale,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <PixelText text={label} color={UI_PALETTE.sky_mid} scale={scale} />
      <PixelText text={value} color={UI_PALETTE.silver_rim} scale={scale} />
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

// One in-flight shot for the BattleDemo effect layer (keyed Projectile mount).
interface Shot {
  id: number;
  cls: ClassName;
  kind: AttackKind;
  from: { x: number; y: number };
  toX: number;
  damage: number;
}

// Boss display height in the mini-stage. The real never-shorter-than-the-party
// auto-scale rule lands with the scene ticket (plan step 5).
const DEMO_BOSS_HEIGHT = 140;

// STR-20 verification vehicle for Projectile.tsx + Boss.tsx (plan step 4): a
// mini-stage mounting one Fighter and the Boss in correct relative layout
// (hero left, boss right, shared ground). FIRE wires the full basic-attack
// choreography: Fighter.onRelease → computeShotGeometry (onLayout rects × the
// measured tipX/tipY anchor fractions — decision D3, never view bounds) →
// Projectile flight → onImpact → Boss.hit (white flash + bump) + damage
// number. CROWNED swaps the boss form. Throwaway once BattleScene lands
// (plan step 5+).
function BattleDemo() {
  const fighter = useRef<FighterHandle>(null);
  const boss = useRef<BossHandle>(null);
  // Rects captured via onLayout, both relative to the SAME stage view — the
  // coordinate space the projectiles are positioned in (D3 requirement).
  const heroRect = useRef<Rect | null>(null);
  const bossRect = useRef<Rect | null>(null);

  const [open, setOpen] = useState(false);
  const [clsIdx, setClsIdx] = useState(0);
  const [jobIdx, setJobIdx] = useState(4); // job 5 by default (best anchors demo)
  const [crowned, setCrowned] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const shotId = useRef(0);

  const cls = CLASS_NAMES[clsIdx];
  const jobs = JOBS_BY_CLASS[cls] ?? [];
  const job = jobs[Math.min(jobIdx, jobs.length - 1)];

  // The release moment: spawn the shot at the measured weapon tip. Geometry
  // uses the anchor CARRIED BY THE EVENT (basic vs special anchors differ).
  const onRelease = useCallback((e: ReleaseEvent) => {
    if (!heroRect.current || !bossRect.current) return; // not measured yet
    const geo = computeShotGeometry(heroRect.current, e.anchor, bossRect.current);
    const big = e.kind === "special";
    // fx-engine impactAt parity damage roll — real damage arrives with the
    // event wiring (plan step 6); the demo only needs a plausible number.
    const damage = big
      ? 9000 + Math.floor(Math.random() * 3000)
      : 1800 + Math.floor(Math.random() * 900);
    setShots((s) => [
      ...s,
      { id: shotId.current++, cls: e.cls, kind: e.kind, ...geo, damage },
    ]);
  }, []);

  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <Text style={styles.sectionTitle}>BATTLE DEMO {open ? "▲" : "▼"}</Text>
      </Pressable>
      {open && (
        <>
          <Text style={styles.readout}>
            {cls}/{job} vs {crowned ? "CROWNED " : ""}HORSE · chest@
            {FX.bossChestX} · {FX.speedPxMs}px/ms
          </Text>
          <View style={styles.battleStage} testID="battle-stage">
            <View
              style={styles.battleHero}
              testID="battle-hero"
              onLayout={(e) => {
                heroRect.current = e.nativeEvent.layout;
              }}
            >
              <Fighter ref={fighter} cls={cls} job={job} onRelease={onRelease} />
            </View>
            <Boss
              ref={boss}
              bossKey={crowned ? "horse_crowned_256" : "horse_256"}
              heightPx={DEMO_BOSS_HEIGHT}
              style={styles.battleBoss}
              onLayout={(e) => {
                bossRect.current = e.nativeEvent.layout;
              }}
            />
            {shots.map((s) => (
              <Projectile
                key={s.id}
                cls={s.cls}
                kind={s.kind}
                from={s.from}
                toX={s.toX}
                damage={s.damage}
                onImpact={() => boss.current?.hit(s.kind === "special")}
                onDone={() =>
                  setShots((prev) => prev.filter((x) => x.id !== s.id))
                }
              />
            ))}
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
            <Btn label="⚔ FIRE" onPress={() => fighter.current?.basic()} />
            <Btn label="✦ SPECIAL" onPress={() => fighter.current?.special()} />
            <Btn
              label={crowned ? "👑 CROWNED ✓" : "👑 CROWNED"}
              onPress={() => setCrowned((c) => !c)}
            />
          </View>
        </>
      )}
    </View>
  );
}

// STR-21 verification vehicle for src/battle/BattleScene.tsx (plan step 5):
// the full timer-driven scene in preview parity — battlefield-ui.html's roster
// order, JOB switcher, CROWNED and REST toggles, plus a party-size cycler
// (8 → 3 → 1) proving the roster-agnostic layout + boss auto-scale. Tap a hero
// to fire their ultimate. Stays useful after the event wiring as the layout QA
// rig (autoPlay here, events on the dashboard).
const SCENE_DEMO_CLASSES: ClassName[] = [
  "mage",
  "assassin",
  "warrior",
  "archer",
  "paladin",
  "bard",
  "medic",
  "warlock",
];
const SCENE_DEMO_SIZES = [8, 3, 1] as const;

function BattleSceneDemo() {
  const [open, setOpen] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [jobIdx, setJobIdx] = useState(4); // job 5 (preview default)
  const [crowned, setCrowned] = useState(false);
  const [resting, setResting] = useState(false);

  const count = SCENE_DEMO_SIZES[sizeIdx];
  const heroes: SceneHero[] = SCENE_DEMO_CLASSES.slice(0, count).map((cls) => {
    const jobs = JOBS_BY_CLASS[cls] ?? [];
    return {
      id: `scene-demo-${cls}`,
      cls,
      job: jobs[Math.min(jobIdx, jobs.length - 1)],
      resting,
    };
  });

  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <Text style={styles.sectionTitle}>BATTLE SCENE {open ? "▲" : "▼"}</Text>
      </Pressable>
      {open && (
        <>
          <Text style={styles.readout}>
            {count} heroes · JOB {jobIdx + 1}
            {crowned ? " · CROWNED" : ""}
            {resting ? " · RESTING" : ""} · tap a hero → ult
          </Text>
          <BattleScene
            heroes={heroes}
            bossKey={crowned ? "horse_crowned_256" : "horse_256"}
            autoPlay
            style={styles.sceneStage}
          />
          <View style={styles.row}>
            <Btn
              label={`HEROES ${count} ▸`}
              onPress={() => setSizeIdx((i) => (i + 1) % SCENE_DEMO_SIZES.length)}
            />
            <Btn
              label={`JOB ${jobIdx + 1} ▸`}
              onPress={() => setJobIdx((i) => (i + 1) % 5)}
            />
            <Btn
              label={crowned ? "👑 CROWNED ✓" : "👑 CROWNED"}
              onPress={() => setCrowned((c) => !c)}
            />
            <Btn
              label={resting ? "REST ✓ (wake)" : "REST"}
              onPress={() => setResting((r) => !r)}
            />
          </View>
        </>
      )}
    </View>
  );
}

// STR-22 verification vehicle for src/battle/ConnectedBattleScene.tsx (plan
// step 6 / D5): the scene on REAL Convex state — roster from guild.overview,
// attacks from the live game-event stream. Drive it with the panel's own
// tools: inject → DEPLOY (screen button) → your hero ults with the real
// number; teammate ⚔ Deploy → their fighter fires; 💤 Drain → they kneel with
// z's; ⚡ Activate ×3 → your specials chain; kill the boss → crowned form.
function LiveSceneDemo() {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <Text style={styles.sectionTitle}>
          LIVE SCENE · real events {open ? "▲" : "▼"}
        </Text>
      </Pressable>
      {open && <ConnectedBattleScene style={styles.sceneStage} />}
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
  // UI GALLERY (STR-64): S8 CELESTIAL SILVER background so it reads against
  // ui-style-lab.html; loose gaps so each primitive is isolated for screenshots.
  galStage: {
    backgroundColor: "#1b2637",
    borderRadius: 8,
    padding: 12,
    gap: 8,
    alignItems: "flex-start",
  },
  galLabel: {
    color: "#8aa0b8",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 8,
    textTransform: "uppercase",
  },
  galRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  spriteStage: {
    backgroundColor: "#0c0e14",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  // BattleDemo mini-stage: hero + boss + projectiles share THIS view's
  // coordinate space (onLayout rects and absolute effect positions must agree
  // — D3). No padding, so layout coords and absolute positions line up 1:1.
  battleStage: {
    height: 200,
    backgroundColor: "#0c0e14",
    borderRadius: 8,
    overflow: "hidden",
  },
  battleHero: { position: "absolute", left: 10, bottom: 10 },
  battleBoss: { position: "absolute", right: 10, bottom: 10 },
  // BattleSceneDemo: a fixed-height window onto the full scene (the scene
  // itself is size-agnostic — it lays out from its own onLayout box).
  sceneStage: { height: 560, borderRadius: 8 },
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
