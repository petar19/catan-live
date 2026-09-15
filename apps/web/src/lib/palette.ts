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

// Single sequential hue for magnitude (the dice-roll-timing heatmap) — blue,
// same family as seat slot 1, expressed as an alpha ramp against the card
// surface rather than hand-picked steps.
export const HEATMAP_HUE = { light: "#2a78d6", dark: "#3987e5" };

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
    heatmapHue: dark ? HEATMAP_HUE.dark : HEATMAP_HUE.light,
    textPrimary: dark ? TEXT_PRIMARY.dark : TEXT_PRIMARY.light,
    textSecondary: dark ? TEXT_SECONDARY.dark : TEXT_SECONDARY.light,
    gridLine: dark ? GRID_LINE.dark : GRID_LINE.light,
  };
}
