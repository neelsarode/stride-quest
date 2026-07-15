// =============================================================================
// Button — baked face + engraved label / emblem, pressed = content shifts down
// 1 art px (spec §5; the face PNG is identical pressed, the kit's hi-fi layer
// has no separate pressed art). Two shapes:
//   • stretch (default): a 3-slice btn_gold / btn_silver face at any width, sized
//     to fit an engraved label (or an explicit `width`).
//   • fixed: a baked face asset (btn_deploy_gold 56×37, btn_nav_silver 18×18,
//     btn_collect_silver 24×24, btn_close_gold 15×14) — pass `asset` + children.
// Content (label and/or children) is centred and shifts down on press.
// =============================================================================
import React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Frame } from "./Frame";
import { BakedImage, artDims } from "./Baked";
import { PixelText } from "./PixelText";
import { measurePixelText } from "./PixelText";
import { UI_PALETTE } from "./theme";
import { type UiAssetKey } from "./uiMap";
import { useResolvedScale } from "./scale";

export type ButtonMaterial = "gold" | "silver";

// Engrave colours per material: dark ink on top, lit rim beneath (kit engrave).
const ENGRAVE: Record<ButtonMaterial, { color: string; rim: string }> = {
  gold: { color: UI_PALETTE.outline, rim: UI_PALETTE.gold_light },
  silver: { color: UI_PALETTE.outline, rim: UI_PALETTE.silver_rim },
};
const SLICE = { gold: "btn_gold", silver: "btn_silver" } as const;
const SLICE_H = 16; // btn_gold / btn_silver frame height (art px)

export interface ButtonProps {
  onPress?: () => void;
  disabled?: boolean;
  /** Stretch-face material (ignored when `asset` is set). Default silver. */
  material?: ButtonMaterial;
  /** Engraved label (stretch shape auto-sizes to it). */
  label?: string;
  /** Label art scale (2 = the kit's big "?" button). Default 1. */
  labelScale?: number;
  /** Explicit stretch width (art px). Default = fit the label. */
  width?: number;
  /** Fixed baked face asset — overrides the stretch shape. */
  asset?: Extract<
    UiAssetKey,
    "btn_deploy_gold" | "btn_nav_silver" | "btn_collect_silver" | "btn_close_gold"
  >;
  /** Custom content (icon sprites); centred, shifts down on press. */
  children?: React.ReactNode;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  onPress,
  disabled,
  material = "silver",
  label,
  labelScale = 1,
  width,
  asset,
  children,
  scale,
  style,
}: ButtonProps) {
  const s = useResolvedScale(scale);

  // Face geometry (art px).
  let faceW: number;
  let faceH: number;
  let face: React.ReactNode;
  // Fixed-asset faces are always gold or silver engrave by their name.
  const engMat: ButtonMaterial =
    asset != null
      ? asset.includes("gold")
        ? "gold"
        : "silver"
      : material;

  if (asset != null) {
    const d = artDims(asset);
    faceW = d.w;
    faceH = d.h;
    face = <BakedImage name={asset} scale={s} />;
  } else {
    const labelW = label ? measurePixelText(label) * labelScale : 0;
    faceW = width ?? Math.max(2 * 9 + 1, labelW + 12); // capW=9 → min stretch
    faceH = SLICE_H;
    face = <Frame slice={SLICE[material]} length={faceW} scale={s} />;
  }

  const eng = ENGRAVE[engMat];

  return (
    <Pressable onPress={onPress} disabled={disabled} style={style}>
      {({ pressed }) => (
        <View style={{ width: faceW * s, height: faceH * s }}>
          {face}
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ translateY: (pressed ? 1 : 0) * s }],
            }}
          >
            {label != null && (
              <PixelText
                text={label}
                variant="engraved"
                color={eng.color}
                rimColor={eng.rim}
                scale={s * labelScale}
              />
            )}
            {children}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default Button;
