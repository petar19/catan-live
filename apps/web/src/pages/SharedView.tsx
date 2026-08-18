import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

// Public, unauthenticated route — no sign-in required. Talks to the
// `resolveShare` callable function (CLAUDE.md §2.3), never touches Firestore
// directly (there's no public Firestore access at all, by design).
export function SharedView() {
  const { shareId } = useParams<{ shareId: string }>();
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: unknown }>({
    status: "loading",
  });

  useEffect(() => {
    if (!shareId) return;
    const resolveShare = httpsCallable(functions, "resolveShare");
    resolveShare({ shareId })
      .then((res) => setState({ status: "ok", data: res.data }))
      .catch((err) => setState({ status: "error", message: err instanceof Error ? err.message : String(err) }));
  }, [shareId]);

  if (state.status === "loading") return <p>Loading…</p>;
  if (state.status === "error") return <p>Couldn't load this share link: {state.message}</p>;

  // Placeholder rendering — real charts land in Phase 4.
  return <pre>{JSON.stringify(state.data, null, 2)}</pre>;
}
