import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { filterLines, processGame } from "@catan-live/parser";
import { submitGameSecret } from "./lib/secrets.js";
import { PARSER_VERSION } from "./submitGame.js";

/**
 * Re-derives `parsed` from the stored `rawLines` for every game (or games
 * below a given parserVersion), without needing the original gamelog files
 * again — this is the whole point of keeping rawLines as the source of truth
 * (see CLAUDE.md §2.4). Use whenever processGame.ts changes: bump
 * PARSER_VERSION in submitGame.ts, deploy, then call this once.
 *
 * Usage:
 *   curl -X POST https://REGION-PROJECT.cloudfunctions.net/reprocessGames \
 *     -H "X-Submit-Secret: $SECRET" -H "Content-Type: application/json" -d '{}'
 */
export const reprocessGames = onRequest({ secrets: [submitGameSecret], invoker: "public", timeoutSeconds: 300 }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }
  if (req.get("x-submit-secret") !== submitGameSecret.value()) {
    res.status(401).send("unauthorized");
    return;
  }

  const db = getFirestore();
  const snap = await db.collection("games").get();

  let reprocessed = 0;
  let skipped = 0;
  const failed: Array<{ id: string; error: string }> = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.parserVersion === PARSER_VERSION) {
      skipped++;
      continue;
    }
    try {
      const filtered = filterLines(data.rawLines as string[]);
      const parsed = processGame(filtered);
      await doc.ref.update({ parsed, parserVersion: PARSER_VERSION });
      reprocessed++;
    } catch (err) {
      failed.push({ id: doc.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  res.status(200).json({ total: snap.size, reprocessed, skipped, failed });
});
