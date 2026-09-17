import { describe, expect, it } from "vitest";
import { filterLines, processGame, DEFAULT_PARSER_RULES, buildParserRules, serializeParserRules } from "../src/index.js";

describe("filterLines player aliases parameter", () => {
  it("uses a custom alias map instead of the default when one is provided", () => {
    const lines = ["NewAccountName123 placed a settlement"];
    const result = filterLines(lines, { NewAccountName123: "Kent#3816" });
    expect(result).toEqual(["Kent#3816 placed a settlement"]);
  });

  it("defaults to DEFAULT_PLAYER_ALIASES when no alias map is passed", () => {
    const result = filterLines(["Seale5074 placed a settlement"]);
    expect(result).toEqual(["Kent#3816 placed a settlement"]);
  });
});

describe("processGame rules parameter", () => {
  it("actually uses a custom rule instead of the default — a roll line the custom regex can't match becomes a warning, not a processed roll", () => {
    const lines = ["A placed a settlement", "A rolled dice_3 dice_4"];
    const customRules = { ...DEFAULT_PARSER_RULES, ROLL_RE: /^this will never match$/ };

    const result = processGame(lines, customRules);

    expect(result.turn).toBe(0); // roll never got counted
    expect(result.dice.every((c) => c === 0)).toBe(true);
    expect(result.warnings.some((w) => w.line.includes("rolled"))).toBe(true);
  });

  it("never sets `flags` to undefined — Firestore rejects documents containing that", () => {
    // Regression test: serializeParserRules used to always set `flags`, even
    // to `undefined` for a regex with none, which broke a real deploy
    // (seedParserRules) with "Cannot use 'undefined' as a Firestore value".
    // The fix is to omit the key entirely rather than set it to undefined.
    const serialized = serializeParserRules(DEFAULT_PARSER_RULES);
    for (const rule of Object.values(serialized)) {
      expect(Object.prototype.hasOwnProperty.call(rule, "flags") ? typeof rule.flags === "string" : true).toBe(true);
    }
  });

  it("round-trips through serialize/build back to equivalent matching behavior", () => {
    const rebuilt = buildParserRules(serializeParserRules(DEFAULT_PARSER_RULES));
    const lines = ["A placed a settlement", "A rolled dice_3 dice_4"];

    expect(processGame(lines, rebuilt)).toEqual(processGame(lines));
  });

  it("buildParserRules falls back to the default for any rule missing from stored data", () => {
    const rebuilt = buildParserRules({}); // nothing stored
    expect(rebuilt.ROLL_RE.source).toBe(DEFAULT_PARSER_RULES.ROLL_RE.source);
  });
});
