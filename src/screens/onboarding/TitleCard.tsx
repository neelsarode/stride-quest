// =============================================================================
// Beat 0 — "Summoning." (STR-45; onboarding spec §Flow Beat 0; comp TITLE beat)
// =============================================================================
// The opening scene: the crossed-swords emblem + WALKPG wordmark over the
// battlefield while anonymous sign-in (and, at the end of the flow, the
// completeOnboarding stamp) runs behind it. Under ~2s, nothing to tap — it
// routes itself away when the server state settles.
//
// Pixel-kit skin (STR-88): the comp's battlefield background + the baked bitmap
// font (PixelText) + the crossed-swords icon, replacing the old flat-dark /
// system-font placeholder. Shares OnboardingBackground with the other beats.
// =============================================================================
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { BakedImage, PixelText, UIScaleProvider, measurePixelText } from "../../ui";
import { UI_PALETTE } from "../../ui/theme";
import { ART_SCALE_BREAKPOINT_DP } from "../../config/assets";
import { OnboardingBackground } from "./OnboardingBackground";

export function TitleCard() {
  const { width } = useWindowDimensions();
  const artScale = width < ART_SCALE_BREAKPOINT_DP ? 2 : 3;
  // Wordmark: big, but capped so it always fits the width.
  const wordScale = Math.max(
    artScale,
    Math.min(artScale * 4, Math.floor((width - 48) / measurePixelText("WALKPG"))),
  );
  const emblemScale = Math.round(artScale * 2.5);

  return (
    <OnboardingBackground>
      <UIScaleProvider value={artScale}>
        <View style={styles.center}>
          <BakedImage name="icon_swords" scale={emblemScale} />
          <View style={{ alignItems: "center", marginTop: 8 * artScale }}>
            <PixelText text="WALKPG" color={UI_PALETTE.gold_light} scale={wordScale} />
          </View>
          <PixelText
            text="WALK TOGETHER. FIGHT TOGETHER."
            color={UI_PALETTE.white}
            scale={artScale}
            style={{ marginTop: 12 * artScale }}
          />
        </View>
        <View style={styles.summon}>
          <PixelText text="SUMMONING YOUR HERO.." color={UI_PALETTE.sky_mid} scale={artScale} />
        </View>
        <View style={styles.footer}>
          <PixelText
            text="NO ACCOUNT NEEDED - JUST WALK."
            color={UI_PALETTE.sky_mid}
            scale={artScale}
          />
        </View>
      </UIScaleProvider>
    </OnboardingBackground>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  summon: { position: "absolute", left: 0, right: 0, bottom: "22%", alignItems: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 48, alignItems: "center" },
});

export default TitleCard;
