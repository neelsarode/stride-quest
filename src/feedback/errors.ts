// Friendly message from a server rejection (STR-14/15): user-facing Convex
// mutations throw ConvexError with a structured {code, message} payload
// written for players (the STR-44/53 pattern). Anything else falls back to a
// generic line rather than leaking an internal error string into the UI.
import { ConvexError } from "convex/values";

export function friendlyError(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { message?: string } | string;
    const msg = typeof data === "string" ? data : data?.message;
    if (msg) return msg;
  }
  return "That didn't go through — give it another try in a moment.";
}
