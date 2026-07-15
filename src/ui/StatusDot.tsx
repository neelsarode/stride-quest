// =============================================================================
// StatusDot — the 5×5 hero fuel-state orb (spec §5). Four baked variants keyed
// off state; resting is a dignified sky, never red — a resting teammate's red
// call-to-action is the separate rally beacon (theme STATE_COLORS).
// =============================================================================
import { type StyleProp, type ImageStyle } from "react-native";
import { BakedImage } from "./Baked";

export type HeroState = "battling" | "winded" | "resting" | "rally";

const ASSET = {
  battling: "dot_battling",
  winded: "dot_winded",
  resting: "dot_resting",
  rally: "dot_rally",
} as const;

export interface StatusDotProps {
  state: HeroState;
  scale?: number;
  style?: StyleProp<ImageStyle>;
}

export function StatusDot({ state, scale, style }: StatusDotProps) {
  return <BakedImage name={ASSET[state]} scale={scale} style={style} />;
}

export default StatusDot;
