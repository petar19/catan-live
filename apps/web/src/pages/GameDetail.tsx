import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GameDoc } from "../lib/useGames";
import { deleteGame } from "../lib/gameActions";
import { GameCharts, GAME_CHART_SECTIONS } from "../components/GameCharts";
import { ShareButton } from "../components/ShareButton";
import { SectionNav } from "../components/SectionNav";

export function GameDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameDoc | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    return onSnapshot(doc(db, "games", gameId), (snap) => {
      setGame(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<GameDoc, "id">) } : null);
    });
  }, [gameId]);

  async function handleDelete() {
    if (!gameId) return;
    if (!confirm("Delete this game permanently? This can't be undone.")) return;
    setDeleting(true);
    try {
      await deleteGame(gameId);
      navigate("/");
    } finally {
      setDeleting(false);
    }
  }

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
          ⚠ {game.parsed.warnings.length} line(s) couldn't be parsed — stats below may be incomplete.{" "}
          <Link to={`/games/${game.id}/review`}>Review &amp; fix parsing →</Link>
        </p>
      )}
      <ShareButton type="game" gameId={game.id} />{" "}
      <Link to={`/games/${game.id}/review`}>
        <button>Review / debug parsing</button>
      </Link>{" "}
      <button className="danger" onClick={() => void handleDelete()} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete game"}
      </button>
      <SectionNav sections={GAME_CHART_SECTIONS} />
      <GameCharts game={game.parsed} />
    </div>
  );
}
