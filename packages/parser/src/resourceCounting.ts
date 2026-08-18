import { POSSIBLE_RESOURCES, type Resource } from "./types.js";

/** Non-overlapping substring count, matching Python's str.count(). */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  return haystack.split(needle).length - 1;
}

/** Counts occurrences of each resource name in a chunk of text, in POSSIBLE_RESOURCES order. */
export function countResources(text: string): number[] {
  return POSSIBLE_RESOURCES.map((r) => countOccurrences(text, r));
}

export function resourceArrayToMap(counts: number[]): Record<Resource, number> {
  const map = {} as Record<Resource, number>;
  POSSIBLE_RESOURCES.forEach((r, i) => {
    map[r] = counts[i];
  });
  return map;
}

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
