import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { filterLines, processGame } from "@catan-live/parser";
import { submitGameSecret } from "./lib/secrets.js";
import { PARSER_VERSION } from "./submitGame.js";
import { loadAliases, loadLatestRulesVersion, loadRulesByVersion } from "./lib/parserConfig.js";

/**
 * Explicit, single-game reprocess — the tool for "I just fixed a broken
 * regex, apply the new rule version to the game that broke." Unlike
 * `reprocessGames` (blanket, code-only, reuses each game's existing rule
 * binding), this one *changes* which rule version a specific game is bound
 * to. Deliberately requires an explicit gameId every time — there is no
 * "reprocess everyone with the latest rules" action, on purpose (see
 * CLAUDE.md Phase 5.5): that would risk silently corrupting old games that
 * depended on wording a rule fix replaces.
 *
 * Usage:
 *   curl -X POST https://REGION-PROJECT.cloudfunctions.net/reprocessGame \
 *     -H "X-Submit-Secret: $SECRET" -H "Content-Type: application/json" \
 *     -d '{"gameId":"abc123"}'                    # uses the latest rule version
 *     -d '{"gameId":"abc123","rulesVersion":2}'   # or pin to a specific one
 */
export const reprocessGame = onRequest({ secrets: [submitGameSecret], invoker: "public" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }
  if (req.get("x-submit-secret") !== submitGameSecret.value()) {
    res.status(401).send("unauthorized");
    return;
  }

  const body = req.body as { gameId?: unknown; rulesVersion?: unknown };
  if (typeof body.gameId !== "string" || body.gameId.length === 0) {
    res.status(400).send("expected JSON body: { gameId: string, rulesVersion?: number }");
    return;
  }
  if (body.rulesVersion !== undefined && typeof body.rulesVersion !== "number") {
    res.status(400).send("rulesVersion must be a number if provided");
    return;
  }

  const db = getFirestore();
  const gameRef = db.collection("games").doc(body.gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) {
    res.status(404).send("game not found");
    return;
  }

  const rulesVersion = body.rulesVersion ?? (await loadLatestRulesVersion());
  const [aliases, rules] = await Promise.all([loadAliases(), loadRulesByVersion(rulesVersion)]);

  const filtered = filterLines(gameSnap.data()!.rawLines as string[], aliases);
  const parsed = processGame(filtered, rules);

  await gameRef.update({ parsed, parserVersion: PARSER_VERSION, rulesVersion });

  res.status(200).json({ gameId: body.gameId, rulesVersion, warnings: parsed.warnings });
});
