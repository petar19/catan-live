import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePalette } from "../../lib/palette";
import { diceDistributionData } from "../../lib/chartData";

export function DiceDistributionChart({ dice }: { dice: number[] }) {
  const { seatColors, textSecondary, gridLine } = usePalette();
  const data = diceDistributionData(dice);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={gridLine} vertical={false} />
        <XAxis dataKey="total" tick={{ fill: textSecondary, fontSize: 12 }} />
        <YAxis tick={{ fill: textSecondary, fontSize: 12 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" fill={seatColors[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
