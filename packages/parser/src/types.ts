export const POSSIBLE_RESOURCES = ["grain", "ore", "wool", "brick", "lumber"] as const;
export type Resource = (typeof POSSIBLE_RESOURCES)[number];

export interface ParseWarning {
  lineIndex: number;
  line: string;
  handler: string;
  error: string;
}

export interface TradeTotals {
  p2pReceived: Record<string, number[]>;
  p2pGiven: Record<string, number[]>;
  p2bReceived: Record<string, number[]>;
  p2bGiven: Record<string, number[]>;
}

export interface ProcessedGame {
  /** dice[0] = count of rolls totaling 2, ... dice[10] = count of rolls totaling 12 */
  dice: number[];
  /** snapshot of `dice` after each roll, in roll order */
  diceUntilTurn: number[][];
  /** player name -> seat index (0-3). Mirrors v1's reverse-join-order assignment. */
  players: Record<string, number>;
  /** seat index (0-3) -> player name, derived from `players` */
  playerOrder: string[];
  /** final victory points, indexed by seat index */
  playerPoints: number[];
  /** turn number -> victory points snapshot (indexed by seat index) */
  playerPointsUntilTurn: Record<number, number[]>;
  /** player -> resource -> total resources received over the game */
  resourcesPerPlayer: Record<string, Record<Resource, number>>;
  /** player -> resource -> diceTotal(2-12) -> count received on that roll */
  resourcesPerPlayerPerDice: Record<string, Partial<Record<Resource, Record<number, number>>>>;
  /** resource -> cumulative total received by all players, indexed by turn */
  resourcesThroughTurns: Record<Resource, number[]>;
  /** number of completed turns (roll count) */
  turn: number;
  /** stealer -> victim -> steal count */
  stealMap: Record<string, Record<string, number>>;
  winner: string;
  /** turn number -> player -> card count snapshot */
  playerCardCountThroughTurns: Record<number, Record<string, number>>;
  /** player -> card count after each change */
  playerCardCountPerChange: Record<string, number[]>;
  trades: TradeTotals;
  /** player -> dice roll counts, same shape as `dice` */
  playerDiceRolls: Record<string, number[]>;
  warnings: ParseWarning[];
}
