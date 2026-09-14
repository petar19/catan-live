import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import type { ProcessedGame } from "@catan-live/parser";
import { functions } from "../lib/firebase";
import { GameCharts } from "../components/GameCharts";

interface SharedGame {
  id: string;
  parsed: ProcessedGame;
  playedAt: string;
}

type ResolveShareResult = { type: "game"; game: SharedGame } | { type: "combined"; games: SharedGame[] };

type ViewState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: ResolveShareResult };

// Public, unauthenticated route — no sign-in required. Talks to the
// `resolveShare` callable function (CLAUDE.md §2.3), never touches Firestore
// directly (there's no public Firestore access at all, by design).
export function SharedView() {
  const { shareId } = useParams<{ shareId: string }>();
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    if (!shareId) return;
    const resolveShare = httpsCallable<{ shareId: string }, ResolveShareResult>(functions, "resolveShare");
    resolveShare({ shareId })
      .then((res) => setState({ status: "ok", data: res.data }))
      .catch((err) => setState({ status: "error", message: err instanceof Error ? err.message : String(err) }));
  }, [shareId]);

  if (state.status === "loading") return <p>Loading…</p>;
  if (state.status === "error") return <p>Couldn't load this share link: {state.message}</p>;

  if (state.data.type === "game") {
    const { game } = state.data;
    return (
      <div>
        <h1>
          {game.parsed.winner} won <span className="muted">— {new Date(game.playedAt).toLocaleDateString()}</span>
        </h1>
        <GameCharts game={game.parsed} />
      </div>
    );
  }

  return (
    <div>
      <h1>{state.data.games.length} games</h1>
      {state.data.games.map((game) => (
        <div key={game.id} className="card">
          <h2>
            {game.parsed.winner} won <span className="muted">— {new Date(game.playedAt).toLocaleDateString()}</span>
          </h2>
          <GameCharts game={game.parsed} />
        </div>
      ))}
    </div>
  );
}
