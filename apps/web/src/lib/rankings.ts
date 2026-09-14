import type { GameDoc } from "./useGames";

export interface SeatRankings {
  totalPoints: number;
  avgPoints: number;
  /** index = placement, 0-indexed (0 = 1st place, 3 = 4th place) */
  placementCounts: [number, number, number, number];
}

export interface PlayerCareerStats {
  name: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  /** 1-indexed average finishing place (1 = always wins, 4 = always last) */
  avgPlacement: number;
  avgPoints: number;
}

/**
 * Port of v1's calculate_rankings.py calculate_game_rankings/update_rankings,
 * generalized to compute from live Firestore data instead of a hand-maintained
 * rankings.json. "Seat" here means join order in the game log (see
 * processGame.ts's players Map), not a literal board position.
 *
 * Matches v1's quirk of pinning the winner's points to exactly 10 for ranking
 * purposes (their tracked total can be slightly off from hidden VP dev cards
 * — see CLAUDE.md §2.4 — but we know for certain they had >=10).
 */
function normalizedPoints(game: GameDoc["parsed"]): number[] | null {
  const { players, playerOrder, playerPoints, winner } = game;
  if (playerOrder.length < 4 || playerOrder.some((p) => !p) || !winner) return null;
  const winnerSeat = players[winner];
  if (winnerSeat === undefined) return null;
  const points = [...playerPoints];
  points[winnerSeat] = 10;
  return points;
}

export function computeSeatRankings(games: GameDoc[]): SeatRankings[] {
  const seats: SeatRankings[] = Array.from({ length: 4 }, () => ({
    totalPoints: 0,
    avgPoints: 0,
    placementCounts: [0, 0, 0, 0],
  }));
  let n = 0;

  for (const game of games) {
    const points = normalizedPoints(game.parsed);
    if (!points) continue;
    n++;
    for (let seat = 0; seat < 4; seat++) {
      const p = points[seat];
      const placement = points.filter((x) => x > p).length;
      seats[seat].totalPoints += p;
      seats[seat].placementCounts[placement] += 1;
    }
  }

  seats.forEach((s) => {
    s.avgPoints = n > 0 ? s.totalPoints / n : 0;
  });
  return seats;
}

export function computePlayerCareerStats(games: GameDoc[]): PlayerCareerStats[] {
  const byName = new Map<string, { games: number; wins: number; placementSum: number; pointsSum: number }>();

  for (const game of games) {
    const points = normalizedPoints(game.parsed);
    if (!points) continue;
    const { players, playerOrder, winner } = game.parsed;

    for (const name of playerOrder) {
      const seat = players[name];
      const p = points[seat];
      const placement = points.filter((x) => x > p).length;
      const entry = byName.get(name) ?? { games: 0, wins: 0, placementSum: 0, pointsSum: 0 };
      entry.games += 1;
      entry.wins += name === winner ? 1 : 0;
      entry.placementSum += placement;
      entry.pointsSum += p;
      byName.set(name, entry);
    }
  }

  return [...byName.entries()]
    .map(([name, e]) => ({
      name,
      gamesPlayed: e.games,
      wins: e.wins,
      winRate: e.games > 0 ? e.wins / e.games : 0,
      avgPlacement: e.games > 0 ? e.placementSum / e.games + 1 : 0,
      avgPoints: e.games > 0 ? e.pointsSum / e.games : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate);
}
