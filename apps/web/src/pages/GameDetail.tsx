import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GameDoc } from "../lib/useGames";
import { GameCharts, GAME_CHART_SECTIONS } from "../components/GameCharts";
import { ShareButton } from "../components/ShareButton";
import { SectionNav } from "../components/SectionNav";

export function GameDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<GameDoc | null | undefined>(undefined);

  useEffect(() => {
    if (!gameId) return;
    return onSnapshot(doc(db, "games", gameId), (snap) => {
      setGame(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<GameDoc, "id">) } : null);
    });
  }, [gameId]);

  if (game === undefined) return <p>Loading…</p>;
  if (game === null) return <p>Game not found.</p>;

  return (
    <div>
      <p>
        <Link to="/">&larr; All games</Link>
      </p>
      <h1>
        {game.parsed.winner} won <span className="muted">— {new Date(game.playedAt).toLocaleDateString()}</span>
      </h1>
      <p className="muted">
        Final points: {game.parsed.playerOrder.map((p, i) => `${p} ${game.parsed.playerPoints[i]}`).join(" · ")}
      </p>
      {game.parsed.warnings.length > 0 && (
        <p className="warning">
          ⚠ {game.parsed.warnings.length} line(s) couldn't be parsed — stats below may be incomplete.
        </p>
      )}
      <ShareButton type="game" gameId={game.id} />
      <SectionNav sections={GAME_CHART_SECTIONS} />
      <GameCharts game={game.parsed} />
    </div>
  );
}
