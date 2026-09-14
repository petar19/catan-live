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
      <ul>
        {games.map((game) => (
          <li key={game.id}>
            <Link to={`/games/${game.id}`}>
              {new Date(game.createdAt).toLocaleString()} — {game.parsed.winner} won
              {game.parsed.warnings.length > 0 ? ` (${game.parsed.warnings.length} warning(s))` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
