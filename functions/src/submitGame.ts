import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { filterLines, processGame } from "@catan-live/parser";
import { hashLines } from "./lib/contentHash.js";
import { submitGameSecret, discordWebhookUrlSecret } from "./lib/secrets.js";
import { postGameToDiscord } from "./lib/discord.js";
import { loadLatestParserConfig } from "./lib/parserConfig.js";

/** Bump whenever processGame's *code/schema* changes (new computed fields etc.) —
 * separate from `rulesVersion`, which tracks the line-matching regexes as data.
 * See CLAUDE.md Phase 5.5 for why these are two different axes of versioning. */
export const PARSER_VERSION = 3; // 2: added rollSequence, 3: added tradesBetweenPlayers

// Falls back to the known GitHub Pages destination even pre-deploy, so the
// returned link is correct once it's live rather than needing a later code change.
const SITE_URL = process.env.SITE_URL ?? "https://petar19.github.io/catan-live";

function gameUrl(gameId: string): string {
  return `${SITE_URL}/games/${gameId}`;
}

export const submitGame = onRequest(
  { secrets: [submitGameSecret, discordWebhookUrlSecret], cors: true, invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("method not allowed");
      return;
    }

    if (req.get("x-submit-secret") !== submitGameSecret.value()) {
      res.status(401).send("unauthorized");
      return;
    }

    const body = req.body as { lines?: unknown; sendToDiscord?: boolean; playedAt?: unknown };
    if (!Array.isArray(body.lines) || body.lines.length === 0 || !body.lines.every((l) => typeof l === "string")) {
      res.status(400).send("expected JSON body: { lines: string[], sendToDiscord?: boolean, playedAt?: string }");
      return;
    }
    const rawLines = body.lines as string[];

    // Optional: when the actual play date is known (e.g. backfilling from a
    // gamelog file's mtime during migration — see fixtures/migrate_to_firestore.mjs),
    // the caller can supply it. Falls back to ingestion time otherwise, which is
    // all we'll ever have for a live submission anyway.
    let playedAt = new Date().toISOString();
    if (typeof body.playedAt === "string") {
      const parsedDate = new Date(body.playedAt);
      if (isNaN(parsedDate.getTime())) {
        res.status(400).send("playedAt must be a valid date string");
        return;
      }
      playedAt = parsedDate.toISOString();
    }

    const { rules, rulesVersion, aliases } = await loadLatestParserConfig();

    const filtered = filterLines(rawLines, aliases);
    const contentHash = hashLines(filtered);

    const db = getFirestore();
    const gamesRef = db.collection("games");

    const existing = await gamesRef.where("contentHash", "==", contentHash).limit(1).get();
    if (!existing.empty) {
      const existingDoc = existing.docs[0];
      // Backfill support: a re-submit of an already-known game with a playedAt
      // can still correct that one field without re-parsing or duplicating.
      if (typeof body.playedAt === "string" && existingDoc.data().playedAt !== playedAt) {
        await existingDoc.ref.update({ playedAt });
      }
      res.status(200).json({ gameId: existingDoc.id, isNew: false, url: gameUrl(existingDoc.id) });
      return;
    }

    const parsed = processGame(filtered, rules);

    const docRef = await gamesRef.add({
      rawLines,
      contentHash,
      parserVersion: PARSER_VERSION,
      rulesVersion,
      parsed,
      createdAt: new Date().toISOString(),
      playedAt,
      source: "tampermonkey",
    });

    if (body.sendToDiscord) {
      try {
        await postGameToDiscord(discordWebhookUrlSecret.value(), docRef.id, parsed, SITE_URL);
      } catch (err) {
        console.error("discord post failed", err);
      }
    }

    // Always returned regardless of parse outcome — needs-review games get a
    // link too, so the userscript can offer to open them straight into the
    // review flow (Phase 5.5's admin debug UI) rather than just reporting a
    // status message. See CLAUDE.md Phase 5.5.
    res.status(200).json({ gameId: docRef.id, isNew: true, warnings: parsed.warnings, url: gameUrl(docRef.id) });
  }
);
