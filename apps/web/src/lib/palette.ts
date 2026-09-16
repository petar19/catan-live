import { useEffect, useState } from "react";

// Validated categorical palette (see dataviz skill's references/palette.md) —
// slots 1-4 (blue, orange, aqua, yellow), light/dark variants. Player seat
// index (0-3) maps to array index consistently across every chart on the site.
const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500"];

// Resource identity colors — deliberately NOT the validated categorical
// palette. These match the exact colors Petar used in the v1 matplotlib
// plots (resource_to_color in catan2.py: gold/silver/lawngreen/firebrick/
// seagreen), in POSSIBLE_RESOURCES order (grain, ore, wool, brick, lumber).
// Fixed regardless of light/dark mode — recognizability across the old and
// new tool matters more here than palette-formula purity, and bars/labels
// carry a text label regardless so low-contrast slots (silver, lawngreen)
// still read fine.
export const RESOURCE_COLORS: Record<string, string> = {
  grain: "#e5c100", // gold, darkened slightly off pure #FFD700 for surface contrast
  ore: "#9c9c9c", // silver, darkened for contrast (pure #C0C0C0 washes out on light bg)
  wool: "#5fd400", // lawngreen, darkened slightly
  brick: "#b22222", // firebrick
  lumber: "#2e8b57", // seagreen
};

export const TEXT_PRIMARY = { light: "#0b0b0b", dark: "#ffffff" };
export const TEXT_SECONDARY = { light: "#52514e", dark: "#c3c2b7" };
export const GRID_LINE = { light: "#e5e4e0", dark: "#33322f" };

// Dice-roll-timing chart: one fixed, distinct color per quarter of the game
// (quarter 1 = bottom of the stack, quarter 4 = top) — matches v1's
// plot_dice_resource_stats (colors = ["yellow", "gold", "orange", "red"]),
// slightly darkened for surface contrast the same way RESOURCE_COLORS is.
// Deliberately a small discrete set, not a continuous ramp — Petar tried a
// density-based opacity gradient here twice and it didn't read clearly either
// time; four named, distinct colors with a real legend is what he actually
// wants back.
export const QUARTER_COLORS = ["#e8c700", "#e5a300", "#e07b00", "#d1372b"];

// Gain/loss colors for steals — deliberately NOT seatColors. Steals charts
// used to borrow seatColors[2]/[3] for "stole from them"/"they stole from
// you", but that palette also means *player identity* everywhere else on the
// site (points-over-turns lines, resource bars, etc.) — reusing it here
// meant a steals chart could coincidentally show the same color as some
// player's own identity color in that game, reading as if that player were
// "specially" highlighted when it was just a palette-slot coincidence. Green/
// red gain-loss colors carry an unambiguous, player-independent meaning.
export const GAIN_LOSS = {
  light: { gain: "#1baf7a", loss: "#e34948" },
  dark: { gain: "#199e70", loss: "#e66767" },
};

/** Multiplies each RGB channel by `factor` (0-1) to darken a hex color —
 * used to shade a bank-trade segment relative to its resource's base color
 * without needing a second hand-picked color per resource. */
export function darkenHex(hex: string, factor: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

/** Player-seat color palette that tracks the viewer's light/dark preference. */
export function usePalette() {
  const [dark, setDark] = useState(prefersDark());

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return {
    dark,
    seatColors: dark ? DARK : LIGHT,
    resourceColors: RESOURCE_COLORS,
    gainLoss: dark ? GAIN_LOSS.dark : GAIN_LOSS.light,
    quarterColors: QUARTER_COLORS,
    textPrimary: dark ? TEXT_PRIMARY.dark : TEXT_PRIMARY.light,
    textSecondary: dark ? TEXT_SECONDARY.dark : TEXT_SECONDARY.light,
    gridLine: dark ? GRID_LINE.dark : GRID_LINE.light,
  };
}
