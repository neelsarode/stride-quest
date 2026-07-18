// =============================================================================
// prefetchUiChrome — warm the image cache for the baked HUD chrome + fonts so a
// freshly-mounted surface (the game HUD, a modal, a sheet) appears ATOMICALLY
// instead of decoding in piece-by-piece. In the Metro dev build every <Image>
// source is an async HTTP fetch, so an un-warmed surface paints in progressively
// — glyph-by-glyph on labels — which reads as a cheap "typing" effect. This is
// the src/battle/prefetch.ts trick (STR-23 "first-play decode-jank") applied to
// the UI kit: warm exactly the CURRENT class's 86 components (fonts included,
// they share pool entries) once per class, fire-and-forget.
// =============================================================================
import { Image } from "react-native";
import { UI_POOL, UI_MAPS, type ClassKey } from "./uiMap";

const DEFAULT_CLASS: ClassKey = "warrior";

/** Resolve a require()'d asset to a warmable URI (dev http URL / {uri} / native
 *  asset id via resolveAssetSource; react-native-web omits the resolver). */
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

// Warm each class at most once per session.
const warmedClasses = new Set<string>();

/** Prefetch every chrome + font asset the given class renders, so its HUD and
 *  overlays mount with a warm cache (no progressive decode). Safe to call often
 *  (memoised per class) and from any screen. */
export function prefetchUiChrome(classKey?: string | null): void {
  const cls: ClassKey =
    classKey && classKey in UI_MAPS ? (classKey as ClassKey) : DEFAULT_CLASS;
  if (warmedClasses.has(cls)) return;
  warmedClasses.add(cls);

  const map = UI_MAPS[cls] as Record<string, string>;
  const seenPool = new Set<string>();
  for (const name in map) {
    const poolKey = map[name];
    if (seenPool.has(poolKey)) continue; // deduped pool → warm each file once
    seenPool.add(poolKey);
    const mod = (UI_POOL as Record<string, unknown>)[poolKey];
    const uri = uriOf(mod);
    if (!uri) continue;
    try {
      void Image.prefetch(uri)?.catch?.(() => {});
    } catch {
      // never let cache warming break a screen
    }
  }
}
