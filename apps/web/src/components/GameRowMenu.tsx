import { useEffect, useRef, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { deleteGame } from "../lib/gameActions";

/** "⋮" menu for a row in the games list — share (copies the link) and delete
 * (with confirmation). Deleting doesn't need to manually update any local
 * list state: `useGames()` is a live `onSnapshot` listener, so the row just
 * disappears on its own once the doc is gone. */
export function GameRowMenu({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleShare() {
    setBusy(true);
    try {
      const shareId = crypto.randomUUID();
      await setDoc(doc(db, "shares", shareId), {
        type: "game",
        gameId,
        revoked: false,
        createdAt: serverTimestamp(),
      });
      const url = `${window.location.origin}${import.meta.env.BASE_URL}shared/${shareId}`;
      await navigator.clipboard.writeText(url);
      setStatus("Link copied!");
      setTimeout(() => setStatus(null), 2000);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this game permanently? This can't be undone.")) return;
    setBusy(true);
    try {
      await deleteGame(gameId);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="row-menu" ref={rootRef}>
      <button className="row-menu-trigger" onClick={() => setOpen((o) => !o)} aria-label="Game actions">
        &#8942;
      </button>
      {open && (
        <div className="row-menu-dropdown">
          <button onClick={() => void handleShare()} disabled={busy}>
            Share
          </button>
          <button className="danger" onClick={() => void handleDelete()} disabled={busy}>
            Delete
          </button>
        </div>
      )}
      {status && <span className="muted row-menu-status">{status}</span>}
    </div>
  );
}
