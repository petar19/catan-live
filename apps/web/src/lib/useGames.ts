import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import type { ProcessedGame } from "@catan-live/parser";
import { db } from "./firebase";

export interface GameDoc {
  id: string;
  parsed: ProcessedGame;
  parserVersion: number;
  rulesVersion?: number;
  rawLines: string[];
  createdAt: string;
  /** When the game was actually played, when known — backfilled from gamelog file
   * mtime for migrated games, otherwise submission time. Prefer this over
   * createdAt for anything user-facing. */
  playedAt: string;
  source: string;
}

interface UseGamesResult {
  games: GameDoc[];
  loading: boolean;
  error: string | null;
}

/** Live admin games list. Only ever reachable behind AdminGate — Firestore
 * rules independently enforce the same admin-only boundary server-side. */
export function useGames(): UseGamesResult {
  const [games, setGames] = useState<GameDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "games"), orderBy("playedAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        setGames(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GameDoc, "id">) })));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, []);

  return { games, loading, error };
}
