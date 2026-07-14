// =============================================================================
// Fighter — idle/attack/special/rest state machine for ONE on-screen character
// (docs/fx-rn-port-plan.md, step 3; ≙ makeFighter() in assets/fx-engine.js —
// port its semantics exactly).
//
// Contract carried over from makeFighter:
//   • basic()/special() only arm from 'idle' — a resting or mid-swing fighter
//     ignores attack orders by construction, no extra guards needed.
//   • attack/special play ONCE (Sprite one-shot) then return to 'idle' — or to
//     'rest' when setResting(true) arrived mid-swing.
//   • setResting(true) from idle drops into the kneel loop immediately;
//     setResting(false) wakes only a resting fighter.
//   • job/class change (≙ setJob) abandons any in-flight swing — its scheduled
//     release is cancelled, matching the preview where setJob resets the frame
//     counter so the release check never matches — and PRESERVES rest.
//
// Release timing (plan decision D2): we do NOT observe the UI-thread frame
// index from JS. The release moment is computed as (anchor.release / fps)
// seconds and scheduled with setTimeout from play start; ±1 frame (~83ms at
// 12fps) of drift is imperceptible — the HTML preview uses the same
// decoupling. The scene ticket (step 4/5) hooks projectile spawning to
// onRelease; the event carries the anchor (tipX/tipY FRACTIONS of the frame)
// that fireProjectile-style spawn math needs — per D3, never use view edges.
//
// Z-particles (the drifting "zzz" while resting): DEFERRED to the scene
// ticket — they are an overlay effect like projectiles/damage numbers and
// belong on the scene's effect layer, not inside one fighter's box. The
// behavior contract from makeFighter stands: z's run only while resting and
// stop on wake — key the overlay off onModeChange("rest" | anything-else).
// =============================================================================
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { FX_ANCHORS, FX_SPECIAL_ANCHORS, type FxAnchor } from "./anchors";
import { FX, type ClassName } from "./fxConfig";
import { Sprite } from "./Sprite";
import type { SpriteKey } from "./spriteMap";

export type FighterMode = "idle" | "rest" | "attack" | "special";
export type AttackKind = "basic" | "special";

/** Payload for the release moment — everything projectile spawning needs. */
export interface ReleaseEvent {
  kind: AttackKind;
  cls: ClassName;
  /** Job folder key, e.g. "5_warlord". */
  job: string;
  /**
   * The anchor of the animation that fired: tipX/tipY are the visible
   * weapon-tip position as FRACTIONS of the rendered frame (multiply by the
   * fighter's on-screen box from onLayout — decision D3).
   */
  anchor: FxAnchor;
  /** The scheduled delay (release / fps, in ms) the timestamp should ≈ match. */
  expectedDelayMs: number;
}

export interface FighterHandle {
  /** Fire the basic attack. Returns false when ignored (fighter not idle). */
  basic(): boolean;
  /** Fire the special (ultimate). Returns false when ignored (not idle). */
  special(): boolean;
  /** Enter/leave the kneeling rest loop (out-of-fuel state). */
  setResting(on: boolean): void;
  /** Current mode (imperative peek; subscribe via onModeChange instead). */
  getMode(): FighterMode;
}

export interface FighterProps {
  cls: ClassName;
  /** Job folder key, e.g. "5_warlord" (≙ makeFighter's jobKey / setJob). */
  job: string;
  /** Fires at the release frame of a basic/special swing (see header). */
  onRelease?: (e: ReleaseEvent) => void;
  /**
   * Observability hook for every mode transition — the scene keys rest-only
   * overlays (z-particles) off this; the DevPanel demo shows it as a readout.
   */
  onModeChange?: (mode: FighterMode) => void;
  /** Outer positioning/transform styles, forwarded to the Sprite window. */
  style?: StyleProp<ViewStyle>;
}

export const Fighter = forwardRef<FighterHandle, FighterProps>(
  function Fighter({ cls, job, onRelease, onModeChange, style }, ref) {
    const [mode, setMode] = useState<FighterMode>("idle");
    // Restart token for one-shots (Sprite playKey): bumped per swing so a
    // fresh attack replays from frame 0 even right after the previous one.
    const [playKey, setPlayKey] = useState(0);

    // The REQUESTED rest state — may differ from mode mid-swing (a swing in
    // flight completes first, then onDone routes here instead of idle).
    const restingRef = useRef(false);
    // mode mirror for imperative reads (handle methods must not see stale
    // state captured at render time).
    const modeRef = useRef(mode);
    // Pending release setTimeout (at most one: attacks only arm from idle and
    // release always lands before the swing's last frame, i.e. before onDone).
    const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Latest-callback refs so the scheduled release / transitions never call
    // a stale closure (same pattern as Sprite's onDoneRef).
    const onReleaseRef = useRef(onRelease);
    onReleaseRef.current = onRelease;
    const onModeChangeRef = useRef(onModeChange);
    onModeChangeRef.current = onModeChange;

    function go(next: FighterMode) {
      if (modeRef.current === next) return;
      modeRef.current = next;
      setMode(next);
      onModeChangeRef.current?.(next);
    }

    function cancelRelease() {
      if (releaseTimer.current !== null) {
        clearTimeout(releaseTimer.current);
        releaseTimer.current = null;
      }
    }

    function fire(kind: AttackKind): boolean {
      // Parity: makeFighter's basic()/special() only arm from 'idle'.
      if (modeRef.current !== "idle") return false;
      const key = `${cls}/${job}`;
      const atk = FX_ANCHORS[key];
      if (!atk) {
        // Anchors + strips are codegen'd from the same asset walk, so a miss
        // means a bad cls/job prop — refuse rather than crash the Sprite.
        console.warn(`[Fighter] no anchor for "${key}" — attack ignored`);
        return false;
      }
      // Special falls back to the attack anim + anchor when a job has no
      // special (fx-engine rule; currently all 40 jobs have one).
      const spc = FX_SPECIAL_ANCHORS[key];
      const anchor = kind === "special" && spc ? spc : atk;
      const fps = kind === "special" ? FX.specialFps : FX.attackFps;
      const expectedDelayMs = (anchor.release / fps) * 1000;

      // D2: schedule the release at (release / fps) s from play start instead
      // of observing the UI-thread frame index. ±1 frame drift acceptable.
      cancelRelease();
      releaseTimer.current = setTimeout(() => {
        releaseTimer.current = null;
        onReleaseRef.current?.({ kind, cls, job, anchor, expectedDelayMs });
      }, expectedDelayMs);

      setPlayKey((k) => k + 1);
      go(kind === "special" ? "special" : "attack");
      return true;
    }

    // ≙ makeFighter.setJob: on cls/job change, abandon any in-flight swing
    // (cancel its scheduled release) and re-enter idle — preserving rest.
    const jobKey = `${cls}/${job}`;
    const mountedJobKey = useRef(jobKey);
    useEffect(() => {
      if (mountedJobKey.current === jobKey) return; // initial mount: no-op
      mountedJobKey.current = jobKey;
      cancelRelease();
      go(restingRef.current ? "rest" : "idle");
      // (When mode is unchanged — e.g. rest→rest — Sprite still restarts the
      // new job's loop from frame 0 because animKey changed, matching
      // makeFighter's frame = 0 reset.)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobKey]);

    // ≙ f.destroy(): kill the pending release on unmount.
    useEffect(() => cancelRelease, []);

    // No dependency array: the handle closes over this render's cls/job, so
    // rebuild it every render — recreating 4 closures is trivially cheap and
    // rules stale props out entirely.
    useImperativeHandle(ref, () => ({
      basic: () => fire("basic"),
      special: () => fire("special"),
      setResting: (on: boolean) => {
        restingRef.current = on;
        if (on && modeRef.current === "idle") go("rest");
        else if (!on && modeRef.current === "rest") go("idle");
        // Mid-swing: the one-shot completes; handleDone honors the request.
      },
      getMode: () => modeRef.current,
    }));

    // One-shot swing finished (Sprite held the last frame, then onDone):
    // return to idle, or straight to rest if requested mid-swing.
    const handleDone = () => go(restingRef.current ? "rest" : "idle");

    // Special anim falls back to the attack strip when absent (see fire()).
    const animName =
      mode === "special" && !FX_SPECIAL_ANCHORS[jobKey] ? "attack" : mode;
    // Template keys can't be narrowed to the generated SpriteKey union; the
    // FX_ANCHORS guard in fire() + shared codegen walk make the cast safe.
    const animKey = `${cls}/${job}/${animName}` as SpriteKey;
    const fps =
      mode === "idle"
        ? FX.idleFps
        : mode === "rest"
          ? FX.restFps
          : mode === "special"
            ? FX.specialFps
            : FX.attackFps;
    const looping = mode === "idle" || mode === "rest";

    return (
      <Sprite
        animKey={animKey}
        fps={fps}
        loop={looping}
        playKey={playKey}
        onDone={looping ? undefined : handleDone}
        style={style}
      />
    );
  },
);

export default Fighter;
