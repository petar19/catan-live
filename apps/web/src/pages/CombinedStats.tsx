import { Link } from "react-router-dom";
import { useGames } from "../lib/useGames";
import { computePlayerCareerStats, computeSeatRankings } from "../lib/rankings";
import { usePalette } from "../lib/palette";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PLACEMENT_LABELS = ["1st", "2nd", "3rd", "4th"];

export function CombinedStats() {
  const { games, loading, error } = useGames();
  const { seatColors, textSecondary, gridLine } = usePalette();

  if (loading) return <p>Loading…</p>;
  if (error) return <p>Couldn't load games: {error}</p>;

  const seatRankings = computeSeatRankings(games);
  const careerStats = computePlayerCareerStats(games);

  return (
    <div>
      <p>
        <Link to="/">&larr; All games</Link>
      </p>
      <h1>Combined stats</h1>
      <p className="muted">Across {games.length} games.</p>

      <section className="card">
        <h2>Win rate by player</h2>
        <ResponsiveContainer width="100%" height={Math.max(200, careerStats.length * 32)}>
          <BarChart data={careerStats} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 16 }}>
            <CartesianGrid stroke={gridLine} horizontal={false} />
            <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fill: textSecondary, fontSize: 12 }} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fill: textSecondary, fontSize: 12 }} />
            <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="winRate" fill={seatColors[0]} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <h2>Player career stats</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Games</th>
              <th>Wins</th>
              <th>Win rate</th>
              <th>Avg finish</th>
              <th>Avg points</th>
            </tr>
          </thead>
          <tbody>
            {careerStats.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.gamesPlayed}</td>
                <td>{p.wins}</td>
                <td>{(p.winRate * 100).toFixed(0)}%</td>
                <td>{p.avgPlacement.toFixed(2)}</td>
                <td>{p.avgPoints.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Finishing position by starting seat</h2>
        <p className="muted">
          "Seat" is join order within the game log (who placed their first settlement first), not a literal board
          position.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Starting seat</th>
              {PLACEMENT_LABELS.map((label) => (
                <th key={label}>{label}</th>
              ))}
              <th>Avg points</th>
            </tr>
          </thead>
          <tbody>
            {seatRankings.map((seat, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {seat.placementCounts.map((count, j) => (
                  <td key={j}>{count}</td>
                ))}
                <td>{seat.avgPoints.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
