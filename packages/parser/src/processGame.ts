import { POSSIBLE_RESOURCES, type ParseWarning, type ProcessedGame, type Resource } from "./types.js";
import { countResources, resourceArrayToMap, sum } from "./resourceCounting.js";

/**
 * Faithful port of v1's `catan2.py` `process_game`. Behavior (including its
 * quirks — see inline notes) is intentionally preserved so the fixture suite
 * in fixtures/ can validate this port against v1's real historical output
 * instead of a re-derived "corrected" version. Improve it later with real
 * fixtures backing the change, not by guessing.
 *
 * The one deliberate deviation: a per-line try/catch turns "handler throws"
 * into a recorded warning instead of an aborted parse (v1's handle_roll /
 * handle_vp / handle_win have no None-guard on their regex match and would
 * simply crash the whole script on an unrecognized line).
 */

const ROLL_RE = /^(?<player>[\w#]+)\s+rolled.*\s+dice_(?<dice1>\d)\s+dice_(?<dice2>\d)$/;
const GOT_RE = /^(?<player>[\w#]+)\s+got\s+(?<resources>.+)$/;
const VP_RE = /.*\+(?<howMany>\w+)\s+VP.*$/;
// v1's originals only matched "longest road passed from X to Y (+2 VPs)". colonist.io has used at
// least 3 other wordings over time ("...has passed from: X to: Y: +2 VPs", "...passed from: X to:
// Y: +2 VPs", and a glued "roadpassed") that v1's regex missed entirely — when that happened, the
// line's first token ("longest"/"largest") got treated as a player name and v1 crashed outright.
// Confirmed against fixtures/gamelogs: this hit 91 of 345 historical games (26%). This pattern
// tolerates "has "/no "has", ":"/no ":" after from/to, and "(...)"/": ..." for the VP suffix.
const LONGEST_PASSED_RE =
  /longest\s+road\s*(?:has\s+)?passed\s+from:?\s+(?<fromPlayer>[\w#]+)\s+to:?\s+(?<toPlayer>[\w#]+)\s*[:(]?\s*\+2\s+VPs\)?$/;
const LARGEST_PASSED_RE =
  /largest\s+army\s*(?:has\s+)?passed\s+from:?\s+(?<fromPlayer>[\w#]+)\s+to:?\s+(?<toPlayer>[\w#]+)\s*[:(]?\s*\+2\s+VPs\)?$/;
const WIN_RE = /^trophy\s*(?<winner>[\w#]+)\s+won\s+the\s+game.*$/;
const STEAL_RE = /^(?<stealer>[\w#]+)\s+stole\s+(?<stolenResource>[\w ]+)\s+from\s+(?<victim>[\w#]*)$/;
const STEAL_SINGLE_RE = /^(?<stealer>[\w#]+)\s+stole\s+(?<stolenResource>\w+)\s+from\s+(?<victim>[\w#]*)$/;
const STEAL_NUMERIC_RE = /^(?<player>[\w#]+)\s+stole\s+(?<howMany>\d+)\s+(?<resources>\w+)$/;
const TRADE_P2P_RE =
  /^(?<player>[\w#]+)\s+gave\s+(?<givenResources>.*)\s+and\s+got\s+(?<receivedResources>.*)\s+from\s+(?<otherPlayer>[\w#]+)$/;
const TRADE_P2B_RE = /^(?<player>[\w#]+)\s+gave\s+bank\s+(?<spentResources>.*)\s+and\s+took\s+(?<receivedResources>.*)$/;
const TRADED_WITH_RE =
  /^(?<player>[\w#]+)\s+traded\s+(?<givenResources>.*)\s+for\s+(?<receivedResources>.*)\s+with\s+(?<otherPlayer>[\w#]+)$/;

type Handler = (line: string, i: number, player: string, turn: number) => number;

function zeroResourceMap(): Record<Resource, number> {
  return resourceArrayToMap(new Array(POSSIBLE_RESOURCES.length).fill(0));
}

function sumColumns(rows: number[][]): number[] {
  if (rows.length === 0) return [0, 0, 0, 0, 0];
  const result = new Array(rows[0].length).fill(0);
  for (const row of rows) row.forEach((v, idx) => (result[idx] += v));
  return result;
}

export function processGame(lines: string[]): ProcessedGame {
  const dice = new Array(11).fill(0);
  const diceUntilTurn: number[][] = [];
  let turn = 0;

  const players = new Map<string, number>();
  const playerPoints = [2, 2, 2, 2];
  const playerPointsUntilTurn: Record<number, number[]> = {};

  const special = { winner: "", lastRolled: 0 };

  const resourcesPerPlayerRaw = new Map<string, number>(); // "player|resource" -> total
  const resourcesPerPlayerPerDiceRaw = new Map<string, number>(); // "player|resource|dice" -> total
  const stealMapRaw = new Map<string, number>(); // "stealer|victim" -> count
  const playerCardCount: Record<string, number> = {};
  const playerCardCountThroughTurns: Record<number, Record<string, number>> = {};
  const playerCardCountPerChange: Record<string, number[]> = {};
  const resourcesThroughTurns: Record<Resource, Record<number, number>> = {
    grain: {},
    ore: {},
    wool: {},
    brick: {},
    lumber: {},
  };
  const playerDiceRolls: Record<string, number[]> = {};
  const tradesRaw = {
    p2pReceived: {} as Record<string, number[][]>,
    p2pGiven: {} as Record<string, number[][]>,
    p2bReceived: {} as Record<string, number[][]>,
    p2bGiven: {} as Record<string, number[][]>,
  };
  const warnings: ParseWarning[] = [];

  function playerToIndex(player: string): number {
    const idx = players.get(player);
    if (idx === undefined) throw new Error(`unknown player "${player}"`);
    return idx;
  }

  function addResourcePerPlayer(player: string, resource: Resource, n: number) {
    const key = `${player}|${resource}`;
    resourcesPerPlayerRaw.set(key, (resourcesPerPlayerRaw.get(key) ?? 0) + n);
  }

  function addResourcePerPlayerPerDice(player: string, resource: Resource, diceTotal: number, n: number) {
    const key = `${player}|${resource}|${diceTotal}`;
    resourcesPerPlayerPerDiceRaw.set(key, (resourcesPerPlayerPerDiceRaw.get(key) ?? 0) + n);
  }

  function incrementSteal(stealer: string, victim: string) {
    const key = `${stealer}|${victim}`;
    stealMapRaw.set(key, (stealMapRaw.get(key) ?? 0) + 1);
  }

  function pushTrade(bucket: keyof typeof tradesRaw, player: string, counts: number[]) {
    if (!tradesRaw[bucket][player]) tradesRaw[bucket][player] = [];
    tradesRaw[bucket][player].push(counts);
  }

  function addToResourceThroughTurns(resourceMap: Record<Resource, number>, atTurn: number) {
    for (const resource of POSSIBLE_RESOURCES) {
      const n = resourceMap[resource];
      const existing = resourcesThroughTurns[resource];
      const previous = existing[atTurn] ?? existing[atTurn - 1] ?? 0;
      existing[atTurn] = previous + n;
    }
  }

  function recordCardCountChange() {
    for (const p of players.keys()) {
      const history = playerCardCountPerChange[p] ?? (playerCardCountPerChange[p] = []);
      const before = history.length > 0 ? history[history.length - 1] : 0;
      const after = playerCardCount[p] ?? 0;
      if (before !== after) history.push(after);
    }
  }

  const handleStartingResources: Handler = (_line, _i, player, turn) => {
    if (players.has(player)) return turn;
    players.set(player, 3 - players.size);
    return turn;
  };

  const handleGetResources: Handler = (line, _i, player, turn) => {
    const lastRolled = special.lastRolled;
    const m = line.match(GOT_RE);
    if (!m?.groups) return turn;
    const counts = countResources(m.groups.resources);
    const resourceMap = zeroResourceMap();
    POSSIBLE_RESOURCES.forEach((resource, idx) => {
      const n = counts[idx];
      addResourcePerPlayer(player, resource, n);
      addResourcePerPlayerPerDice(player, resource, lastRolled, n);
      resourceMap[resource] = n;
    });
    addToResourceThroughTurns(resourceMap, turn);
    return turn;
  };

  const handleRoll: Handler = (line, _i, player, turn) => {
    addToResourceThroughTurns(zeroResourceMap(), turn);
    const m = line.match(ROLL_RE);
    if (!m?.groups) throw new Error(`roll line did not match expected pattern: "${line}"`);
    const diceRoll = parseInt(m.groups.dice1, 10) + parseInt(m.groups.dice2, 10);
    dice[diceRoll - 2] += 1;
    diceUntilTurn.push([...dice]);
    special.lastRolled = diceRoll;
    if (!playerDiceRolls[player]) playerDiceRolls[player] = new Array(11).fill(0);
    playerDiceRolls[player][diceRoll - 2] += 1;
    return turn + 1;
  };

  const handleVp: Handler = (line, _i, player, turn) => {
    const m = line.match(VP_RE);
    if (!m?.groups) throw new Error(`VP line did not match expected pattern: "${line}"`);
    const vps = parseInt(m.groups.howMany, 10);

    let currentPlayer = player;

    const longestPassed = line.match(LONGEST_PASSED_RE);
    if (longestPassed?.groups) {
      playerPoints[playerToIndex(longestPassed.groups.fromPlayer)] -= vps;
      currentPlayer = longestPassed.groups.toPlayer;
    }

    const largestPassed = line.match(LARGEST_PASSED_RE);
    if (largestPassed?.groups) {
      playerPoints[playerToIndex(largestPassed.groups.fromPlayer)] -= vps;
      currentPlayer = largestPassed.groups.toPlayer;
    }

    playerPoints[playerToIndex(currentPlayer)] += vps;
    return turn;
  };

  const handleWin: Handler = (line, _i, _player, turn) => {
    const m = line.match(WIN_RE);
    if (!m?.groups) throw new Error(`win line did not match expected pattern: "${line}"`);
    special.winner = m.groups.winner;
    return turn;
  };

  const handleSteal: Handler = (line, _i, _player, turn) => {
    const m = line.match(STEAL_RE);
    if (!m?.groups) return turn;
    incrementSteal(m.groups.stealer, m.groups.victim);
    return turn;
  };

  const handleTrade: Handler = (line, _i, _player, turn) => {
    const p2p = line.match(TRADE_P2P_RE);
    if (p2p?.groups) {
      const { player, otherPlayer, givenResources, receivedResources } = p2p.groups;
      const given = countResources(givenResources);
      const taken = countResources(receivedResources);
      pushTrade("p2pGiven", player, given);
      pushTrade("p2pGiven", otherPlayer, taken);
      pushTrade("p2pReceived", player, taken);
      pushTrade("p2pReceived", otherPlayer, given);
      return turn;
    }
    const p2b = line.match(TRADE_P2B_RE);
    if (p2b?.groups) {
      const { player, spentResources, receivedResources } = p2b.groups;
      pushTrade("p2bGiven", player, countResources(spentResources));
      pushTrade("p2bReceived", player, countResources(receivedResources));
    }
    return turn;
  };

  const handleCount: Handler = (line, _i, player, turn) => {
    if (line.includes("starting resources") || line.includes("got")) {
      playerCardCount[player] = (playerCardCount[player] ?? 0) + sum(countResources(line));
    } else {
      const stealMatch = line.match(STEAL_SINGLE_RE);
      if (stealMatch?.groups) {
        const { stealer, victim } = stealMatch.groups;
        playerCardCount[stealer] = (playerCardCount[stealer] ?? 0) + 1;
        playerCardCount[victim] = (playerCardCount[victim] ?? 0) - 1;
      } else if (line.includes("discarded")) {
        playerCardCount[player] = (playerCardCount[player] ?? 0) - sum(countResources(line));
      } else if (line.includes("used Year of Plenty")) {
        playerCardCount[player] = (playerCardCount[player] ?? 0) + 2;
      } else if (line.includes("built a settlement")) {
        playerCardCount[player] = (playerCardCount[player] ?? 0) - 4;
      } else if (line.includes("built a road")) {
        playerCardCount[player] = (playerCardCount[player] ?? 0) - 2;
      } else if (line.includes("built a city")) {
        playerCardCount[player] = (playerCardCount[player] ?? 0) - 5;
      } else if (line.includes("bought development card")) {
        playerCardCount[player] = (playerCardCount[player] ?? 0) - 3;
      } else {
        const numericSteal = line.match(STEAL_NUMERIC_RE);
        if (numericSteal?.groups) {
          const { player: p, howMany } = numericSteal.groups;
          playerCardCount[p] = (playerCardCount[p] ?? 0) + parseInt(howMany, 10);
        } else {
          const gaveBank = line.match(TRADE_P2B_RE);
          if (gaveBank?.groups) {
            const { player: p, spentResources, receivedResources } = gaveBank.groups;
            const given = sum(countResources(spentResources));
            const taken = sum(countResources(receivedResources));
            playerCardCount[p] = (playerCardCount[p] ?? 0) - given + taken;
          } else {
            const tradedWith = line.match(TRADED_WITH_RE);
            if (tradedWith?.groups) {
              const { player: p, otherPlayer, givenResources, receivedResources } = tradedWith.groups;
              const given = sum(countResources(givenResources));
              const taken = sum(countResources(receivedResources));
              playerCardCount[p] = (playerCardCount[p] ?? 0) - given + taken;
              playerCardCount[otherPlayer] = (playerCardCount[otherPlayer] ?? 0) + given - taken;
            }
          }
        }
      }
    }

    recordCardCountChange();
    return turn;
  };

  function handleEndOfTurn(turn: number) {
    playerPointsUntilTurn[turn] = [...playerPoints];
    playerCardCountThroughTurns[turn] = { ...playerCardCount };
  }

  const lineHandlers: Array<[string, Handler[]]> = [
    ["starting resources", [handleStartingResources, handleCount]],
    ["got", [handleGetResources, handleCount]],
    ["rolled", [handleRoll]],
    ["VP", [handleVp]],
    ["stole", [handleSteal, handleCount]],
    ["won the game", [handleWin]],
    ["discarded", [handleCount]],
    ["gave bank", [handleCount, handleTrade]],
    ["used Monopoly card", [handleCount]],
    ["used Year of Plenty", [handleCount]],
    ["and got", [handleCount, handleTrade]],
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const player = tokens[0];

    for (const [key, handlers] of lineHandlers) {
      if (line.includes(key)) {
        for (const handler of handlers) {
          try {
            turn = handler(line, i, player, turn);
          } catch (err) {
            warnings.push({
              lineIndex: i,
              line,
              handler: handler.name,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }
    handleEndOfTurn(turn);
  }

  // --- reshape raw/composite-keyed maps into the nested result shape ---

  const playerNames = [...players.keys()];
  const playerOrder: string[] = [0, 1, 2, 3].map((i) => playerNames[playerNames.length - i - 1] ?? "");

  const resourcesPerPlayer: ProcessedGame["resourcesPerPlayer"] = {};
  for (const player of playerNames) {
    resourcesPerPlayer[player] = zeroResourceMap();
    for (const resource of POSSIBLE_RESOURCES) {
      resourcesPerPlayer[player][resource] = resourcesPerPlayerRaw.get(`${player}|${resource}`) ?? 0;
    }
  }

  const resourcesPerPlayerPerDice: ProcessedGame["resourcesPerPlayerPerDice"] = {};
  for (const [key, value] of resourcesPerPlayerPerDiceRaw) {
    const [player, resource, diceTotalStr] = key.split("|");
    const diceTotal = parseInt(diceTotalStr, 10);
    const perPlayer = (resourcesPerPlayerPerDice[player] ??= {});
    const perResource = (perPlayer[resource as Resource] ??= {});
    perResource[diceTotal] = value;
  }

  const stealMap: ProcessedGame["stealMap"] = {};
  for (const [key, value] of stealMapRaw) {
    const [stealer, victim] = key.split("|");
    (stealMap[stealer] ??= {})[victim] = value;
  }

  const resourcesThroughTurnsList: ProcessedGame["resourcesThroughTurns"] = {} as ProcessedGame["resourcesThroughTurns"];
  for (const resource of POSSIBLE_RESOURCES) {
    const turnMap = resourcesThroughTurns[resource];
    const sortedTurns = Object.keys(turnMap)
      .map(Number)
      .sort((a, b) => a - b);
    resourcesThroughTurnsList[resource] = sortedTurns.map((t) => turnMap[t]);
  }

  const trades: ProcessedGame["trades"] = {
    p2pReceived: {},
    p2pGiven: {},
    p2bReceived: {},
    p2bGiven: {},
  };
  for (const bucket of Object.keys(trades) as Array<keyof typeof trades>) {
    for (const p of playerNames) {
      trades[bucket][p] = sumColumns(tradesRaw[bucket][p] ?? []);
    }
  }

  return {
    dice,
    diceUntilTurn,
    players: Object.fromEntries(players),
    playerOrder,
    playerPoints,
    playerPointsUntilTurn,
    resourcesPerPlayer,
    resourcesPerPlayerPerDice,
    resourcesThroughTurns: resourcesThroughTurnsList,
    turn,
    stealMap,
    winner: special.winner,
    playerCardCountThroughTurns,
    playerCardCountPerChange,
    trades,
    playerDiceRolls,
    warnings,
  };
}
