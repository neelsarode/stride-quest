// A top announcement banner (job-up / boss-defeated / overdrive / rally / …).
// Slides in, holds, slides out, then self-removes. The CHOREOGRAPHY is unchanged
// (ANIM.banner* timings + the translateY/opacity curve) — STR-70 only swaps the
// CHROME: the old coloured box + emoji glyph becomes the hi-fi kit's gold
// engraved `banner_gold` face (kit hifiBanner) with the title engraved onto it,
// and the secondary line as an outlined <PixelText> beneath (readable over the
// live battle scene). Every announcement uses the single gold banner face — the
// only baked banner chrome — so the per-variant bg/fg/icon presets are retired;
// `variant` stays in the props for the event-API contract (FeedbackProvider
// spreads it) but no longer selects colours.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { ANIM } from "../config/assets";
import type { BannerVariant } from "../config/assets";
import { Frame, PixelText, measurePixelText, useUIScale } from "../ui";
import { UI_PALETTE } from "../ui/theme";
import { atlasText } from "./atlasText";

// banner_gold 3-slice geometry (art px) — mirrors theme UI_SLICES.banner_gold.
const BANNER_CAP = 12; // capW → min length = 2*capW + 1
const BANNER_PAD = 14; // art px each side of the engraved title (chunky face)
const SUBTITLE_GAP = 3; // art px between the gold face and the outlined subtitle

export function Banner({
  variant: _variant,
  id,
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
  const s = useUIScale();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: ANIM.bannerInMs, useNativeDriver: false }),
      Animated.delay(ANIM.bannerHoldMs),
      Animated.timing(t, { toValue: 0, duration: ANIM.bannerOutMs, useNativeDriver: false }),
    ]).start(() => onDone(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = atlasText(title);
  const sub = subtitle ? atlasText(subtitle) : undefined;
  // Engraved width == the white-atlas advance; pad + floor to the min 3-slice.
  const titleW = measurePixelText(label, "engraved");
  const bannerW = Math.max(2 * BANNER_CAP + 1, titleW + 2 * BANNER_PAD);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] });
  return (
    <Animated.View style={[styles.wrap, { opacity: t, transform: [{ translateY }] }]}>
      <Frame slice="banner_gold" length={bannerW}>
        <View style={styles.face}>
          {/* Gold engrave: dark ink on top, lit gold ledge one art px below. */}
          <PixelText
            text={label}
            variant="engraved"
            color={UI_PALETTE.outline}
            rimColor={UI_PALETTE.gold_light}
          />
        </View>
      </Frame>
      {sub ? (
        <View style={{ marginTop: SUBTITLE_GAP * s }}>
          <PixelText text={sub} variant="outlined" />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  face: { flex: 1, alignItems: "center", justifyContent: "center" },
});
