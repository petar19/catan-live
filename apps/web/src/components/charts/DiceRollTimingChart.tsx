import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { usePalette } from "../../lib/palette";
import { diceTimingData, type DiceTimingRow } from "../../lib/chartData";
import { ChartLegend } from "./ChartLegend";

const BINS = 4;
const QUARTER_LABELS = ["Quarter 1", "Quarter 2", "Quarter 3", "Quarter 4"];

interface TimingTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DiceTimingRow }>;
}

function TimingTooltip({ active, payload }: TimingTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <div className="chart-tooltip">
      <strong>
        Rolled {row.total}: {row.totalCount} time{row.totalCount === 1 ? "" : "s"}
      </strong>
      {row.totalCount > 0 && (
        <table className="tooltip-table">
          <tbody>
            {QUARTER_LABELS.map((label, i) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{row.bins[i] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Bar height = total times that total rolled. Each bar is split into the
 * game's 4 quarters, stacked bottom (quarter 1) to top (quarter 4), each
 * quarter a fixed, distinct color — this is v1's plot_dice_resource_stats
 * design (colors = yellow/gold/orange/red), brought back after two rounds of
 * a continuous density gradient that didn't read clearly for Petar either
 * time. Four named colors with a real legend beat a gradient here. */
export function DiceRollTimingChart({ rollSequence }: { rollSequence: number[] }) {
  const { quarterColors, textSecondary, gridLine } = usePalette();
  const { rows } = diceTimingData(rollSequence, BINS);
  // A stacked segment with value 0 doesn't render at all in Recharts, and a
  // LabelList attached to that segment doesn't render either — so a dice
  // total whose last quarter had zero rolls silently lost its total label.
  // Fix: stack one extra, always-nonzero "anchor" segment on top (too small
  // to visibly affect bar height) and put the label there instead, so it
  // always has something to attach to regardless of which quarters are zero.
  const data = rows.map((row) => ({ ...row, labelAnchor: 0.0001 }));

  if (rollSequence.length === 0) return <p className="muted">No rolls recorded.</p>;

  return (
    <div>
      <ChartLegend items={QUARTER_LABELS.map((label, i) => ({ label, color: quarterColors[i] }))} />
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={gridLine} vertical={false} />
          <XAxis dataKey="total" tick={{ fill: textSecondary, fontSize: 12 }} />
          <YAxis tick={{ fill: textSecondary, fontSize: 12 }} allowDecimals={false} />
          <Tooltip content={(props) => <TimingTooltip {...props} />} />
          {QUARTER_LABELS.map((label, i) => (
            <Bar key={i} dataKey={`bin_${i}`} name={label} stackId="stack" fill={quarterColors[i]} isAnimationActive={false} />
          ))}
          <Bar dataKey="labelAnchor" stackId="stack" fill="transparent" isAnimationActive={false}>
            <LabelList dataKey="totalCount" position="top" style={{ fill: textSecondary, fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="heatmap-axis-labels">
        <span>Bottom of bar = quarter 1 (game start)</span>
        <span>Top = quarter 4 (game end)</span>
      </div>
    </div>
  );
}
