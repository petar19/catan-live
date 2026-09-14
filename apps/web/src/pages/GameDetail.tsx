import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GameDoc } from "../lib/useGames";

// Placeholder detail view — real charts land in Phase 3. For now, confirms
// the admin read path works end to end (Firestore rules + live query).
export function GameDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<GameDoc | null | undefined>(undefined);

  useEffect(() => {
    if (!gameId) return;
    return onSnapshot(doc(db, "games", gameId), (snap) => {
      setGame(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<GameDoc, "id">) }) : null);
    });
  }, [gameId]);

  if (game === undefined) return <p>Loading…</p>;
  if (game === null) return <p>Game not found.</p>;

  return (
    <div>
      <h1>{game.parsed.winner} won</h1>
      <p>{new Date(game.playedAt).toLocaleString()}</p>
      {game.parsed.warnings.length > 0 && (
        <p>⚠ {game.parsed.warnings.length} line(s) couldn't be parsed — see raw data below.</p>
      )}
      <pre>{JSON.stringify(game.parsed, null, 2)}</pre>
    </div>
  );
}
