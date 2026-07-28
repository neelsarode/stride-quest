// =============================================================================
// Modal — a centred dialog (HOW TO PLAY) over a full-screen scrim (spec §7, kit
// hifiModal). Baked modal_silver vertical 3-slice (fixed 146 art px wide) + a
// gold nameplate straddling the top + a gold X close button riding the top-right
// frame + content in the 6-art-px-inset well. Parent owns `visible`.
// =============================================================================
import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Frame } from "./Frame";
import { Button } from "./Button";
import { RevealGate } from "./RevealGate";
import { UI_ASSETS } from "./uiMap";
import { PixelText, measurePixelText } from "./PixelText";
import { SCRIM, UI_PALETTE, WELL_INSETS } from "./theme";
import { useResolvedScale } from "./scale";

const WIDTH = 146; // modal_silver fixed width (art px)
const INSET = WELL_INSETS.full; // hifiFrame 6px → well inset
const TITLE_BAND = 11; // gold nameplate height (art px)

// Interior CONTENT padding inside the well, art px (STR-93): the well inset is
// only the frame border — the HTML kit drew modal lines at well + 6, so without
// this, text hugs the inner bezel ring. Vertical is smaller (TITLE_BAND already
// spaces the top; consumers own their bottom margin).
const PAD_X = 5;
const PAD_Y = 2;

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Dialog height in ART px. */
  height: number;
  children?: React.ReactNode;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function Modal({
  visible,
  onClose,
  title,
  height,
  children,
  scale,
  style,
}: ModalProps) {
  const s = useResolvedScale(scale);
  if (!visible) return null;

  const titleW = title ? measurePixelText(title) : 0;
  const plateW = titleW + 16;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { alignItems: "center", justifyContent: "center" },
      ]}
    >
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM.modal }]}
        onPress={onClose}
      />
      <RevealGate
        waitFor={[UI_ASSETS.font_white, UI_ASSETS.font_white_outlined]}
        minHold={420}
        style={[{ width: WIDTH * s, height: height * s }, style]}
      >
        <Frame slice="modal_silver" length={height} scale={s} />

        {/* gold nameplate straddling the top frame band */}
        {title != null && (
          <View
            style={{
              position: "absolute",
              left: Math.round((WIDTH - plateW) / 2) * s,
              top: -2 * s,
            }}
          >
            <Frame slice="chip_gold" length={plateW} scale={s} />
            <View
              style={{
                position: "absolute",
                left: Math.round((plateW - titleW) / 2) * s,
                top: 2 * s,
              }}
            >
              <PixelText
                text={title}
                variant="engraved"
                color={UI_PALETTE.outline}
                rimColor={UI_PALETTE.gold_light}
                scale={s}
              />
            </View>
          </View>
        )}

        {/* X close riding the top-right corner */}
        <View style={{ position: "absolute", right: -2 * s, top: -3 * s }}>
          <Button asset="btn_close_gold" label="X" onPress={onClose} scale={s} />
        </View>

        {/* content well */}
        <View
          style={{
            position: "absolute",
            left: (INSET.x + PAD_X) * s,
            top: (INSET.y + TITLE_BAND + PAD_Y) * s,
            width: (WIDTH - INSET.dw - 2 * PAD_X) * s,
            height: (height - INSET.dh - TITLE_BAND - 2 * PAD_Y) * s,
          }}
        >
          {children}
        </View>
      </RevealGate>
    </View>
  );
}

export default Modal;
