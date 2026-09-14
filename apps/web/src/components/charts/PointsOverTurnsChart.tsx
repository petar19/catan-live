import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";
import { pointsOverTurnsData } from "../../lib/chartData";

export function PointsOverTurnsChart({ game }: { game: ProcessedGame }) {
  const { seatColors, textSecondary, gridLine } = usePalette();
  const data = pointsOverTurnsData(game);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={gridLine} vertical={false} />
        <XAxis dataKey="turn" tick={{ fill: textSecondary, fontSize: 12 }} label={{ value: "Turn", position: "insideBottom", offset: -4, fill: textSecondary }} />
        <YAxis tick={{ fill: textSecondary, fontSize: 12 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {game.playerOrder.map((name, i) => (
          <Line key={name} type="monotone" dataKey={name} stroke={seatColors[i]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
