/**
 * The line-matching regexes `processGame` runs against each filtered line —
 * pulled out into a named, swappable set (Phase 5.5) instead of being
 * module-private constants, so they can eventually be edited as data
 * (Firestore's `parserRules` collection, versioned — see CLAUDE.md) rather
 * than requiring a code change + redeploy every time colonist.io's wording
 * drifts. `DEFAULT_PARSER_RULES` is exactly what v1/the original TS port had
 * hardcoded, so passing no rules (the default everywhere, including all
 * fixture tests) behaves identically to before this existed.
 *
 * Rule versions are immutable once created (see CLAUDE.md Phase 5.5) — this
 * module has no opinion on versioning itself, it just defines the shape of
 * one rule set and how to move between "live RegExp objects" (what
 * processGame needs) and "plain data" (what Firestore/an admin editor needs).
 */

export interface ParserRules {
  ROLL_RE: RegExp;
  GOT_RE: RegExp;
  VP_RE: RegExp;
  LONGEST_PASSED_RE: RegExp;
  LARGEST_PASSED_RE: RegExp;
  WIN_RE: RegExp;
  STEAL_RE: RegExp;
  STEAL_SINGLE_RE: RegExp;
  STEAL_NUMERIC_RE: RegExp;
  TRADE_P2P_RE: RegExp;
  TRADE_P2B_RE: RegExp;
  TRADED_WITH_RE: RegExp;
}

/** Plain-data form of one regex: what gets stored in Firestore and shown in
 * an editor. `new RegExp(source, flags)` reconstructs the live RegExp. */
export interface RuleSource {
  source: string;
  flags?: string;
}

export type ParserRuleSources = Record<keyof ParserRules, RuleSource>;

export const DEFAULT_PARSER_RULES: ParserRules = {
  ROLL_RE: /^(?<player>[\w#]+)\s+rolled.*\s+dice_(?<dice1>\d)\s+dice_(?<dice2>\d)$/,
  GOT_RE: /^(?<player>[\w#]+)\s+got\s+(?<resources>.+)$/,
  VP_RE: /.*\+(?<howMany>\w+)\s+VP.*$/,
  // v1's originals only matched "longest road passed from X to Y (+2 VPs)". colonist.io has used
  // at least 3 other wordings over time ("...has passed from: X to: Y: +2 VPs", "...passed from:
  // X to: Y: +2 VPs", and a glued "roadpassed") that v1's regex missed entirely — when that
  // happened, the line's first token ("longest"/"largest") got treated as a player name and v1
  // crashed outright. Confirmed against fixtures/gamelogs: this hit 91 of 345 historical games
  // (26%). This pattern tolerates "has "/no "has", ":"/no ":" after from/to, and "(...)"/": ..."
  // for the VP suffix.
  LONGEST_PASSED_RE:
    /longest\s+road\s*(?:has\s+)?passed\s+from:?\s+(?<fromPlayer>[\w#]+)\s+to:?\s+(?<toPlayer>[\w#]+)\s*[:(]?\s*\+2\s+VPs\)?$/,
  LARGEST_PASSED_RE:
    /largest\s+army\s*(?:has\s+)?passed\s+from:?\s+(?<fromPlayer>[\w#]+)\s+to:?\s+(?<toPlayer>[\w#]+)\s*[:(]?\s*\+2\s+VPs\)?$/,
  WIN_RE: /^trophy\s*(?<winner>[\w#]+)\s+won\s+the\s+game.*$/,
  STEAL_RE: /^(?<stealer>[\w#]+)\s+stole\s+(?<stolenResource>[\w ]+)\s+from\s+(?<victim>[\w#]*)$/,
  STEAL_SINGLE_RE: /^(?<stealer>[\w#]+)\s+stole\s+(?<stolenResource>\w+)\s+from\s+(?<victim>[\w#]*)$/,
  STEAL_NUMERIC_RE: /^(?<player>[\w#]+)\s+stole\s+(?<howMany>\d+)\s+(?<resources>\w+)$/,
  TRADE_P2P_RE:
    /^(?<player>[\w#]+)\s+gave\s+(?<givenResources>.*)\s+and\s+got\s+(?<receivedResources>.*)\s+from\s+(?<otherPlayer>[\w#]+)$/,
  TRADE_P2B_RE: /^(?<player>[\w#]+)\s+gave\s+bank\s+(?<spentResources>.*)\s+and\s+took\s+(?<receivedResources>.*)$/,
  TRADED_WITH_RE:
    /^(?<player>[\w#]+)\s+traded\s+(?<givenResources>.*)\s+for\s+(?<receivedResources>.*)\s+with\s+(?<otherPlayer>[\w#]+)$/,
};

/** Converts a live rule set into plain data (for saving a new version). Omits
 * `flags` entirely when empty rather than setting it to `undefined` —
 * Firestore rejects documents containing an explicit `undefined` value. */
export function serializeParserRules(rules: ParserRules): ParserRuleSources {
  const result = {} as ParserRuleSources;
  for (const key of Object.keys(rules) as Array<keyof ParserRules>) {
    const re = rules[key];
    result[key] = re.flags ? { source: re.source, flags: re.flags } : { source: re.source };
  }
  return result;
}

/** Converts stored plain data back into live RegExp objects. Falls back to
 * the default for any key missing from `sources` (defensive — an
 * incomplete/older stored rule-set shouldn't crash parsing). */
export function buildParserRules(sources: Partial<ParserRuleSources>): ParserRules {
  const result = {} as ParserRules;
  for (const key of Object.keys(DEFAULT_PARSER_RULES) as Array<keyof ParserRules>) {
    const stored = sources[key];
    result[key] = stored ? new RegExp(stored.source, stored.flags) : DEFAULT_PARSER_RULES[key];
  }
  return result;
}
