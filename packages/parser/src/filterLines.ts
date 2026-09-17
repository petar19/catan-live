/**
 * Ported from v1's `catan2.py` `replacements` list, now split into two
 * concerns that used to be one hardcoded list (see CLAUDE.md §2.4.6 and
 * Phase 5.5):
 *
 * - UI-chrome stripping + capitalization normalization (below) — stays
 *   hardcoded. It's about colonist.io's markup/wording, not something Petar
 *   needs to edit from an admin UI.
 * - Player-identity aliasing (raw observed name -> canonical name, for
 *   colonist.io account renames) — now a parameter, `playerAliases`,
 *   defaulting to `DEFAULT_PLAYER_ALIASES` (the exact entries v1 had
 *   hardcoded). Callers that need it editable (submitGame, the future admin
 *   rules UI) fetch the live table from Firestore's `playerAliases`
 *   collection and pass it in; everything else (fixture tests) gets the
 *   default and behaves exactly as before.
 *
 * Order matters and is preserved exactly: UI-cruft stripping first, then
 * aliasing, then capitalization — same relative order as v1's single list,
 * just split across two constant arrays plus the parameter in between.
 */

const PRE_ALIAS_REPLACEMENTS: Array<[string, string]> = [
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
];

const POST_ALIAS_REPLACEMENTS: Array<[string, string]> = [
  ["Grain", "grain"],
  ["Lumber", "lumber"],
  ["Wool", "wool"],
  ["Ore", "ore"],
  ["Brick", "brick"],
  ["Resource Card", "card"],
];

/** v1's hardcoded identity aliases, preserved as the default so existing
 * fixtures/games behave identically when no live alias table is supplied. */
export const DEFAULT_PLAYER_ALIASES: Record<string, string> = {
  You: "Myrna8511",
  you: "Myrna8511",
  "Seale5074": "Kent#3816",
  "Spring#4635": "Yolonc",
  "Yolonc#9587": "Yolonc",
};

export function filterLines(rawLines: string[], playerAliases: Record<string, string> = DEFAULT_PLAYER_ALIASES): string[] {
  return rawLines.map((rawLine) => {
    let line = rawLine.trim();
    for (const [from, to] of PRE_ALIAS_REPLACEMENTS) {
      line = line.split(from).join(to);
    }
    for (const [from, to] of Object.entries(playerAliases)) {
      line = line.split(from).join(to);
    }
    for (const [from, to] of POST_ALIAS_REPLACEMENTS) {
      line = line.split(from).join(to);
    }
    return line;
  });
}
