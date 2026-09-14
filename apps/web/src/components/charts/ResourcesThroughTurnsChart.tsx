import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { POSSIBLE_RESOURCES, type ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";

export function ResourcesThroughTurnsChart({ game }: { game: ProcessedGame }) {
  const { resourceColors, textSecondary, gridLine } = usePalette();

  const maxLength = Math.max(...POSSIBLE_RESOURCES.map((r) => game.resourcesThroughTurns[r]?.length ?? 0));
  const data = Array.from({ length: maxLength }, (_, turn) => {
    const row: Record<string, number> = { turn: turn + 1 };
    POSSIBLE_RESOURCES.forEach((resource) => {
      row[resource] = game.resourcesThroughTurns[resource]?.[turn] ?? 0;
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={gridLine} vertical={false} />
        <XAxis dataKey="turn" tick={{ fill: textSecondary, fontSize: 12 }} />
        <YAxis tick={{ fill: textSecondary, fontSize: 12 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {POSSIBLE_RESOURCES.map((resource, i) => (
          <Line key={resource} type="monotone" dataKey={resource} stroke={resourceColors[i]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
