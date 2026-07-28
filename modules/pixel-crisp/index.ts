// PixelCrisp — a native pass-through container that renders its RN <Image>
// children with NEAREST-NEIGHBOR scaling, so pixel art stays crisp on iOS
// instead of getting iOS's default bilinear smoothing when upscaled.
//
// Why native: react-native-web applies `image-rendering: pixelated` (crisp) on
// web, but RN's iOS <Image> exposes no equivalent — the scaled sprites render
// smoothed (documented in src/battle/Sprite.tsx). This local Expo module sets
// `magnificationFilter = .nearest` on its layer subtree while REUSING RN's own
// image loading (children are ordinary <Image>s).
//
// iOS-only: everywhere else this is just a plain <View> (web crispness already
// comes from the PIXELATED CSS in Sprite.tsx), so callers can use it
// unconditionally. requireNativeView is evaluated ONLY on iOS (ternary
// short-circuit), so the native lookup never runs where the view isn't linked.
import type { ComponentType } from "react";
import { Platform, View, type ViewProps } from "react-native";
import { requireNativeView } from "expo";

export const PixelCrisp: ComponentType<ViewProps> =
  Platform.OS === "ios" ? requireNativeView<ViewProps>("PixelCrisp") : View;

export default PixelCrisp;
