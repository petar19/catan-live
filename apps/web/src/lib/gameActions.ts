import { deleteDoc, doc } from "firebase/firestore";
import { db } from "./firebase";

/** Permanent — no undo. Firestore rules restrict this to admins already;
 * callers are responsible for their own confirmation prompt. */
export async function deleteGame(gameId: string): Promise<void> {
  await deleteDoc(doc(db, "games", gameId));
}
