import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";
import { diceRollsForPlayer } from "../../lib/chartData";

export function PlayerDiceRollsChart({ game }: { game: ProcessedGame }) {
  const { seatColors, textSecondary, gridLine } = usePalette();

  return (
    <div className="small-multiples">
      {game.playerOrder.map((player, i) => {
        const data = diceRollsForPlayer(game, player);
        return (
          <div key={player}>
            <h3>{player}</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data} margin={{ top: 16, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={gridLine} vertical={false} />
                <XAxis dataKey="total" tick={{ fill: textSecondary, fontSize: 11 }} />
                <YAxis tick={{ fill: textSecondary, fontSize: 11 }} allowDecimals={false} width={28} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" fill={seatColors[i]} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" style={{ fill: textSecondary, fontSize: 10 }} formatter={(v) => (Number(v) > 0 ? v : "")} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
