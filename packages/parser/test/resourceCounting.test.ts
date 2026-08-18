import { describe, expect, it } from "vitest";
import { countResources } from "../src/index.js";

describe("countResources", () => {
  it("counts non-overlapping occurrences per resource, in POSSIBLE_RESOURCES order", () => {
    expect(countResources("graingrainwool")).toEqual([2, 0, 1, 0, 0]);
  });

  it("returns all zeros for text with no resource words", () => {
    expect(countResources("nothing here")).toEqual([0, 0, 0, 0, 0]);
  });
});
