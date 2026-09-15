import { diceHeatmapData } from "../../lib/chartData";
import { usePalette } from "../../lib/palette";

const BINS = 20;
const ROW_HEIGHT = 24;
const LABEL_WIDTH = 32;
const CHART_WIDTH = 760;

/**
 * Shows *when* each dice total tended to roll during the game, not just how
 * often — one row per total (2-12), one column per time-window. Each row is
 * normalized against its own peak bin (not the global max) so a rare total
 * like 2 or 12 still shows a legible pattern instead of looking empty next
 * to 7. Sequential single-hue ramp (opacity-based) per the dataviz skill's
 * "sequential = one hue" rule.
 */
export function DiceHeatmap({ rollSequence }: { rollSequence: number[] }) {
  const { heatmapHue, textSecondary, gridLine } = usePalette();
  const { rows, bins } = diceHeatmapData(rollSequence, BINS);
  const cellWidth = (CHART_WIDTH - LABEL_WIDTH) / bins;
  const height = rows.length * ROW_HEIGHT;

  if (rollSequence.length === 0) return <p className="muted">No rolls recorded.</p>;

  return (
    <div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${height}`} style={{ width: "100%", height: "auto" }}>
        {rows.map((row, rowIndex) => (
          <g key={row.total}>
            <text x={LABEL_WIDTH - 8} y={rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 + 4} textAnchor="end" fontSize={11} fill={textSecondary}>
              {row.total}
            </text>
            {row.counts.map((count, binIndex) => (
              <g key={binIndex}>
                <rect
                  x={LABEL_WIDTH + binIndex * cellWidth}
                  y={rowIndex * ROW_HEIGHT}
                  width={cellWidth - 1}
                  height={ROW_HEIGHT - 1}
                  fill={gridLine}
                  rx={2}
                />
                {count > 0 && (
                  <rect
                    x={LABEL_WIDTH + binIndex * cellWidth}
                    y={rowIndex * ROW_HEIGHT}
                    width={cellWidth - 1}
                    height={ROW_HEIGHT - 1}
                    fill={heatmapHue}
                    fillOpacity={0.15 + 0.85 * (count / row.max)}
                    rx={2}
                  >
                    <title>{`Rolled ${row.total}: ${count} time${count === 1 ? "" : "s"} in this window`}</title>
                  </rect>
                )}
              </g>
            ))}
          </g>
        ))}
      </svg>
      <div className="heatmap-axis-labels">
        <span>Game start</span>
        <span>Game end</span>
      </div>
    </div>
  );
}
