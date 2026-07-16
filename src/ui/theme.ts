// GENERATED — regen via ui-export-rig.html + npm run pack-ui, never hand-edit.
// (scripts/pack-ui.mjs decodes ui-export.json. Single source of truth is the
// procedural kit assets/ui-kit.js — a kit change means: rerun the rig, then
// `npm run pack-ui`, then diff. Same house rule as fx-anchors / pack-sprites.)
//
// Everything the runtime primitives (src/ui/*.tsx, built in STR-64) need that is
// NOT a PNG: palette hexes for plain View fills, bar-fill families, well insets,
// state colours, the modal scrim, full-body portrait crops, bitmap-font metrics,
// 3-slice/ring assembly metadata, and art dims. All baked for S8 CELESTIAL
// SILVER (spec §3/§10-Q3). Colour meaning: wells bake dark into the PNG; these
// fills overlay INSIDE them at runtime (spec §5).

/** Hexes for plain View fills / borders that pair with the baked chrome. */
export const UI_PALETTE = {
  "white": "#f7f3e7",
  "outline": "#15110f",
  "night_w": "#1a2942",
  "night_wd": "#131f33",
  "silver_rim": "#e8eef4",
  "silver_dark": "#67727f",
  "gold_light": "#ffe9a0",
  "gold_mid": "#f4c95a",
  "gold_dark": "#a6761f",
  "sky_light": "#e9f4ff",
  "sky_mid": "#a9c8e6",
  "sky_dark": "#6485a8",
  "red_light": "#ff9a78"
} as const;

/** Bar-fill families (light top / mid body / dark bottom) + ghost & flash.
 *  Which bar uses which family is a zone decision (boss=gold, fuel/xp=sky, …). */
export const UI_FILLS = {
  "gold": {
    "light": "#ffe9a0",
    "mid": "#f4c95a",
    "dark": "#a6761f"
  },
  "sky": {
    "light": "#e9f4ff",
    "mid": "#a9c8e6",
    "dark": "#6485a8"
  },
  "green": {
    "light": "#9ae06b",
    "mid": "#46b34e",
    "dark": "#256e30"
  },
  "yellow": {
    "light": "#ffe08a",
    "mid": "#f0b43c",
    "dark": "#9c6d1e"
  },
  "red": {
    "light": "#ff9a78",
    "mid": "#dd4632",
    "dark": "#7e2418"
  },
  "ghost": "#ff9a78",
  "flash": "#f7f3e7"
} as const;

/** Inset a fill View into a baked well: x/y offset, dw/dh shrink, corner radius
 *  (art px). slim = 3px frame (xp/fuel); full = 6px frame (boss/plate). */
export const WELL_INSETS = {
  "slim": {
    "x": 3,
    "y": 3,
    "dw": 6,
    "dh": 6,
    "radius": 2
  },
  "full": {
    "x": 6,
    "y": 6,
    "dw": 12,
    "dh": 12,
    "radius": 2
  }
} as const;

/** Hero fuel-state dot / label colours (resting is dignified sky, never red;
 *  a RESTING teammate's rally call-to-action is the separate red 'rally'). */
export const STATE_COLORS = {
  "battling": "#46b34e",
  "winded": "#f0b43c",
  "resting": "#a9c8e6",
  "rally": "#dd4632"
} as const;

/** Dim behind popovers / sheets / modals (tap-to-close surface). */
export const SCRIM = {
  "modal": "rgba(6,8,12,0.6)"
} as const;

/** Full-body sprite crops (source px) so a character fills a portrait well —
 *  ported 1:1 from ui-kit's PORTRAIT_CROPS (sprites carry transparent padding;
 *  never assume the character fills the file). Keyed by class + warrior_j2. */
export const PORTRAIT_CROPS: Record<string, { x: number; y: number; s: number }> =
  {
  "warrior": {
    "x": 31,
    "y": 31,
    "s": 68
  },
  "mage": {
    "x": 26,
    "y": 28,
    "s": 67
  },
  "medic": {
    "x": 32,
    "y": 32,
    "s": 67
  },
  "archer": {
    "x": 30,
    "y": 31,
    "s": 68
  },
  "assassin": {
    "x": 30,
    "y": 31,
    "s": 69
  },
  "paladin": {
    "x": 30,
    "y": 30,
    "s": 71
  },
  "bard": {
    "x": 30,
    "y": 31,
    "s": 69
  },
  "warlock": {
    "x": 30,
    "y": 31,
    "s": 69
  },
  "warrior_j2": {
    "x": 27,
    "y": 29,
    "s": 68
  }
};

/** Bitmap-font metrics for <PixelText> (STR-64). Two atlases:
 *  - white:    5px tall, glyph cell = {x, w} px, advance = w + letterSpacing.
 *  - outlined: 7px tall, glyph cell = {x, w=inkW+2*pad} px with the ink inset by
 *    `pad`; render the cell at (cursor - pad) so the baked 1px outline overlaps
 *    the letter-spacing gap → identical visual advance (inkW + letterSpacing). */
export interface FontAtlasMetrics {
  glyphs: Record<string, { x: number; w: number }>;
  letterSpacing: number;
  lineHeight: number;
  pad: number;
}
export const FONT_METRICS: { white: FontAtlasMetrics; outlined: FontAtlasMetrics } =
  {
  "white": {
    "glyphs": {
      "0": {
        "x": 0,
        "w": 3
      },
      "1": {
        "x": 4,
        "w": 3
      },
      "2": {
        "x": 8,
        "w": 3
      },
      "3": {
        "x": 12,
        "w": 3
      },
      "4": {
        "x": 16,
        "w": 3
      },
      "5": {
        "x": 20,
        "w": 3
      },
      "6": {
        "x": 24,
        "w": 3
      },
      "7": {
        "x": 28,
        "w": 3
      },
      "8": {
        "x": 32,
        "w": 3
      },
      "9": {
        "x": 36,
        "w": 3
      },
      "A": {
        "x": 40,
        "w": 3
      },
      "B": {
        "x": 44,
        "w": 3
      },
      "C": {
        "x": 48,
        "w": 3
      },
      "D": {
        "x": 52,
        "w": 3
      },
      "E": {
        "x": 56,
        "w": 3
      },
      "F": {
        "x": 60,
        "w": 3
      },
      "G": {
        "x": 64,
        "w": 4
      },
      "H": {
        "x": 69,
        "w": 3
      },
      "I": {
        "x": 73,
        "w": 3
      },
      "J": {
        "x": 77,
        "w": 3
      },
      "K": {
        "x": 81,
        "w": 3
      },
      "L": {
        "x": 85,
        "w": 3
      },
      "M": {
        "x": 89,
        "w": 5
      },
      "N": {
        "x": 95,
        "w": 4
      },
      "O": {
        "x": 100,
        "w": 4
      },
      "P": {
        "x": 105,
        "w": 3
      },
      "Q": {
        "x": 109,
        "w": 4
      },
      "R": {
        "x": 114,
        "w": 3
      },
      "S": {
        "x": 118,
        "w": 3
      },
      "T": {
        "x": 122,
        "w": 3
      },
      "U": {
        "x": 126,
        "w": 3
      },
      "V": {
        "x": 130,
        "w": 3
      },
      "W": {
        "x": 134,
        "w": 5
      },
      "X": {
        "x": 140,
        "w": 3
      },
      "Y": {
        "x": 144,
        "w": 3
      },
      "Z": {
        "x": 148,
        "w": 3
      },
      " ": {
        "x": 152,
        "w": 2
      },
      ".": {
        "x": 155,
        "w": 1
      },
      ",": {
        "x": 157,
        "w": 2
      },
      "!": {
        "x": 160,
        "w": 1
      },
      "-": {
        "x": 162,
        "w": 3
      },
      "+": {
        "x": 166,
        "w": 3
      },
      "/": {
        "x": 170,
        "w": 3
      },
      ":": {
        "x": 174,
        "w": 1
      },
      "%": {
        "x": 176,
        "w": 3
      },
      "?": {
        "x": 180,
        "w": 3
      }
    },
    "letterSpacing": 1,
    "lineHeight": 5,
    "pad": 0
  },
  "outlined": {
    "glyphs": {
      "0": {
        "x": 0,
        "w": 5
      },
      "1": {
        "x": 6,
        "w": 5
      },
      "2": {
        "x": 12,
        "w": 5
      },
      "3": {
        "x": 18,
        "w": 5
      },
      "4": {
        "x": 24,
        "w": 5
      },
      "5": {
        "x": 30,
        "w": 5
      },
      "6": {
        "x": 36,
        "w": 5
      },
      "7": {
        "x": 42,
        "w": 5
      },
      "8": {
        "x": 48,
        "w": 5
      },
      "9": {
        "x": 54,
        "w": 5
      },
      "A": {
        "x": 60,
        "w": 5
      },
      "B": {
        "x": 66,
        "w": 5
      },
      "C": {
        "x": 72,
        "w": 5
      },
      "D": {
        "x": 78,
        "w": 5
      },
      "E": {
        "x": 84,
        "w": 5
      },
      "F": {
        "x": 90,
        "w": 5
      },
      "G": {
        "x": 96,
        "w": 6
      },
      "H": {
        "x": 103,
        "w": 5
      },
      "I": {
        "x": 109,
        "w": 5
      },
      "J": {
        "x": 115,
        "w": 5
      },
      "K": {
        "x": 121,
        "w": 5
      },
      "L": {
        "x": 127,
        "w": 5
      },
      "M": {
        "x": 133,
        "w": 7
      },
      "N": {
        "x": 141,
        "w": 6
      },
      "O": {
        "x": 148,
        "w": 6
      },
      "P": {
        "x": 155,
        "w": 5
      },
      "Q": {
        "x": 161,
        "w": 6
      },
      "R": {
        "x": 168,
        "w": 5
      },
      "S": {
        "x": 174,
        "w": 5
      },
      "T": {
        "x": 180,
        "w": 5
      },
      "U": {
        "x": 186,
        "w": 5
      },
      "V": {
        "x": 192,
        "w": 5
      },
      "W": {
        "x": 198,
        "w": 7
      },
      "X": {
        "x": 206,
        "w": 5
      },
      "Y": {
        "x": 212,
        "w": 5
      },
      "Z": {
        "x": 218,
        "w": 5
      },
      " ": {
        "x": 224,
        "w": 4
      },
      ".": {
        "x": 229,
        "w": 3
      },
      ",": {
        "x": 233,
        "w": 4
      },
      "!": {
        "x": 238,
        "w": 3
      },
      "-": {
        "x": 242,
        "w": 5
      },
      "+": {
        "x": 248,
        "w": 5
      },
      "/": {
        "x": 254,
        "w": 5
      },
      ":": {
        "x": 260,
        "w": 3
      },
      "%": {
        "x": 264,
        "w": 5
      },
      "?": {
        "x": 270,
        "w": 5
      }
    },
    "letterSpacing": 1,
    "lineHeight": 7,
    "pad": 1
  }
};

/** 3-slice / ring assembly metadata.
 *  - axis 'h': stretch `<name>_mid` (1 art px wide) between `_left`/`_right`
 *    caps (capW art px each); frame height `h`.
 *  - axis 'v': stretch `<name>_mid` (1 art px tall) between `_top`/`_bottom`
 *    caps (capH art px each); fixed frame width `w`.
 *  - kind 'ringstrip': `frames` cells of `frameW`×`frameH`, pick cell i for
 *    fill fraction i/(frames-1) (Sprite.tsx strip technique).
 *  Speckles/glint live on the caps only — the stretch mid is uniform (spec §5). */
export const UI_SLICES = {
  "bar_full": {
    "axis": "h",
    "h": 20,
    "capW": 10,
    "parts": [
      "bar_full_left",
      "bar_full_mid",
      "bar_full_right"
    ]
  },
  "bar_slim": {
    "axis": "h",
    "h": 14,
    "capW": 9,
    "parts": [
      "bar_slim_left",
      "bar_slim_mid",
      "bar_slim_right"
    ]
  },
  "btn_gold": {
    "axis": "h",
    "h": 16,
    "capW": 9,
    "parts": [
      "btn_gold_left",
      "btn_gold_mid",
      "btn_gold_right"
    ]
  },
  "btn_silver": {
    "axis": "h",
    "h": 16,
    "capW": 9,
    "parts": [
      "btn_silver_left",
      "btn_silver_mid",
      "btn_silver_right"
    ]
  },
  "btn_super_gold": {
    "axis": "h",
    "h": 26,
    "capW": 9,
    "parts": [
      "btn_super_gold_left",
      "btn_super_gold_mid",
      "btn_super_gold_right"
    ]
  },
  "plate_silver": {
    "axis": "h",
    "h": 12,
    "capW": 7,
    "parts": [
      "plate_silver_left",
      "plate_silver_mid",
      "plate_silver_right"
    ]
  },
  "banner_gold": {
    "axis": "h",
    "h": 23,
    "capW": 12,
    "parts": [
      "banner_gold_left",
      "banner_gold_mid",
      "banner_gold_right"
    ]
  },
  "chip_green": {
    "axis": "h",
    "h": 10,
    "capW": 7,
    "parts": [
      "chip_green_left",
      "chip_green_mid",
      "chip_green_right"
    ]
  },
  "chip_red": {
    "axis": "h",
    "h": 10,
    "capW": 7,
    "parts": [
      "chip_red_left",
      "chip_red_mid",
      "chip_red_right"
    ]
  },
  "chip_gold": {
    "axis": "h",
    "h": 10,
    "capW": 7,
    "parts": [
      "chip_gold_left",
      "chip_gold_mid",
      "chip_gold_right"
    ]
  },
  "toast_silver": {
    "axis": "h",
    "h": 13,
    "capW": 8,
    "parts": [
      "toast_silver_left",
      "toast_silver_mid",
      "toast_silver_right"
    ]
  },
  "tooltip_silver": {
    "axis": "h",
    "h": 11,
    "capW": 6,
    "parts": [
      "tooltip_silver_left",
      "tooltip_silver_mid",
      "tooltip_silver_right"
    ]
  },
  "steps_ring": {
    "kind": "ringstrip",
    "frames": 33,
    "frameW": 30,
    "frameH": 30
  },
  "popover_silver": {
    "axis": "v",
    "w": 132,
    "capH": 8,
    "parts": [
      "popover_silver_top",
      "popover_silver_mid",
      "popover_silver_bottom"
    ]
  },
  "modal_silver": {
    "axis": "v",
    "w": 146,
    "capH": 12,
    "parts": [
      "modal_silver_top",
      "modal_silver_mid",
      "modal_silver_bottom"
    ]
  }
} as const;

/** Art-pixel dimensions of every baked component (before the ×2/×4/×6 device
 *  scale). Slice parts carry their own dims; a mid is 1px on its stretch axis. */
export const UI_DIMS = {
  "bar_full_left": {
    "w": 10,
    "h": 20
  },
  "bar_full_mid": {
    "w": 1,
    "h": 20
  },
  "bar_full_right": {
    "w": 10,
    "h": 20
  },
  "bar_slim_left": {
    "w": 9,
    "h": 14
  },
  "bar_slim_mid": {
    "w": 1,
    "h": 14
  },
  "bar_slim_right": {
    "w": 9,
    "h": 14
  },
  "btn_deploy_gold": {
    "w": 56,
    "h": 37
  },
  "btn_nav_silver": {
    "w": 18,
    "h": 18
  },
  "btn_collect_silver": {
    "w": 24,
    "h": 24
  },
  "btn_close_gold": {
    "w": 15,
    "h": 14
  },
  "btn_gold_left": {
    "w": 9,
    "h": 16
  },
  "btn_gold_mid": {
    "w": 1,
    "h": 16
  },
  "btn_gold_right": {
    "w": 9,
    "h": 16
  },
  "btn_silver_left": {
    "w": 9,
    "h": 16
  },
  "btn_silver_mid": {
    "w": 1,
    "h": 16
  },
  "btn_silver_right": {
    "w": 9,
    "h": 16
  },
  "btn_super_gold_left": {
    "w": 9,
    "h": 26
  },
  "btn_super_gold_mid": {
    "w": 1,
    "h": 26
  },
  "btn_super_gold_right": {
    "w": 9,
    "h": 26
  },
  "plate_silver_left": {
    "w": 7,
    "h": 12
  },
  "plate_silver_mid": {
    "w": 1,
    "h": 12
  },
  "plate_silver_right": {
    "w": 7,
    "h": 12
  },
  "banner_gold_left": {
    "w": 12,
    "h": 23
  },
  "banner_gold_mid": {
    "w": 1,
    "h": 23
  },
  "banner_gold_right": {
    "w": 12,
    "h": 23
  },
  "chip_green_left": {
    "w": 7,
    "h": 10
  },
  "chip_green_mid": {
    "w": 1,
    "h": 10
  },
  "chip_green_right": {
    "w": 7,
    "h": 10
  },
  "chip_red_left": {
    "w": 7,
    "h": 10
  },
  "chip_red_mid": {
    "w": 1,
    "h": 10
  },
  "chip_red_right": {
    "w": 7,
    "h": 10
  },
  "chip_gold_left": {
    "w": 7,
    "h": 10
  },
  "chip_gold_mid": {
    "w": 1,
    "h": 10
  },
  "chip_gold_right": {
    "w": 7,
    "h": 10
  },
  "toast_silver_left": {
    "w": 8,
    "h": 13
  },
  "toast_silver_mid": {
    "w": 1,
    "h": 13
  },
  "toast_silver_right": {
    "w": 8,
    "h": 13
  },
  "tooltip_silver_left": {
    "w": 6,
    "h": 11
  },
  "tooltip_silver_mid": {
    "w": 1,
    "h": 11
  },
  "tooltip_silver_right": {
    "w": 6,
    "h": 11
  },
  "tooltip_pointer": {
    "w": 3,
    "h": 2
  },
  "badge_silver": {
    "w": 18,
    "h": 19
  },
  "portrait_18": {
    "w": 18,
    "h": 18
  },
  "portrait_20": {
    "w": 20,
    "h": 20
  },
  "portrait_22": {
    "w": 22,
    "h": 22
  },
  "portrait_30": {
    "w": 30,
    "h": 30
  },
  "dot_battling": {
    "w": 5,
    "h": 5
  },
  "dot_winded": {
    "w": 5,
    "h": 5
  },
  "dot_resting": {
    "w": 5,
    "h": 5
  },
  "dot_rally": {
    "w": 5,
    "h": 5
  },
  "beacon_dim": {
    "w": 20,
    "h": 20
  },
  "beacon_mid": {
    "w": 20,
    "h": 20
  },
  "beacon_bright": {
    "w": 20,
    "h": 20
  },
  "steps_ring": {
    "w": 990,
    "h": 30
  },
  "popover_silver_top": {
    "w": 132,
    "h": 8
  },
  "popover_silver_mid": {
    "w": 132,
    "h": 1
  },
  "popover_silver_bottom": {
    "w": 132,
    "h": 8
  },
  "modal_silver_top": {
    "w": 146,
    "h": 12
  },
  "modal_silver_mid": {
    "w": 146,
    "h": 1
  },
  "modal_silver_bottom": {
    "w": 146,
    "h": 12
  },
  "popover_arrow_top": {
    "w": 5,
    "h": 3
  },
  "popover_arrow_left": {
    "w": 3,
    "h": 5
  },
  "invite_plus": {
    "w": 8,
    "h": 8
  },
  "seg_silver": {
    "w": 101,
    "h": 13
  },
  "icon_heart": {
    "w": 7,
    "h": 6
  },
  "icon_gem": {
    "w": 7,
    "h": 5
  },
  "icon_coin": {
    "w": 8,
    "h": 8
  },
  "icon_star": {
    "w": 9,
    "h": 9
  },
  "icon_shield": {
    "w": 13,
    "h": 14
  },
  "icon_swords": {
    "w": 11,
    "h": 11
  },
  "icon_banner": {
    "w": 7,
    "h": 7
  },
  "icon_arrow_up": {
    "w": 7,
    "h": 8
  },
  "icon_arrow_right": {
    "w": 8,
    "h": 7
  },
  "icon_arrow_down": {
    "w": 7,
    "h": 8
  },
  "icon_arrow_left": {
    "w": 8,
    "h": 7
  },
  "font_white": {
    "w": 183,
    "h": 5
  },
  "font_white_outlined": {
    "w": 275,
    "h": 7
  }
} as const;
