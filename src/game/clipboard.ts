// =============================================================================
// copyToClipboard — cross-platform clipboard for the invite-code COPY surfaces
// (no expo-clipboard dependency), shared by the invite popover AND the guild
// sheet (STR-86: the sheet's COPY used to toast "CODE COPIED!" without writing
// anything). Lives in its own module because Overlays imports GuildSheet —
// exporting from Overlays would create an import cycle.
//
// Web uses navigator.clipboard (battlefield-ui parity); native falls back to
// the Share sheet. Resolves TRUE only when the write/share actually happened,
// so callers only toast the success line on success — and show the warm
// fallback line otherwise (calm, never red-alarm).
// =============================================================================
import { Platform, Share } from "react-native";

/** Shared toast copy (the pixel-font atlas is caps-only and has no apostrophe). */
export const CODE_COPIED_TOAST = "CODE COPIED!";
export const COPY_FAILED_TOAST = "COULD NOT COPY - JOT THE CODE DOWN";

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as unknown as {
            clipboard?: { writeText?: (t: string) => Promise<void> };
          })
        : undefined;
    if (Platform.OS === "web") {
      if (!nav?.clipboard?.writeText) return false; // e.g. insecure context
      await nav.clipboard.writeText(text);
      return true;
    }
    // Native: the share sheet is the copy surface (user can pick "Copy" there).
    const r = await Share.share({ message: text });
    return r.action === Share.sharedAction;
  } catch {
    return false;
  }
}
