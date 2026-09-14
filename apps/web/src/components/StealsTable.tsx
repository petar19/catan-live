import type { ProcessedGame } from "@catan-live/parser";
import { stealRows } from "../lib/chartData";

export function StealsTable({ game }: { game: ProcessedGame }) {
  const rows = stealRows(game);

  if (rows.length === 0) return <p className="muted">No steals recorded.</p>;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Stealer</th>
          <th>Victim</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.stealer}-${row.victim}`}>
            <td>{row.stealer}</td>
            <td>{row.victim}</td>
            <td>{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
