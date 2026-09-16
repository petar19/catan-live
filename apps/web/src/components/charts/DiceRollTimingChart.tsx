import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { usePalette } from "../../lib/palette";
import { diceTimingData, type DiceTimingRow } from "../../lib/chartData";

const BINS = 20;

// Density relative to this total's OWN busiest window — not tied to time
// position. Segment position in the stack (bottom = early, top = late)
// already carries "when"; color instead answers "how concentrated was it
// there" so a tall, dark segment jumps out as a real clustering, not just
// "this happened to be a late-game slice."
function opacityForDensity(count: number, rowMax: number) {
  if (count <= 0) return 0;
  return 0.18 + 0.82 * (count / rowMax);
}

interface TimingTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DiceTimingRow }>;
  bins: number;
}

function TimingTooltip({ active, payload, bins }: TimingTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  if (row.totalCount === 0) {
    return (
      <div className="chart-tooltip">
        <strong>Rolled {row.total}: 0 times</strong>
      </div>
    );
  }

  let peakBin = 0;
  let peakValue = -1;
  row.bins.forEach((v, i) => {
    if (v > peakValue) {
      peakValue = v;
      peakBin = i;
    }
  });
  const pct = bins <= 1 ? 0 : peakBin / (bins - 1);
  const phase = pct < 0.33 ? "early" : pct < 0.66 ? "mid" : "late";

  return (
    <div className="chart-tooltip">
      <strong>
        Rolled {row.total}: {row.totalCount} time{row.totalCount === 1 ? "" : "s"}
      </strong>
      <div className="muted">
        Most concentrated in the {phase} game ({peakValue} in that window)
      </div>
    </div>
  );
}

/** Bar height = total times that total rolled (directly comparable across
 * totals). Each bar is stacked into ~20 time-windows bottom (game start) to
 * top (game end); a segment's color is how concentrated the rolls were in
 * that specific window relative to this total's own busiest window — a dark
 * segment means "a lot of this total rolled right around here," not just
 * "this is a late-game slice." Single hue, per the dataviz skill's
 * "sequential = one hue" rule. */
export function DiceRollTimingChart({ rollSequence }: { rollSequence: number[] }) {
  const { heatmapHue, textSecondary, gridLine } = usePalette();
  const { rows, bins } = diceTimingData(rollSequence, BINS);
  const rowMaxes = rows.map((row) => Math.max(1, ...row.bins));

  if (rollSequence.length === 0) return <p className="muted">No rolls recorded.</p>;

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={gridLine} vertical={false} />
          <XAxis dataKey="total" tick={{ fill: textSecondary, fontSize: 12 }} />
          <YAxis tick={{ fill: textSecondary, fontSize: 12 }} allowDecimals={false} />
          <Tooltip content={(props) => <TimingTooltip {...props} bins={bins} />} />
          {Array.from({ length: bins }, (_, i) => (
            <Bar key={i} dataKey={`bin_${i}`} stackId="stack" isAnimationActive={false}>
              {rows.map((row, rowIndex) => (
                <Cell key={rowIndex} fill={heatmapHue} fillOpacity={opacityForDensity(row.bins[i], rowMaxes[rowIndex])} />
              ))}
              {i === bins - 1 && (
                <LabelList dataKey="totalCount" position="top" style={{ fill: textSecondary, fontSize: 11 }} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="heatmap-axis-labels">
        <span>Bottom of bar = early game, top = late game</span>
        <span>Darker = rolls clustered there</span>
      </div>
    </div>
  );
}
