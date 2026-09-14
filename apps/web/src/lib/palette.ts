import { useEffect, useState } from "react";

// Validated categorical palette (see dataviz skill's references/palette.md) —
// slots 1-4 (blue, orange, aqua, yellow), light/dark variants. Player seat
// index (0-3) maps to array index consistently across every chart on the site.
const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500"];

// Resources use a separate 5-series identity (grain/ore/wool/brick/lumber, in
// POSSIBLE_RESOURCES order) — slots 1-5 of the same validated categorical
// palette. Never shown alongside the player/seat palette in one chart, so
// reusing hex values across the two identity dimensions doesn't collide.
const RESOURCE_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const RESOURCE_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

export const TEXT_PRIMARY = { light: "#0b0b0b", dark: "#ffffff" };
export const TEXT_SECONDARY = { light: "#52514e", dark: "#c3c2b7" };
export const GRID_LINE = { light: "#e5e4e0", dark: "#33322f" };

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
    resourceColors: dark ? RESOURCE_DARK : RESOURCE_LIGHT,
    textPrimary: dark ? TEXT_PRIMARY.dark : TEXT_PRIMARY.light,
    textSecondary: dark ? TEXT_SECONDARY.dark : TEXT_SECONDARY.light,
    gridLine: dark ? GRID_LINE.dark : GRID_LINE.light,
  };
}
