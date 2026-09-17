import { getFirestore } from "firebase-admin/firestore";
import { serializeParserRules, type ParserRules } from "@catan-live/parser";

/**
 * Creates a new, immutable parserRules version and advances the "latest"
 * pointer (`parserRules/_meta.latestVersion`) — the *only* way new rules get
 * created. Versions are never edited in place: every save is a new version,
 * old versions stay exactly as they were for any game still bound to them.
 * See CLAUDE.md Phase 5.5 for why this isn't optional.
 */
export async function createParserRulesVersion(rules: ParserRules): Promise<number> {
  const db = getFirestore();
  const metaRef = db.collection("parserRules").doc("_meta");

  return db.runTransaction(async (tx) => {
    const metaSnap = await tx.get(metaRef);
    const nextVersion = ((metaSnap.data()?.latestVersion as number | undefined) ?? 0) + 1;

    tx.set(db.collection("parserRules").doc(String(nextVersion)), {
      version: nextVersion,
      createdAt: new Date().toISOString(),
      rules: serializeParserRules(rules),
    });
    tx.set(metaRef, { latestVersion: nextVersion }, { merge: true });

    return nextVersion;
  });
}
