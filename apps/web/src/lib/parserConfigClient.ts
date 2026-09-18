import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { buildParserRules, type ParserRules, type ParserRuleSources } from "@catan-live/parser";
import { db } from "./firebase";

/**
 * Client-side mirror of functions/src/lib/parserConfig.ts — same idea, same
 * Firestore shapes, just using the client SDK instead of Admin SDK. Runs from
 * the admin UI (authenticated, has read access to playerAliases and write
 * access to games/parserRules per firestore.rules) and could run from
 * incognito mode too (parserRules is publicly readable; incognito never
 * touches playerAliases at all — see CLAUDE.md Phase 5.5).
 */

export async function loadAliases(): Promise<Record<string, string>> {
  const snap = await getDocs(collection(db, "playerAliases"));
  const aliases: Record<string, string> = {};
  snap.forEach((d) => {
    const canonical = d.data().canonical;
    if (typeof canonical === "string") aliases[d.id] = canonical;
  });
  return aliases;
}

export async function loadLatestRulesVersion(): Promise<number> {
  const metaSnap = await getDoc(doc(db, "parserRules", "_meta"));
  return (metaSnap.data()?.latestVersion as number | undefined) ?? 1;
}

export async function loadRulesSourcesByVersion(version: number): Promise<Partial<ParserRuleSources>> {
  const snap = await getDoc(doc(db, "parserRules", String(version)));
  return (snap.data()?.rules as Partial<ParserRuleSources> | undefined) ?? {};
}

export async function loadRulesByVersion(version: number): Promise<ParserRules> {
  return buildParserRules(await loadRulesSourcesByVersion(version));
}
