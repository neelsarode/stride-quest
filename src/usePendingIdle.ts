// Live "pending idle damage" ticker. The server is authoritative on settle; this
// is a display-only projection that extrapolates from the server's idle fields +
// effective clock, ticking every second so the player sees idle accruing (and,
// via BossPlate, the boss HP number tick down live).
import { useCallback, useEffect, useRef, useState } from "react";

type Idle = { lastIdleCollectedAt: number; dph: number; capMs: number };

export function usePendingIdle(idle: Idle | undefined, serverNow: number | undefined): number {
  const ref = useRef<{
    last: number;
    dph: number;
    cap: number;
    serverNow: number;
    recvAt: number;
  } | null>(null);
  const [pending, setPending] = useState(0);

  // Recompute from the current reference + wall clock. Stable identity ([] deps),
  // so both effects below can depend on it without churning.
  const recompute = useCallback(() => {
    const r = ref.current;
    if (!r) return;
    const displayNow = r.serverNow + (Date.now() - r.recvAt);
    const elapsed = Math.min(Math.max(0, displayNow - r.last), r.cap);
    setPending(Math.floor((elapsed / 3_600_000) * r.dph));
  }, []);

  // Re-sync the reference whenever the server sends fresh idle data — and
  // recompute IMMEDIATELY in the same commit. A settle re-stamps
  // lastIdleCollectedAt (pending → ~0) in the SAME payload that drops the boss's
  // settled HP; snapping pending here (instead of waiting up to 1s for the next
  // interval) keeps BossPlate's `currentHP − pending` continuous — otherwise the
  // hours-large stale pending would briefly yank the bar toward empty on open.
  useEffect(() => {
    if (idle && serverNow != null) {
      ref.current = {
        last: idle.lastIdleCollectedAt,
        dph: idle.dph,
        cap: idle.capMs,
        serverNow,
        recvAt: Date.now(),
      };
      recompute();
    }
  }, [idle?.lastIdleCollectedAt, idle?.dph, idle?.capMs, serverNow, recompute]);

  useEffect(() => {
    recompute();
    const h = setInterval(recompute, 1000);
    return () => clearInterval(h);
  }, [recompute]);

  return pending;
}
