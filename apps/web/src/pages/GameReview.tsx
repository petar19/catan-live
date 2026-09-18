import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { filterLines, processGame, type ParserRules } from "@catan-live/parser";
import { db } from "../lib/firebase";
import type { GameDoc } from "../lib/useGames";
import { loadAliases, loadLatestRulesVersion, loadRulesByVersion, loadRulesSourcesByVersion } from "../lib/parserConfigClient";
import { createParserRulesVersion } from "../lib/parserRulesClient";

const RULE_NAMES: Array<keyof ParserRules> = [
  "ROLL_RE",
  "GOT_RE",
  "VP_RE",
  "LONGEST_PASSED_RE",
  "LARGEST_PASSED_RE",
  "WIN_RE",
  "STEAL_RE",
  "STEAL_SINGLE_RE",
  "STEAL_NUMERIC_RE",
  "TRADE_P2P_RE",
  "TRADE_P2B_RE",
  "TRADED_WITH_RE",
];

const RULE_LABELS: Record<keyof ParserRules, string> = {
  ROLL_RE: "Dice roll",
  GOT_RE: "Got resources",
  VP_RE: "Victory point gain (generic)",
  LONGEST_PASSED_RE: "Longest road passed to someone else",
  LARGEST_PASSED_RE: "Largest army passed to someone else",
  WIN_RE: "Won the game",
  STEAL_RE: "Stole (space-separated resource, e.g. old format)",
  STEAL_SINGLE_RE: "Stole (single resource word) — used for card-count tracking",
  STEAL_NUMERIC_RE: "Stole N of a resource (numeric format)",
  TRADE_P2P_RE: "Player-to-player trade",
  TRADE_P2B_RE: "Player-to-bank trade",
  TRADED_WITH_RE: '"traded X for Y with Z" wording',
};

/**
 * Admin debug/review workspace for a single game (Phase 5.5): shows the raw
 * log lines and lets you edit them, edit the regex rules, and see the
 * re-parsed result *instantly* — entirely in the browser, no server
 * round-trip — before deciding to save anything. "Save as new rule version"
 * and "Reprocess this game" both write directly to Firestore using the
 * admin's own authenticated access (same as ShareButton does for shares) —
 * there's no need to go through the secret-gated Cloud Functions
 * (submitGame/reprocessGame) for an already-authenticated admin action; those
 * exist for the userscript's unauthenticated path and bulk/CLI use.
 */
export function GameReview() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<GameDoc | null | undefined>(undefined);
  const [aliases, setAliases] = useState<Record<string, string> | null>(null);
  const [boundVersion, setBoundVersion] = useState<number | null>(null);

  const [rawLinesText, setRawLinesText] = useState("");
  const [ruleTexts, setRuleTexts] = useState<Record<string, string>>({});
  const [ruleErrors, setRuleErrors] = useState<Record<string, string | undefined>>({});
  const [lastValidRules, setLastValidRules] = useState<ParserRules | null>(null);

  const [saving, setSaving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    (async () => {
      const [gameSnap, aliasMap] = await Promise.all([getDoc(doc(db, "games", gameId)), loadAliases()]);
      if (!gameSnap.exists()) {
        setGame(null);
        return;
      }
      const data: GameDoc = { id: gameSnap.id, ...(gameSnap.data() as Omit<GameDoc, "id">) };
      setGame(data);
      setAliases(aliasMap);
      setRawLinesText(data.rawLines.join("\n"));

      const version = data.rulesVersion ?? (await loadLatestRulesVersion());
      setBoundVersion(version);
      const [rules, sources] = await Promise.all([loadRulesByVersion(version), loadRulesSourcesByVersion(version)]);
      setLastValidRules(rules);
      const texts: Record<string, string> = {};
      for (const name of RULE_NAMES) texts[name] = sources[name]?.source ?? rules[name].source;
      setRuleTexts(texts);
    })();
  }, [gameId]);

  function handleRuleChange(name: keyof ParserRules, text: string) {
    setRuleTexts((prev) => ({ ...prev, [name]: text }));
    try {
      const re = new RegExp(text);
      setLastValidRules((prev) => (prev ? { ...prev, [name]: re } : prev));
      setRuleErrors((prev) => ({ ...prev, [name]: undefined }));
    } catch (err) {
      setRuleErrors((prev) => ({ ...prev, [name]: err instanceof Error ? err.message : String(err) }));
    }
  }

  const editedLines = useMemo(() => rawLinesText.split("\n"), [rawLinesText]);

  const preview = useMemo(() => {
    if (!lastValidRules || !aliases) return null;
    try {
      const filtered = filterLines(editedLines, aliases);
      return processGame(filtered, lastValidRules);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [editedLines, lastValidRules, aliases]);

  async function handleSaveVersion() {
    if (!lastValidRules) return;
    setSaving(true);
    setMessage(null);
    try {
      const version = await createParserRulesVersion(lastValidRules);
      setBoundVersion(version);
      setMessage(`Saved as rule version ${version}.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleReprocess() {
    if (!gameId || !preview || "error" in preview || boundVersion === null) return;
    setReprocessing(true);
    setMessage(null);
    try {
      const linesChanged = game && game.rawLines.join("\n") !== rawLinesText;
      await updateDoc(doc(db, "games", gameId), {
        parsed: preview,
        rulesVersion: boundVersion,
        ...(linesChanged ? { rawLines: editedLines } : {}),
      });
      setMessage("Reprocessed and saved to this game.");
    } finally {
      setReprocessing(false);
    }
  }

  if (game === undefined) return <p>Loading…</p>;
  if (game === null) return <p>Game not found.</p>;

  return (
    <div>
      <p>
        <Link to={`/games/${gameId}`}>&larr; Back to game</Link>
      </p>
      <h1>Review &amp; debug parsing</h1>
      <p className="muted">
        Edits here re-parse live in your browser as you type — nothing is saved until you click a save/reprocess
        button below. Currently bound to rule version {boundVersion ?? "…"}.
      </p>

      {message && <p className="muted">{message}</p>}

      <div className="card-grid-2">
        <section className="card">
          <h2>Raw log lines</h2>
          <textarea
            className="code-editor"
            rows={20}
            value={rawLinesText}
            onChange={(e) => setRawLinesText(e.target.value)}
            spellCheck={false}
          />
        </section>

        <section className="card">
          <h2>Result preview</h2>
          {!preview && <p className="muted">Loading rules…</p>}
          {preview && "error" in preview && <p className="warning">Parser threw: {preview.error}</p>}
          {preview && !("error" in preview) && (
            <div>
              <p>
                <strong>{preview.winner || "(no winner detected)"}</strong>{" "}
                {preview.playerOrder.map((p, i) => `${p}: ${preview.playerPoints[i]}`).join(" · ")}
              </p>
              {preview.warnings.length === 0 ? (
                <p className="muted">No warnings — every line matched a rule.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Text</th>
                      <th>Handler</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.warnings.map((w, i) => (
                      <tr key={i}>
                        <td>{w.lineIndex}</td>
                        <td className="code-cell">{w.line}</td>
                        <td>{w.handler}</td>
                        <td>{w.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <button onClick={() => void handleReprocess()} disabled={reprocessing || !preview || "error" in (preview ?? {})}>
            {reprocessing ? "Reprocessing…" : "Reprocess this game with the rules/lines above"}
          </button>
        </section>
      </div>

      <section className="card">
        <h2>Parsing rules</h2>
        <p className="muted">
          Editing here doesn't change the game until you save a new version below, and doesn't affect any other game
          until you separately reprocess them too — see CLAUDE.md Phase 5.5 for why there's no "update everyone"
          button on purpose.
        </p>
        <div className="rule-editor-grid">
          {RULE_NAMES.map((name) => (
            <div key={name}>
              <label>
                <code>{name}</code> — {RULE_LABELS[name]}
              </label>
              <input
                className="code-editor"
                type="text"
                value={ruleTexts[name] ?? ""}
                onChange={(e) => handleRuleChange(name, e.target.value)}
                spellCheck={false}
              />
              {ruleErrors[name] && <div className="warning">{ruleErrors[name]}</div>}
            </div>
          ))}
        </div>
        <button onClick={() => void handleSaveVersion()} disabled={saving}>
          {saving ? "Saving…" : "Save as new rule version"}
        </button>
      </section>
    </div>
  );
}
