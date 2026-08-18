/**
 * Ported verbatim (including order) from v1's `catan2.py` `replacements` list.
 * Order matters: entries are applied as a sequential chain of literal
 * find/replace passes over each line, same as the Python original.
 *
 * This mixes three concerns that v2 should eventually separate (see
 * CLAUDE.md §2.4.6): UI-chrome stripping, capitalization normalization, and
 * player-identity aliasing for colonist.io account renames. Left as-is here
 * so the fixture regression suite can assert byte-for-byte parity with v1.
 */
const REPLACEMENTS: Array<[string, string]> = [
  ["avatar", ""],
  ["Guest", ""],
  ["User", ""],
  ["Player ", ""],
  ["bot", ""],
  ["Settler", ""],
  ["icon_helmet", ""],
  ["icon_cactus", ""],
  ["icon_crown", ""],
  ["icon_scarf", ""],
  ["icon_avocado", ""],
  ["Colonist", ""],
  ["Christmas", ""],
  ["Settle", ""],
  ["icon_sombrero", ""],
  ["You", "Myrna8511"],
  ["you", "Myrna8511"],
  ["Seale5074", "Kent#3816"],
  ["Spring#4635", "Yolonc"],
  ["Yolonc#9587", "Yolonc"],

  ["Grain", "grain"],
  ["Lumber", "lumber"],
  ["Wool", "wool"],
  ["Ore", "ore"],
  ["Brick", "brick"],
  ["Resource Card", "card"],
];

export function filterLines(rawLines: string[]): string[] {
  return rawLines.map((rawLine) => {
    let line = rawLine.trim();
    for (const [from, to] of REPLACEMENTS) {
      line = line.split(from).join(to);
    }
    return line;
  });
}
