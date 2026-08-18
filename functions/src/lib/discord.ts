import type { ProcessedGame } from "@catan-live/parser";

export async function postGameToDiscord(webhookUrl: string, gameId: string, parsed: ProcessedGame, siteUrl?: string) {
  if (!webhookUrl) return;

  const pointsLine = parsed.playerOrder
    .map((player, i) => `${player}: ${parsed.playerPoints[i]}`)
    .join(" · ");

  const lines = [`**${parsed.winner}** won! (${pointsLine})`];
  if (siteUrl) lines.push(`${siteUrl}/games/${gameId}`);
  if (parsed.warnings.length > 0) {
    lines.push(`_${parsed.warnings.length} line(s) couldn't be parsed — check the admin view._`);
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: lines.join("\n") }),
  });

  if (!res.ok) {
    throw new Error(`discord webhook failed: ${res.status} ${await res.text()}`);
  }
}
