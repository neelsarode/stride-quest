// =============================================================================
// FeedbackProvider — hosts the transient feedback overlay (floating numbers,
// banners, toasts) and exposes emit(event). Mounted once at the app root, ABOVE
// the screen, so its overlay covers everything. Game logic never imports this;
// only view code calls useFeedback().emit(...).
// =============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import type { FeedbackEvent } from "./events";
import { treatmentFor } from "./treatments";
import type { BannerVariant } from "../config/assets";
import { FloatingNumber } from "../components/FloatingNumber";
import { Banner } from "../components/Banner";
import { Toast } from "../components/Toast";

type FloatInst = { id: number; text: string; color: string; size: number };
type BannerInst = { id: number; variant: BannerVariant; title: string; subtitle?: string };
type ToastInst = { id: number; message: string; tone: "info" | "good" };

type Listener = (e: FeedbackEvent) => void;

const Ctx = createContext<{
  emit: (e: FeedbackEvent) => void;
  /** Low-level stream tap — prefer useFeedbackEvent(). */
  subscribe: (fn: Listener) => () => void;
}>({ emit: () => {}, subscribe: () => () => {} });

export function useFeedback() {
  return useContext(Ctx);
}

/**
 * Subscribe to the raw event stream (STR-22): every emit() reaches the
 * handler AFTER the overlay treatments run, so richer consumers (the battle
 * scene) react to the same semantic events without the overlay changing.
 * The latest handler is always called — no re-subscription churn.
 */
export function useFeedbackEvent(handler: Listener) {
  const { subscribe } = useContext(Ctx);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const idRef = useRef(0);
  const [floats, setFloats] = useState<FloatInst[]>([]);
  const [banners, setBanners] = useState<BannerInst[]>([]);
  const [toasts, setToasts] = useState<ToastInst[]>([]);
  const listeners = useRef(new Set<Listener>());

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const emit = useCallback((e: FeedbackEvent) => {
    const t = treatmentFor(e);
    if (t.floating) {
      const id = idRef.current++;
      setFloats((f) => [...f, { id, ...t.floating! }]);
    }
    if (t.banner) {
      const id = idRef.current++;
      setBanners((b) => [...b, { id, ...t.banner! }]);
    }
    if (t.toast) {
      const id = idRef.current++;
      setToasts((s) => [...s, { id, ...t.toast! }]);
    }
    // Stream tap (STR-22): the battle scene consumes the same events.
    listeners.current.forEach((fn) => fn(e));
  }, []);

  const rmFloat = useCallback((id: number) => setFloats((f) => f.filter((x) => x.id !== id)), []);
  const rmBanner = useCallback((id: number) => setBanners((b) => b.filter((x) => x.id !== id)), []);
  const rmToast = useCallback((id: number) => setToasts((s) => s.filter((x) => x.id !== id)), []);

  const ctxValue = useMemo(() => ({ emit, subscribe }), [emit, subscribe]);

  return (
    <Ctx.Provider value={ctxValue}>
      {children}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.bannerZone}>
          {banners.map((b) => (
            <Banner key={b.id} {...b} onDone={rmBanner} />
          ))}
        </View>
        <View style={styles.floatZone}>
          {floats.map((f) => (
            <View key={f.id} style={{ transform: [{ translateX: ((f.id * 53) % 80) - 40 }] }}>
              <FloatingNumber {...f} onDone={rmFloat} />
            </View>
          ))}
        </View>
        <View style={styles.toastZone}>
          {toasts.map((t) => (
            <Toast key={t.id} {...t} onDone={rmToast} />
          ))}
        </View>
      </View>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center" },
  // Announcements (boss defeated / JOB UP! / rally / …) center VERTICALLY in the
  // screen (owner request 2026-07-20) — the old top:80 anchor overlapped the top
  // HUD band (identity / fuel / boss plate). Fills the overlay and centers so a
  // banner (+ optional subtitle) sits mid-screen, clear of every zone.
  bannerZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  floatZone: { position: "absolute", top: "32%", alignItems: "center" },
  toastZone: { position: "absolute", bottom: 48, width: "100%", alignItems: "center" },
});
