import { POSSIBLE_RESOURCES, type ProcessedGame } from "@catan-live/parser";

export function pointsOverTurnsData(game: ProcessedGame) {
  const turns = Object.keys(game.playerPointsUntilTurn)
    .map(Number)
    .sort((a, b) => a - b);
  return turns.map((turn) => {
    const row: Record<string, number> = { turn };
    game.playerOrder.forEach((name, i) => {
      row[name] = game.playerPointsUntilTurn[turn]?.[i] ?? 0;
    });
    return row;
  });
}

export function resourcesForPlayer(game: ProcessedGame, player: string) {
  return POSSIBLE_RESOURCES.map((resource) => ({
    resource,
    count: game.resourcesPerPlayer[player]?.[resource] ?? 0,
  }));
}

export function diceRollsForPlayer(game: ProcessedGame, player: string) {
  const rolls = game.playerDiceRolls[player] ?? [];
  return Array.from({ length: 11 }, (_, i) => ({ total: i + 2, count: rolls[i] ?? 0 }));
}

export interface TradeRow {
  resource: string;
  p2pReceived: number;
  p2bReceived: number;
  p2pGiven: number; // negative
  p2bGiven: number; // negative
  [key: string]: string | number;
}

export function tradesForPlayer(game: ProcessedGame, player: string): TradeRow[] {
  return POSSIBLE_RESOURCES.map((resource, i) => ({
    resource,
    p2pReceived: game.trades.p2pReceived[player]?.[i] ?? 0,
    p2bReceived: game.trades.p2bReceived[player]?.[i] ?? 0,
    p2pGiven: -(game.trades.p2pGiven[player]?.[i] ?? 0),
    p2bGiven: -(game.trades.p2bGiven[player]?.[i] ?? 0),
  }));
}

export interface StealRow {
  opponent: string;
  stolenFromThem: number;
  stolenByThem: number; // negative
  [key: string]: string | number;
}

export function stealsForPlayer(game: ProcessedGame, player: string): StealRow[] {
  return game.playerOrder
    .filter((opponent) => opponent !== player)
    .map((opponent) => ({
      opponent,
      stolenFromThem: game.stealMap[player]?.[opponent] ?? 0,
      stolenByThem: -(game.stealMap[opponent]?.[player] ?? 0),
    }));
}

/**
 * Buckets rollSequence into `bins` time-windows per dice total (2-12). Used
 * by DiceRollTimingChart as a stacked bar: total bar height = how many times
 * that total rolled (the actual count, comparable across totals — unlike a
 * per-row-normalized heatmap), and each bin's height within the stack shows
 * *when* those rolls happened, rendered as a light (early) -> dark (late)
 * gradient of a single hue.
 */
export interface DiceTimingRow {
  total: number;
  totalCount: number;
  bins: number[]; // index 0 = earliest window
  [key: string]: number | number[];
}

export function diceTimingData(rollSequence: number[], bins: number): { rows: DiceTimingRow[]; bins: number } {
  const effectiveBins = Math.max(1, Math.min(bins, rollSequence.length || 1));
  const counts: number[][] = Array.from({ length: 11 }, () => new Array(effectiveBins).fill(0));

  rollSequence.forEach((total, rollIndex) => {
    const bin = Math.min(effectiveBins - 1, Math.floor((rollIndex / Math.max(1, rollSequence.length)) * effectiveBins));
    counts[total - 2][bin] += 1;
  });

  const rows: DiceTimingRow[] = counts.map((rowCounts, i) => {
    const row: DiceTimingRow = { total: i + 2, totalCount: rowCounts.reduce((a, b) => a + b, 0), bins: rowCounts };
    rowCounts.forEach((c, binIndex) => {
      row[`bin_${binIndex}`] = c;
    });
    return row;
  });

  return { rows, bins: effectiveBins };
}
