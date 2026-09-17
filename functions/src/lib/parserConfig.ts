import { getFirestore } from "firebase-admin/firestore";
import { buildParserRules, type ParserRules, type ParserRuleSources } from "@catan-live/parser";

/**
 * Loads live parsing configuration from Firestore (Phase 5.5): the current
 * `playerAliases` table (never versioned — aliases describe people, and a
 * rename should retroactively apply cleanly, unlike a rule change) and the
 * *latest* `parserRules` version (versioned and immutable — see
 * `lib/parserRulesStore.ts` for how versions get created).
 */

export interface ParserConfig {
  rules: ParserRules;
  rulesVersion: number;
  aliases: Record<string, string>;
}

export async function loadAliases(): Promise<Record<string, string>> {
  const db = getFirestore();
  const snap = await db.collection("playerAliases").get();
  const aliases: Record<string, string> = {};
  snap.forEach((doc) => {
    const canonical = doc.data().canonical;
    if (typeof canonical === "string") aliases[doc.id] = canonical;
  });
  return aliases;
}

export async function loadLatestRulesVersion(): Promise<number> {
  const db = getFirestore();
  const metaSnap = await db.collection("parserRules").doc("_meta").get();
  return (metaSnap.data()?.latestVersion as number | undefined) ?? 1;
}

export async function loadRulesByVersion(version: number): Promise<ParserRules> {
  const db = getFirestore();
  const snap = await db.collection("parserRules").doc(String(version)).get();
  const sources = snap.data()?.rules as Partial<ParserRuleSources> | undefined;
  return buildParserRules(sources ?? {});
}

/** What submitGame uses: the alias table plus whatever the latest rule version is. */
export async function loadLatestParserConfig(): Promise<ParserConfig> {
  const [aliases, rulesVersion] = await Promise.all([loadAliases(), loadLatestRulesVersion()]);
  const rules = await loadRulesByVersion(rulesVersion);
  return { rules, rulesVersion, aliases };
}
