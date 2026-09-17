import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { DEFAULT_PARSER_RULES, DEFAULT_PLAYER_ALIASES, serializeParserRules } from "@catan-live/parser";
import { submitGameSecret } from "./lib/secrets.js";

/**
 * One-time bootstrap: creates parserRules/1 and the playerAliases collection
 * from the parser package's hardcoded defaults — i.e. exactly what every
 * game so far has actually been parsed with, so retroactively binding
 * existing games to rulesVersion=1 (and having their identities resolve the
 * same way they always have) is accurate, not a guess.
 *
 * Both matter for the same reason: `submitGame` fetches *live* aliases from
 * Firestore now, and an empty `playerAliases` collection is not the same as
 * "use the defaults" — it silently produces different filtered text (and
 * thus a different content hash) than every previously-migrated game used,
 * breaking dedup and misidentifying renamed accounts. Confirmed this the
 * hard way: without this seed step, resubmitting an existing game created a
 * duplicate instead of matching.
 *
 * Safe to call more than once — each part no-ops if already seeded.
 */
export const seedParserRules = onRequest({ secrets: [submitGameSecret], invoker: "public" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }
  if (req.get("x-submit-secret") !== submitGameSecret.value()) {
    res.status(401).send("unauthorized");
    return;
  }

  const db = getFirestore();
  const result: { rules?: string; aliases?: string } = {};

  const existingRules = await db.collection("parserRules").doc("1").get();
  if (existingRules.exists) {
    result.rules = "version 1 already exists";
  } else {
    await db.collection("parserRules").doc("1").set({
      version: 1,
      createdAt: new Date().toISOString(),
      rules: serializeParserRules(DEFAULT_PARSER_RULES),
    });
    await db.collection("parserRules").doc("_meta").set({ latestVersion: 1 });
    result.rules = "seeded version 1";
  }

  const aliasesSnap = await db.collection("playerAliases").limit(1).get();
  if (!aliasesSnap.empty) {
    result.aliases = "playerAliases already has entries";
  } else {
    const batch = db.batch();
    for (const [raw, canonical] of Object.entries(DEFAULT_PLAYER_ALIASES)) {
      batch.set(db.collection("playerAliases").doc(raw), { canonical });
    }
    await batch.commit();
    result.aliases = `seeded ${Object.keys(DEFAULT_PLAYER_ALIASES).length} aliases`;
  }

  res.status(200).json(result);
});
