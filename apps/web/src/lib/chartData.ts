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

export function diceDistributionData(dice: number[]) {
  return dice.map((count, i) => ({ total: i + 2, count }));
}

export function resourcesPerPlayerData(game: ProcessedGame) {
  return POSSIBLE_RESOURCES.map((resource) => {
    const row: Record<string, number | string> = { resource };
    game.playerOrder.forEach((name) => {
      row[name] = game.resourcesPerPlayer[name]?.[resource] ?? 0;
    });
    return row;
  });
}

export function playerDiceRollsData(game: ProcessedGame) {
  return Array.from({ length: 11 }, (_, i) => {
    const row: Record<string, number> = { total: i + 2 };
    game.playerOrder.forEach((name) => {
      row[name] = game.playerDiceRolls[name]?.[i] ?? 0;
    });
    return row;
  });
}

export interface TradeSummaryRow {
  player: string;
  received: number;
  given: number;
  net: number;
}

export function tradeSummaryData(game: ProcessedGame): TradeSummaryRow[] {
  const sum = (arr: number[] | undefined) => (arr ?? []).reduce((a, b) => a + b, 0);
  return game.playerOrder.map((player) => {
    const received = sum(game.trades.p2pReceived[player]) + sum(game.trades.p2bReceived[player]);
    const given = sum(game.trades.p2pGiven[player]) + sum(game.trades.p2bGiven[player]);
    return { player, received, given, net: received - given };
  });
}

export interface StealRow {
  stealer: string;
  victim: string;
  count: number;
}

export function stealRows(game: ProcessedGame): StealRow[] {
  const rows: StealRow[] = [];
  for (const stealer of Object.keys(game.stealMap)) {
    for (const victim of Object.keys(game.stealMap[stealer])) {
      rows.push({ stealer, victim, count: game.stealMap[stealer][victim] });
    }
  }
  return rows.sort((a, b) => b.count - a.count);
}
