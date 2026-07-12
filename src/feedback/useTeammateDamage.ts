// Animates TEAMMATES' hits on the shared boss. The guild roster arrives via a
// reactive query, so when a teammate deploys/idles, their damage rises here and
// we fire a floating number on THIS screen — the "their hit landed on my boss"
// feel, for free, on every member's device. (Your OWN hits are animated by your
// action handlers, so we skip isMe.)
import { useEffect } from "react";
import { usePrevious } from "./usePrevious";
import { useFeedback } from "./FeedbackProvider";

type Member = { userId: string; isMe: boolean; damage: number };

export function useTeammateDamage(members: Member[] | undefined) {
  const { emit } = useFeedback();
  const prev = usePrevious(members);
  useEffect(() => {
    if (!members || !prev) return;
    const before = new Map(prev.map((m) => [m.userId, m.damage]));
    for (const m of members) {
      if (m.isMe) continue;
      const was = before.get(m.userId);
      if (was !== undefined && m.damage > was) {
        emit({ type: "damageDealt", amount: m.damage - was, source: "teammate" });
      }
    }
  }, [members, prev, emit]);
}
