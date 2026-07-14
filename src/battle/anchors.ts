// GENERATED — never hand-edit. These numbers are pixel-measured from the
// non-transparent pixels of each job's animation frames; hand-tweaking them
// reintroduces the flying-backwards projectile bug the measurement exists to
// prevent (docs/fx-rn-port-plan.md, decision D3). To regenerate: rescan in the
// HTML rig (fx-test.html?scan=1) — which rewrites assets/fx-anchors.js and
// assets/fx-special-anchors.js — then run `npm run pack-sprites` to refresh
// this file from those. The HTML rig remains the only measurement path.

/**
 * One animation's projectile-release data:
 * - frames:  frame count of the animation (cross-checked against the packed
 *            strips by scripts/pack-sprites.mjs on every run)
 * - release: frame index at which the weapon is most extended — the projectile
 *            spawns when this frame shows
 * - tipX/Y:  the visible weapon-tip position as a FRACTION of the frame
 *            (never use sprite-box edges — transparent padding is why)
 */
export interface FxAnchor {
  frames: number;
  release: number;
  tipX: number;
  tipY: number;
}

/** Basic-attack anchors, one per job ("<class>/<job>"). */
export const FX_ANCHORS: Record<string, FxAnchor> = {
  "archer/1_greenhorn": { frames: 9, release: 7, tipX: 0.808, tipY: 0.45 },
  "archer/2_scout": { frames: 7, release: 6, tipX: 0.855, tipY: 0.476 },
  "archer/3_hunter": { frames: 9, release: 7, tipX: 0.867, tipY: 0.453 },
  "archer/4_ranger": { frames: 15, release: 8, tipX: 0.992, tipY: 0.476 },
  "archer/5_sentinel": { frames: 17, release: 16, tipX: 0.906, tipY: 0.477 },
  "assassin/1_footpad": { frames: 7, release: 6, tipX: 0.741, tipY: 0.517 },
  "assassin/2_prowler": { frames: 9, release: 8, tipX: 0.75, tipY: 0.523 },
  "assassin/3_nightblade": { frames: 11, release: 7, tipX: 0.831, tipY: 0.452 },
  "assassin/4_assassin": { frames: 13, release: 2, tipX: 0.806, tipY: 0.597 },
  "assassin/5_shadowlord": { frames: 17, release: 13, tipX: 0.859, tipY: 0.688 },
  "bard/1_busker": { frames: 7, release: 2, tipX: 0.726, tipY: 0.516 },
  "bard/2_minstrel": { frames: 7, release: 3, tipX: 0.767, tipY: 0.475 },
  "bard/3_troubadour": { frames: 9, release: 2, tipX: 0.667, tipY: 0.4 },
  "bard/4_bard": { frames: 11, release: 5, tipX: 0.806, tipY: 0.468 },
  "bard/5_maestro": { frames: 17, release: 16, tipX: 0.891, tipY: 0.422 },
  "mage/1_apprentice": { frames: 7, release: 3, tipX: 0.823, tipY: 0.452 },
  "mage/2_adept": { frames: 7, release: 6, tipX: 0.895, tipY: 0.532 },
  "mage/3_conjurer": { frames: 9, release: 6, tipX: 0.887, tipY: 0.653 },
  "mage/4_sorcerer": { frames: 11, release: 9, tipX: 0.875, tipY: 0.461 },
  "mage/5_archmage": { frames: 17, release: 4, tipX: 0.875, tipY: 0.35 },
  "medic/1_acolyte": { frames: 7, release: 3, tipX: 0.726, tipY: 0.589 },
  "medic/2_healer": { frames: 7, release: 4, tipX: 0.734, tipY: 0.242 },
  "medic/3_cleric": { frames: 9, release: 5, tipX: 0.825, tipY: 0.467 },
  "medic/4_priest": { frames: 11, release: 9, tipX: 0.927, tipY: 0.556 },
  "medic/5_hierophant": { frames: 17, release: 7, tipX: 0.922, tipY: 0.328 },
  "paladin/1_squire": { frames: 7, release: 6, tipX: 0.839, tipY: 0.435 },
  "paladin/2_knight": { frames: 9, release: 7, tipX: 0.883, tipY: 0.592 },
  "paladin/3_crusader": { frames: 11, release: 10, tipX: 0.892, tipY: 0.683 },
  "paladin/4_paladin": { frames: 11, release: 9, tipX: 0.887, tipY: 0.581 },
  "paladin/5_lightbringer": { frames: 17, release: 16, tipX: 0.906, tipY: 0.5 },
  "warlock/1_initiate": { frames: 7, release: 5, tipX: 0.817, tipY: 0.608 },
  "warlock/2_cultist": { frames: 7, release: 6, tipX: 0.825, tipY: 0.625 },
  "warlock/3_hexer": { frames: 9, release: 7, tipX: 0.875, tipY: 0.4 },
  "warlock/4_warlock": { frames: 11, release: 10, tipX: 0.875, tipY: 0.442 },
  "warlock/5_dreadlord": { frames: 17, release: 15, tipX: 0.898, tipY: 0.586 },
  "warrior/1_rookie": { frames: 9, release: 8, tipX: 0.927, tipY: 0.702 },
  "warrior/2_strider": { frames: 9, release: 7, tipX: 0.879, tipY: 0.524 },
  "warrior/3_vanguard": { frames: 11, release: 10, tipX: 0.887, tipY: 0.468 },
  "warrior/4_champion": { frames: 13, release: 10, tipX: 0.898, tipY: 0.398 },
  "warrior/5_warlord": { frames: 15, release: 12, tipX: 0.891, tipY: 0.445 },
};

/**
 * Ultimate (`special/` animation) anchors, one per job. Jobs missing here
 * fall back to their attack anim + FX_ANCHORS (same rule as the preview
 * engine, assets/fx-engine.js) — currently all 40 are present.
 */
export const FX_SPECIAL_ANCHORS: Record<string, FxAnchor> = {
  "archer/1_greenhorn": { frames: 13, release: 12, tipX: 0.992, tipY: 0.525 },
  "archer/2_scout": { frames: 13, release: 12, tipX: 0.863, tipY: 0.484 },
  "archer/3_hunter": { frames: 13, release: 6, tipX: 0.844, tipY: 0.43 },
  "archer/4_ranger": { frames: 13, release: 10, tipX: 0.863, tipY: 0.484 },
  "archer/5_sentinel": { frames: 17, release: 15, tipX: 0.852, tipY: 0.484 },
  "assassin/1_footpad": { frames: 13, release: 10, tipX: 0.681, tipY: 0.44 },
  "assassin/2_prowler": { frames: 13, release: 8, tipX: 0.773, tipY: 0.68 },
  "assassin/3_nightblade": { frames: 13, release: 7, tipX: 0.823, tipY: 0.621 },
  "assassin/4_assassin": { frames: 13, release: 11, tipX: 0.895, tipY: 0.452 },
  "assassin/5_shadowlord": { frames: 17, release: 16, tipX: 0.82, tipY: 0.57 },
  "bard/1_busker": { frames: 13, release: 7, tipX: 0.847, tipY: 0.452 },
  "bard/2_minstrel": { frames: 13, release: 7, tipX: 0.842, tipY: 0.375 },
  "bard/3_troubadour": { frames: 13, release: 6, tipX: 0.875, tipY: 0.533 },
  "bard/4_bard": { frames: 13, release: 6, tipX: 0.847, tipY: 0.46 },
  "bard/5_maestro": { frames: 17, release: 16, tipX: 0.773, tipY: 0.445 },
  "mage/1_apprentice": { frames: 13, release: 8, tipX: 0.879, tipY: 0.46 },
  "mage/2_adept": { frames: 13, release: 7, tipX: 0.871, tipY: 0.435 },
  "mage/3_conjurer": { frames: 13, release: 12, tipX: 0.879, tipY: 0.516 },
  "mage/4_sorcerer": { frames: 13, release: 11, tipX: 0.906, tipY: 0.477 },
  "mage/5_archmage": { frames: 17, release: 16, tipX: 0.883, tipY: 0.492 },
  "medic/1_acolyte": { frames: 13, release: 11, tipX: 0.855, tipY: 0.508 },
  "medic/2_healer": { frames: 13, release: 10, tipX: 0.852, tipY: 0.438 },
  "medic/3_cleric": { frames: 13, release: 12, tipX: 0.85, tipY: 0.325 },
  "medic/4_priest": { frames: 13, release: 11, tipX: 0.855, tipY: 0.548 },
  "medic/5_hierophant": { frames: 17, release: 16, tipX: 0.961, tipY: 0.641 },
  "paladin/1_squire": { frames: 13, release: 11, tipX: 0.887, tipY: 0.597 },
  "paladin/2_knight": { frames: 13, release: 11, tipX: 0.875, tipY: 0.442 },
  "paladin/3_crusader": { frames: 13, release: 12, tipX: 0.9, tipY: 0.6 },
  "paladin/4_paladin": { frames: 13, release: 12, tipX: 0.855, tipY: 0.685 },
  "paladin/5_lightbringer": { frames: 17, release: 16, tipX: 0.867, tipY: 0.555 },
  "warlock/1_initiate": { frames: 13, release: 7, tipX: 0.883, tipY: 0.433 },
  "warlock/2_cultist": { frames: 13, release: 10, tipX: 0.867, tipY: 0.583 },
  "warlock/3_hexer": { frames: 13, release: 4, tipX: 0.867, tipY: 0.442 },
  "warlock/4_warlock": { frames: 13, release: 12, tipX: 0.85, tipY: 0.417 },
  "warlock/5_dreadlord": { frames: 17, release: 16, tipX: 0.867, tipY: 0.445 },
  "warrior/1_rookie": { frames: 13, release: 10, tipX: 0.806, tipY: 0.516 },
  "warrior/2_strider": { frames: 13, release: 9, tipX: 0.798, tipY: 0.411 },
  "warrior/3_vanguard": { frames: 13, release: 6, tipX: 0.871, tipY: 0.581 },
  "warrior/4_champion": { frames: 13, release: 12, tipX: 0.922, tipY: 0.664 },
  "warrior/5_warlord": { frames: 17, release: 16, tipX: 0.992, tipY: 0.211 },
};
