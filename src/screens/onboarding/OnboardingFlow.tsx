// =============================================================================
// OnboardingFlow — the beat machine ABOVE the dashboard (STR-45; onboarding
// spec §Flow: "5 beats, no router — a state machine routed by SERVER state").
// =============================================================================
// AuthGate hands us a signed-in viewer that hasn't stamped `onboardedAt` yet.
// Every branch below reads the DB routing keys (class → hasGuild →
// onboardedAt), so killing the app anywhere resumes at the right beat:
//   no class          → Beat 1, choose your hero
//   class, no guild   → Beat 2, the guild fork (create / join)
//   class + guild     → Beat 3 (HealthKit priming — only where isAvailable())
//   beat 3 settled    → stamp completeOnboarding → AuthGate lands the dashboard
//
// The ONE piece of client state is `guildSettled` (Beat 2a's code reveal):
// createGuild flips `hasGuild` reactively at the same moment the invite code
// returns, so the guild screens must stay mounted until they SAY they're done —
// otherwise the founder's code-reveal would be skipped by its own success. A
// resume INTO the guild-done state (kill on the reveal screen, or a legacy
// account routed here for class-pick only) initializes settled and goes
// straight to the stamp: the code lives on the guild board, per the comp.
//
// Beat 3 (HealthKit priming, STR-48) slots between guild-done and the stamp:
// it exists only where HealthKit does (isAvailable() — web/Android auto-skip),
// and it's pure client choreography like guildSettled: whether Health was
// connected or skipped is deliberately NOT a routing key ("maybe later" must
// cost nothing; the never-gate guardrail). A kill during Beat 3 resumes INTO
// Beat 3 — the priming screen simply shows again, which is the right resume.
// Beat 4's teaching banner rides the feedback pipeline in STR-49.
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { DEV_FLAGS } from "../../devConfig";
import { isAvailable as healthKitAvailable } from "../../health/healthkit";
import { TitleCard } from "./TitleCard";
import { ChooseHeroScreen } from "./ChooseHeroScreen";
import { GuildStepScreens } from "./GuildStepScreens";
import { HealthPermissionScreen } from "./HealthPermissionScreen";

/** The routing snapshot `users.viewer` exposes (non-null: AuthGate gates). */
export type Viewer = NonNullable<FunctionReturnType<typeof api.users.viewer>>;

export function OnboardingFlow({ viewer }: { viewer: Viewer }) {
  const ensureSession = useMutation(api.users.ensureSession);
  const completeOnboarding = useMutation(api.users.completeOnboarding);

  // Guild beats own their exit (see header). Mount-time snapshot: an account
  // that ALREADY has a guild here (resume / legacy class-pick) skips Beat 2.
  const [guildSettled, setGuildSettled] = useState(() => viewer.hasGuild);

  // Beat 3 (STR-48): only where HealthKit exists — the web stub's
  // isAvailable() is false, so the browser flow auto-skips the beat entirely
  // (spec Beat 3: "Web/Simulator: beat auto-skipped"). forceHealthBeat is the
  // browser design-preview override. Both "connected" and "maybe later" settle
  // the beat — skipping surfaces later as the dashboard's calm chip instead.
  const [healthSettled, setHealthSettled] = useState(
    () => !(healthKitAvailable() || DEV_FLAGS.forceHealthBeat),
  );

  // Per-launch maintenance — default hero name (the Beat-1 pre-fill), starter
  // tank, legacy backfills. Same idempotent call the dashboard makes.
  const didEnsure = useRef(false);
  useEffect(() => {
    if (didEnsure.current) return;
    didEnsure.current = true;
    ensureSession({ tzOffsetMinutes: new Date().getTimezoneOffset() }).catch(
      () => {},
    );
  }, [ensureSession]);

  // Beat 4's stamp — fires exactly once, when the flow reaches the terminal
  // state (class + guild + the health beat handled — the stamp comes AFTER
  // Beat 3, per the flow). "Onboarded" MEANS class + guild (the server
  // re-checks); the title card covers the sub-second round trip, then AuthGate
  // swaps the dashboard in.
  const readyToStamp =
    viewer.class !== null && viewer.hasGuild && guildSettled && healthSettled;
  const didStamp = useRef(false);
  useEffect(() => {
    if (!readyToStamp || didStamp.current) return;
    didStamp.current = true;
    completeOnboarding({}).catch(() => {});
  }, [readyToStamp, completeOnboarding]);

  if (viewer.class === null) {
    // Beat 1 — choose your hero (+ name, same screen).
    return <ChooseHeroScreen viewer={viewer} />;
  }
  if (!viewer.hasGuild || !guildSettled) {
    // Beat 2 — the guild fork. Stays mounted through create → code reveal
    // (founder) or code → confirm → join (joiner) until onDone.
    return <GuildStepScreens viewer={viewer} onDone={() => setGuildSettled(true)} />;
  }
  if (!healthSettled) {
    // Beat 3 — power source (STR-48). Explain-then-ask HealthKit priming;
    // connect, payoff, and "maybe later" all end in onDone (never a gate).
    return <HealthPermissionScreen onDone={() => setHealthSettled(true)} />;
  }
  // Terminal — stamping onboardedAt behind the title card (no "done" screen).
  return <TitleCard />;
}
