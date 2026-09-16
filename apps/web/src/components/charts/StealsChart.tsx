import type { ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";
import { stealsForPlayer } from "../../lib/chartData";
import { DivergingBarChart } from "./DivergingBarChart";
import { ChartLegend } from "./ChartLegend";

export function StealsChart({ game }: { game: ProcessedGame }) {
  const { gainLoss } = usePalette();
  const stoleColor = gainLoss.gain;
  const wasStolenColor = gainLoss.loss;

  const hasAnySteals = Object.keys(game.stealMap).length > 0;
  if (!hasAnySteals) return <p className="muted">No steals recorded.</p>;

  return (
    <div>
      <ChartLegend
        items={[
          { label: "Stole from them", color: stoleColor },
          { label: "They stole from you", color: wasStolenColor },
        ]}
      />
      <div className="small-multiples">
        {game.playerOrder.map((player) => (
          <div key={player}>
            <h3>{player}</h3>
            <DivergingBarChart
              data={stealsForPlayer(game, player)}
              categoryKey="opponent"
              layers={[
                { dataKey: "stolenFromThem", name: "Stole from them", color: stoleColor },
                { dataKey: "stolenByThem", name: "They stole from you", color: wasStolenColor },
              ]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
