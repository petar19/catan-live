import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Public, unauthenticated resolver for share links. Firestore rules keep
 * `games`/`shares` fully admin-only (see firestore.rules) — this function uses
 * the Admin SDK to read past those rules on the server, and returns only the
 * derived `parsed` stats, never `rawLines`. See CLAUDE.md §2.3 for why sharing
 * works this way instead of a public collection or copying data.
 */

interface ShareDoc {
  type: "game" | "combined";
  revoked?: boolean;
  gameId?: string;
  gameIds?: string[];
}

export const resolveShare = onCall(async (request) => {
  const shareId = request.data?.shareId;
  if (typeof shareId !== "string" || shareId.length === 0) {
    throw new HttpsError("invalid-argument", "shareId is required");
  }

  const db = getFirestore();
  const shareSnap = await db.collection("shares").doc(shareId).get();
  if (!shareSnap.exists) throw new HttpsError("not-found", "share not found");

  const share = shareSnap.data() as ShareDoc;
  if (share.revoked) throw new HttpsError("not-found", "share not found");

  if (share.type === "game" && share.gameId) {
    const gameSnap = await db.collection("games").doc(share.gameId).get();
    if (!gameSnap.exists) throw new HttpsError("not-found", "game not found");
    const game = gameSnap.data()!;
    return { type: "game", game: { id: gameSnap.id, parsed: game.parsed, createdAt: game.createdAt } };
  }

  if (share.type === "combined" && Array.isArray(share.gameIds) && share.gameIds.length > 0) {
    const snaps = await Promise.all(share.gameIds.map((id) => db.collection("games").doc(id).get()));
    const games = snaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, parsed: s.data()!.parsed, createdAt: s.data()!.createdAt }));
    return { type: "combined", games };
  }

  throw new HttpsError("failed-precondition", "malformed share doc");
});
