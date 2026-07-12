// Live "pending idle damage" ticker. The server is authoritative on COLLECT; this
// is a display-only projection that extrapolates from the server's idle fields +
// effective clock, ticking every second so the player sees idle accruing.
import { useEffect, useRef, useState } from "react";

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

  // Re-sync the reference whenever the server sends fresh idle data.
  useEffect(() => {
    if (idle && serverNow != null) {
      ref.current = {
        last: idle.lastIdleCollectedAt,
        dph: idle.dph,
        cap: idle.capMs,
        serverNow,
        recvAt: Date.now(),
      };
    }
  }, [idle?.lastIdleCollectedAt, idle?.dph, idle?.capMs, serverNow]);

  useEffect(() => {
    const tick = () => {
      const r = ref.current;
      if (!r) return;
      const displayNow = r.serverNow + (Date.now() - r.recvAt);
      const elapsed = Math.min(Math.max(0, displayNow - r.last), r.cap);
      setPending(Math.floor((elapsed / 3_600_000) * r.dph));
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, []);

  return pending;
}
