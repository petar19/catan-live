import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Public, unauthenticated resolver for share links. Firestore rules keep
 * `games`/`shares` fully admin-only (see firestore.rules) — this function uses
 * the Admin SDK to read past those rules on the server, and returns only the
 * derived `parsed` stats, never `rawLines`. See CLAUDE.md §2.3 for why sharing
 * works this way instead of a public collection or copying data.
 *
 * Plain HTTP endpoint (onRequest), not a callable (onCall) — `invoker: "public"`
 * does not actually make an onCall function's Cloud Run service publicly
 * invokable (confirmed by testing: it kept returning a 403 from Google's
 * frontend regardless of redeploys), while it works fine for onRequest. Same
 * pattern as submitGame/reprocessGames.
 */

interface ShareDoc {
  type: "game" | "combined";
  revoked?: boolean;
  gameId?: string;
  gameIds?: string[];
}

export const resolveShare = onRequest({ cors: true, invoker: "public" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }

  const shareId = (req.body as { shareId?: unknown })?.shareId;
  if (typeof shareId !== "string" || shareId.length === 0) {
    res.status(400).send("expected JSON body: { shareId: string }");
    return;
  }

  const db = getFirestore();
  const shareSnap = await db.collection("shares").doc(shareId).get();
  if (!shareSnap.exists) {
    res.status(404).send("share not found");
    return;
  }

  const share = shareSnap.data() as ShareDoc;
  if (share.revoked) {
    res.status(404).send("share not found");
    return;
  }

  if (share.type === "game" && share.gameId) {
    const gameSnap = await db.collection("games").doc(share.gameId).get();
    if (!gameSnap.exists) {
      res.status(404).send("game not found");
      return;
    }
    const game = gameSnap.data()!;
    res.status(200).json({ type: "game", game: { id: gameSnap.id, parsed: game.parsed, playedAt: game.playedAt } });
    return;
  }

  if (share.type === "combined" && Array.isArray(share.gameIds) && share.gameIds.length > 0) {
    const snaps = await Promise.all(share.gameIds.map((id) => db.collection("games").doc(id).get()));
    const games = snaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, parsed: s.data()!.parsed, playedAt: s.data()!.playedAt }));
    res.status(200).json({ type: "combined", games });
    return;
  }

  res.status(500).send("malformed share doc");
});
