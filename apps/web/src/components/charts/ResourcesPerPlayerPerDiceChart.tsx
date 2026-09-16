import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { POSSIBLE_RESOURCES, type ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";
import { resourcesPerDiceForPlayer } from "../../lib/chartData";
import { ChartLegend } from "./ChartLegend";

/** Port of v1's plot_resources_per_players_per_dices: 4 small multiples (one
 * per player), 11 columns (dice totals 2-12), each stacked by resource —
 * shows which rolls actually paid off for that player, not just totals. */
export function ResourcesPerPlayerPerDiceChart({ game }: { game: ProcessedGame }) {
  const { resourceColors, textSecondary, gridLine } = usePalette();

  return (
    <div>
      <ChartLegend items={POSSIBLE_RESOURCES.map((r) => ({ label: r, color: resourceColors[r] }))} />
      <div className="small-multiples">
        {game.playerOrder.map((player) => (
          <div key={player}>
            <h3>{player}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={resourcesPerDiceForPlayer(game, player)} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={gridLine} vertical={false} />
                <XAxis dataKey="total" tick={{ fill: textSecondary, fontSize: 11 }} />
                <YAxis tick={{ fill: textSecondary, fontSize: 11 }} allowDecimals={false} width={28} />
                <Tooltip contentStyle={{ fontSize: 12 }} itemSorter={(item) => -(Number(item.value) || 0)} />
                {POSSIBLE_RESOURCES.map((resource) => (
                  <Bar key={resource} dataKey={resource} name={resource} stackId="stack" fill={resourceColors[resource]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  );
}
