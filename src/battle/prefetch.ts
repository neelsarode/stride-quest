// =============================================================================
// prefetchRosterStrips — first-play decode-jank mitigation (plan §Perf risks,
// STR-23): warm the image cache for exactly the strips the CURRENT roster can
// show (each hero's idle/rest/attack/special + their class's three effect
// strips + the boss idle), instead of all ~220 packed strips. Fire-and-forget;
// a strip that fails to warm simply decodes on first play like before.
// =============================================================================
import { Image } from "react-native";
import type { SceneHero } from "./BattleScene";
import type { BossKey } from "./Boss";
import { SPRITES } from "./spriteMap";

const HERO_ANIMS = ["idle", "rest", "attack", "special"] as const;
const EFFECT_KINDS = ["basic", "special", "impact"] as const;

/**
 * A packed-strip `require()` resolves differently per platform: a URL string
 * (Metro web), an `{ uri }` object, or an opaque asset id that native RN
 * resolves via Image.resolveAssetSource (react-native-web doesn't ship it,
 * hence the feature check).
 */
function uriOf(mod: unknown): string | null {
  if (typeof mod === "string") return mod;
  if (mod && typeof mod === "object" && "uri" in mod) {
    const uri = (mod as { uri?: unknown }).uri;
    return typeof uri === "string" ? uri : null;
  }
  const resolve = (
    Image as unknown as {
      resolveAssetSource?: (m: unknown) => { uri?: string } | null;
    }
  ).resolveAssetSource;
  if (typeof resolve === "function") return resolve(mod)?.uri ?? null;
  return null;
}

// Session-lifetime memo: each strip is warmed at most once.
const warmed = new Set<string>();

export function prefetchRosterStrips(
  heroes: readonly SceneHero[],
  bossKey: BossKey,
): void {
  const keys = new Set<string>();
  for (const h of heroes) {
    for (const anim of HERO_ANIMS) keys.add(`${h.cls}/${h.job}/${anim}`);
    for (const kind of EFFECT_KINDS) keys.add(`effects/${h.cls}/${kind}`);
  }
  keys.add(`bosses/${bossKey}/idle`);

  for (const key of keys) {
    if (warmed.has(key)) continue;
    const mod = (SPRITES as Record<string, unknown>)[key];
    if (!mod) continue; // manifest gap — decode on demand instead
    warmed.add(key);
    const uri = uriOf(mod);
    if (!uri) continue;
    try {
      void Image.prefetch(uri)?.catch?.(() => {});
    } catch {
      // never let cache warming break the scene
    }
  }
}
