import { POSSIBLE_RESOURCES, type ProcessedGame } from "@catan-live/parser";
import { darkenHex, usePalette } from "../../lib/palette";
import { tradesForPlayer } from "../../lib/chartData";
import { DivergingBarChart } from "./DivergingBarChart";
import { ChartLegend } from "./ChartLegend";

const BANK_SHADE = 0.6; // bank-trade segments are this fraction as bright as the resource's base color

export function TradesChart({ game }: { game: ProcessedGame }) {
  const { resourceColors } = usePalette();
  const colorFor = (row: Record<string, string | number>) => resourceColors[row.resource as string];
  const bankColorFor = (row: Record<string, string | number>) => darkenHex(resourceColors[row.resource as string], BANK_SHADE);

  return (
    <div>
      <ChartLegend items={POSSIBLE_RESOURCES.map((r) => ({ label: r, color: resourceColors[r] }))} />
      <p className="muted">
        Above zero = received, below zero = given away. Darker shade = traded with the bank, lighter = traded with
        another player — same column, stacked.
      </p>
      <div className="small-multiples">
        {game.playerOrder.map((player) => (
          <div key={player}>
            <h3>{player}</h3>
            <DivergingBarChart
              data={tradesForPlayer(game, player)}
              categoryKey="resource"
              layers={[
                { dataKey: "p2pReceived", name: "Received (players)", colorFor },
                { dataKey: "p2bReceived", name: "Received (bank)", colorFor: bankColorFor },
                { dataKey: "p2pGiven", name: "Given (players)", colorFor },
                { dataKey: "p2bGiven", name: "Given (bank)", colorFor: bankColorFor },
              ]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
