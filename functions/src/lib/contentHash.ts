import { createHash } from "node:crypto";

/** Content-hash dedupe, replacing v1's 95%-line-overlap heuristic (game_entry.py
 * check_if_exists) — exact and O(1) via a Firestore equality query instead of an
 * O(n) line-by-line comparison against "the previous game". */
export function hashLines(lines: string[]): string {
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
