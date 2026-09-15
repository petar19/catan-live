import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { POSSIBLE_RESOURCES, type ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";
import { resourcesForPlayer } from "../../lib/chartData";

export function ResourcesPerPlayerChart({ game }: { game: ProcessedGame }) {
  const { resourceColors, textSecondary, gridLine } = usePalette();

  return (
    <div className="small-multiples">
      {game.playerOrder.map((player) => {
        const data = resourcesForPlayer(game, player);
        return (
          <div key={player}>
            <h3>{player}</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data} margin={{ top: 16, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={gridLine} vertical={false} />
                <XAxis dataKey="resource" tick={{ fill: textSecondary, fontSize: 11 }} />
                <YAxis tick={{ fill: textSecondary, fontSize: 11 }} allowDecimals={false} width={28} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {POSSIBLE_RESOURCES.map((resource) => (
                    <Cell key={resource} fill={resourceColors[resource]} />
                  ))}
                  <LabelList dataKey="count" position="top" style={{ fill: textSecondary, fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
