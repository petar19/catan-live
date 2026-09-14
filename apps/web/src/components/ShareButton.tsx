import { useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

interface Props {
  type: "game" | "combined";
  gameId?: string;
  gameIds?: string[];
}

/** Admin-only (rendered behind AdminGate) — writes shares/{shareId}, which
 * Firestore rules already restrict to admins. See CLAUDE.md §2.3. */
export function ShareButton({ type, gameId, gameIds }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createShare() {
    setBusy(true);
    try {
      const shareId = crypto.randomUUID();
      await setDoc(doc(db, "shares", shareId), {
        type,
        ...(gameId ? { gameId } : {}),
        ...(gameIds ? { gameIds } : {}),
        revoked: false,
        createdAt: serverTimestamp(),
      });
      setUrl(`${window.location.origin}${import.meta.env.BASE_URL}shared/${shareId}`);
    } finally {
      setBusy(false);
    }
  }

  if (url) {
    return (
      <p className="muted">
        Share link: <a href={url}>{url}</a>
      </p>
    );
  }

  return (
    <button onClick={() => void createShare()} disabled={busy}>
      {busy ? "Creating…" : "Create share link"}
    </button>
  );
}
