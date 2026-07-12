// A top announcement banner (job-up / goal-hit / boss-defeated). Slides in, holds,
// slides out, then self-removes. Per-variant styling comes from BANNER in assets.ts.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { ANIM, BANNER, SIZES } from "../config/assets";
import type { BannerVariant } from "../config/assets";

export function Banner({
  id,
  variant,
  title,
  subtitle,
  onDone,
}: {
  id: number;
  variant: BannerVariant;
  title: string;
  subtitle?: string;
  onDone: (id: number) => void;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: ANIM.bannerInMs, useNativeDriver: false }),
      Animated.delay(ANIM.bannerHoldMs),
      Animated.timing(t, { toValue: 0, duration: ANIM.bannerOutMs, useNativeDriver: false }),
    ]).start(() => onDone(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cfg = BANNER[variant];
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] });
  return (
    <Animated.View
      style={[styles.wrap, { backgroundColor: cfg.bg, opacity: t, transform: [{ translateY }] }]}
    >
      <Text style={[styles.icon, { color: cfg.fg }]}>{cfg.icon}</Text>
      <Text style={[styles.title, { color: cfg.fg }]}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: SIZES.radius,
    minWidth: 240,
    justifyContent: "center",
  },
  icon: { fontSize: 20, fontWeight: "900" },
  title: { fontSize: 18, fontWeight: "900", letterSpacing: 1 },
  sub: { color: "#cdd3df", fontSize: 13 },
});
