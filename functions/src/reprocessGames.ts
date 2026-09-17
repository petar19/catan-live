import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { filterLines, processGame, type ParserRules } from "@catan-live/parser";
import { submitGameSecret } from "./lib/secrets.js";
import { PARSER_VERSION } from "./submitGame.js";
import { loadAliases, loadRulesByVersion } from "./lib/parserConfig.js";

/**
 * Blanket, CODE/schema-level migration only — e.g. "I added a new computed
 * field to ProcessedGame, backfill it onto every game." Safe to run over
 * every game because it re-parses each one with its OWN already-bound
 * `rulesVersion` (never "latest") — it only re-derives outputs using newer
 * parser *code* against the exact same matching rules that game has always
 * used, so it can never change which lines match what.
 *
 * This is deliberately NOT the tool for "I fixed a broken regex" — that's
 * `reprocessGame.ts` (singular, explicit gameId, explicit new rulesVersion).
 * Blanket-upgrading every game to a new *rule* version here would risk
 * silently corrupting old games that depended on the wording a rule fix
 * replaces — see CLAUDE.md Phase 5.5 for the full reasoning. Games missing a
 * `rulesVersion` (everything migrated before this existed) default to 1,
 * which is accurate, not a guess: version 1 is exactly what
 * DEFAULT_PARSER_RULES (baked into the parser package) has always been.
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
  const [snap, aliases] = await Promise.all([db.collection("games").get(), loadAliases()]);

  let reprocessed = 0;
  let skipped = 0;
  const failed: Array<{ id: string; error: string }> = [];
  const rulesCache = new Map<number, ParserRules>();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.parserVersion === PARSER_VERSION) {
      skipped++;
      continue;
    }
    try {
      const rulesVersion = (data.rulesVersion as number | undefined) ?? 1;
      let rules = rulesCache.get(rulesVersion);
      if (!rules) {
        rules = await loadRulesByVersion(rulesVersion);
        rulesCache.set(rulesVersion, rules);
      }
      const filtered = filterLines(data.rawLines as string[], aliases);
      const parsed = processGame(filtered, rules);
      await doc.ref.update({ parsed, parserVersion: PARSER_VERSION, rulesVersion });
      reprocessed++;
    } catch (err) {
      failed.push({ id: doc.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  res.status(200).json({ total: snap.size, reprocessed, skipped, failed });
});
