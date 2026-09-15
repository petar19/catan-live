import type { ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";
import { tradesForPlayer } from "../../lib/chartData";
import { DivergingBarChart } from "./DivergingBarChart";
import { ChartLegend } from "./ChartLegend";

export function TradesChart({ game }: { game: ProcessedGame }) {
  const { seatColors } = usePalette();
  const playerColor = seatColors[0];
  const bankColor = seatColors[1];

  return (
    <div>
      <ChartLegend
        items={[
          { label: "With players", color: playerColor },
          { label: "With bank", color: bankColor },
        ]}
      />
      <p className="muted">Above zero = received, below zero = given away.</p>
      <div className="small-multiples">
        {game.playerOrder.map((player) => (
          <div key={player}>
            <h3>{player}</h3>
            <DivergingBarChart
              data={tradesForPlayer(game, player)}
              categoryKey="resource"
              layers={[
                { dataKey: "p2pReceived", name: "Received (players)", color: playerColor },
                { dataKey: "p2bReceived", name: "Received (bank)", color: bankColor },
                { dataKey: "p2pGiven", name: "Given (players)", color: playerColor },
                { dataKey: "p2bGiven", name: "Given (bank)", color: bankColor },
              ]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
