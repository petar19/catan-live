import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { usePalette } from "../../lib/palette";
import { diceTimingData, type DiceTimingRow } from "../../lib/chartData";

const BINS = 20;

function opacityForBin(binIndex: number, bins: number) {
  const t = bins <= 1 ? 1 : binIndex / (bins - 1);
  return 0.2 + 0.8 * t; // lighter = earlier, darker/more saturated = later
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
      <div className="muted">Most common in the {phase} game</div>
    </div>
  );
}

/** Bar height = total times that total rolled (directly comparable across
 * totals, unlike a per-row-normalized heatmap). Each bar is itself stacked
 * into time-windows, shaded light (early game) -> dark (late game) so you
 * can also see *when* a total tended to roll. Single hue, per the dataviz
 * skill's "sequential = one hue, light->dark" rule. */
export function DiceRollTimingChart({ rollSequence }: { rollSequence: number[] }) {
  const { heatmapHue, textSecondary, gridLine } = usePalette();
  const { rows, bins } = diceTimingData(rollSequence, BINS);

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
            <Bar key={i} dataKey={`bin_${i}`} stackId="stack" fill={heatmapHue} fillOpacity={opacityForBin(i, bins)} isAnimationActive={false}>
              {i === bins - 1 && (
                <LabelList dataKey="totalCount" position="top" style={{ fill: textSecondary, fontSize: 11 }} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="heatmap-axis-labels">
        <span>Lighter = earlier in the game</span>
        <span>Darker = later in the game</span>
      </div>
    </div>
  );
}
