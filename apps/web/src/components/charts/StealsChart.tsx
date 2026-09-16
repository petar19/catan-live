import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";

/** v1's original plot_steal design: 4 small multiples (one per player), each
 * a simple (non-diverging) bar per opponent — height = how many times this
 * player stole from that opponent. Each bar is colored as that *opponent's*
 * own seat color (same palette as the points-over-turns lines etc.), which
 * is meaningful here — it tells you which color is "them" — unlike the
 * earlier diverging design, which colored bars by an arbitrary steal
 * direction and happened to collide with a player's own identity color. */
export function StealsChart({ game }: { game: ProcessedGame }) {
  const { seatColors, textSecondary, gridLine } = usePalette();

  const hasAnySteals = Object.keys(game.stealMap).length > 0;
  if (!hasAnySteals) return <p className="muted">No steals recorded.</p>;

  return (
    <div>
      <p className="muted">Bar height = how many times that player stole from the named opponent.</p>
      <div className="small-multiples">
        {game.playerOrder.map((player) => {
          const opponents = game.playerOrder.filter((o) => o !== player);
          const data = opponents.map((opponent) => ({ opponent, count: game.stealMap[player]?.[opponent] ?? 0 }));

          return (
            <div key={player}>
              <h3>{player}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data} margin={{ top: 16, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={gridLine} vertical={false} />
                  <XAxis dataKey="opponent" tick={{ fill: textSecondary, fontSize: 11 }} />
                  <YAxis tick={{ fill: textSecondary, fontSize: 11 }} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {opponents.map((opponent) => (
                      <Cell key={opponent} fill={seatColors[game.players[opponent]]} />
                    ))}
                    <LabelList dataKey="count" position="top" style={{ fill: textSecondary, fontSize: 11 }} formatter={(v) => (Number(v) > 0 ? v : "")} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}
