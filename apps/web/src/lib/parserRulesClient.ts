import { doc, runTransaction } from "firebase/firestore";
import { serializeParserRules, type ParserRules } from "@catan-live/parser";
import { db } from "./firebase";

/**
 * Client-side mirror of functions/src/lib/parserRulesStore.ts's
 * createParserRulesVersion — creates a new, immutable parserRules version and
 * advances the "latest" pointer. Same rule as the server-side version:
 * versions are never edited in place, every save is a new version. Runs
 * directly from the admin UI (write access to parserRules per
 * firestore.rules) rather than through a Cloud Function — there's no reason
 * to round-trip to a server for something the admin's own Firestore access
 * already covers.
 */
export async function createParserRulesVersion(rules: ParserRules): Promise<number> {
  const metaRef = doc(db, "parserRules", "_meta");

  return runTransaction(db, async (tx) => {
    const metaSnap = await tx.get(metaRef);
    const nextVersion = ((metaSnap.data()?.latestVersion as number | undefined) ?? 0) + 1;

    tx.set(doc(db, "parserRules", String(nextVersion)), {
      version: nextVersion,
      createdAt: new Date().toISOString(),
      rules: serializeParserRules(rules),
    });
    tx.set(metaRef, { latestVersion: nextVersion }, { merge: true });

    return nextVersion;
  });
}
