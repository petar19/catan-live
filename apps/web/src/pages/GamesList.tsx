import { Link } from "react-router-dom";
import { useGames } from "../lib/useGames";

export function GamesList() {
  const { games, loading, error } = useGames();

  if (loading) return <p>Loading games…</p>;
  if (error) return <p>Couldn't load games: {error}</p>;
  if (games.length === 0) return <p>No games yet — submit one from the userscript to see it here.</p>;

  return (
    <div>
      <h1>Games ({games.length})</h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Winner</th>
            <th>Players</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {games.map((game) => (
            <tr key={game.id}>
              <td>
                <Link to={`/games/${game.id}`}>{new Date(game.playedAt).toLocaleDateString()}</Link>
              </td>
              <td>{game.parsed.winner}</td>
              <td className="muted">{game.parsed.playerOrder.join(", ")}</td>
              <td>{game.parsed.warnings.length > 0 ? `⚠ ${game.parsed.warnings.length}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
