import type { ProcessedGame } from "@catan-live/parser";
import { tradeSummaryData } from "../lib/chartData";

export function TradesTable({ game }: { game: ProcessedGame }) {
  const rows = tradeSummaryData(game);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>Received</th>
          <th>Given</th>
          <th>Net</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.player}>
            <td>{row.player}</td>
            <td>{row.received}</td>
            <td>{row.given}</td>
            <td className={row.net > 0 ? "positive" : row.net < 0 ? "negative" : undefined}>
              {row.net > 0 ? "+" : ""}
              {row.net}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
