import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { filterLines, processGame } from "@catan-live/parser";
import { hashLines } from "./lib/contentHash.js";
import { submitGameSecret, discordWebhookUrlSecret } from "./lib/secrets.js";
import { postGameToDiscord } from "./lib/discord.js";

/** Bump whenever processGame's logic changes meaningfully, so stale games can be
 * found (`parserVersion < PARSER_VERSION`) and reprocessed. See CLAUDE.md §2.4. */
export const PARSER_VERSION = 1;

const SITE_URL = process.env.SITE_URL; // set post-deploy once the GitHub Pages URL is known

export const submitGame = onRequest(
  { secrets: [submitGameSecret, discordWebhookUrlSecret], cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("method not allowed");
      return;
    }

    if (req.get("x-submit-secret") !== submitGameSecret.value()) {
      res.status(401).send("unauthorized");
      return;
    }

    const body = req.body as { lines?: unknown; sendToDiscord?: boolean };
    if (!Array.isArray(body.lines) || body.lines.length === 0 || !body.lines.every((l) => typeof l === "string")) {
      res.status(400).send("expected JSON body: { lines: string[], sendToDiscord?: boolean }");
      return;
    }
    const rawLines = body.lines as string[];

    const filtered = filterLines(rawLines);
    const contentHash = hashLines(filtered);

    const db = getFirestore();
    const gamesRef = db.collection("games");

    const existing = await gamesRef.where("contentHash", "==", contentHash).limit(1).get();
    if (!existing.empty) {
      res.status(200).json({ gameId: existing.docs[0].id, isNew: false });
      return;
    }

    const parsed = processGame(filtered);

    const docRef = await gamesRef.add({
      rawLines,
      contentHash,
      parserVersion: PARSER_VERSION,
      parsed,
      createdAt: new Date().toISOString(),
      source: "tampermonkey",
    });

    if (body.sendToDiscord) {
      try {
        await postGameToDiscord(discordWebhookUrlSecret.value(), docRef.id, parsed, SITE_URL);
      } catch (err) {
        console.error("discord post failed", err);
      }
    }

    res.status(200).json({ gameId: docRef.id, isNew: true, warnings: parsed.warnings });
  }
);
