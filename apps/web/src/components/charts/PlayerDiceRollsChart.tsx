import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";
import { playerDiceRollsData } from "../../lib/chartData";

export function PlayerDiceRollsChart({ game }: { game: ProcessedGame }) {
  const { seatColors, textSecondary, gridLine } = usePalette();
  const data = playerDiceRollsData(game);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={gridLine} vertical={false} />
        <XAxis dataKey="total" tick={{ fill: textSecondary, fontSize: 12 }} />
        <YAxis tick={{ fill: textSecondary, fontSize: 12 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {game.playerOrder.map((name, i) => (
          <Bar key={name} dataKey={name} fill={seatColors[i]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
