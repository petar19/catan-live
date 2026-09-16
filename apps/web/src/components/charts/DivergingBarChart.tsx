import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePalette } from "../../lib/palette";

export interface DivergingLayer {
  dataKey: string;
  name: string;
  /** Which side of zero this layer's values are on. Positive and negative
   * layers MUST use different Recharts stackIds — Recharts/d3 stacking
   * accumulates in declaration order regardless of sign when layers share one
   * stackId, so a negative layer declared after a positive one ends up offset
   * by the positive layer's cumulative height instead of starting at zero
   * (this was a real bug: a "given" bar could render starting above zero, or
   * land exactly on top of — fully hiding — a "received" bar of the same
   * height). Two stackIds, one per sign, is what actually gets a proper
   * diverging bar. */
  sign: "positive" | "negative";
  /** Flat color for every category. Ignored if `colorFor` is given. */
  color?: string;
  /** Per-category color override (e.g. resource identity color per x-axis
   * category) — takes precedence over `color` when provided. */
  colorFor?: (row: Record<string, string | number>, rowIndex: number) => string;
}

interface Props {
  data: Array<Record<string, string | number>>;
  categoryKey: string;
  layers: DivergingLayer[];
  height?: number;
}

/** One diverging stacked-bar subplot: positive values stack up from 0,
 * negative stack down — each layer's dataKey must already carry its sign.
 * No legend here by design; render one shared legend once above a grid of
 * these instead of repeating it per subplot. */
export function DivergingBarChart({ data, categoryKey, layers, height = 200 }: Props) {
  const { textSecondary, gridLine } = usePalette();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={gridLine} vertical={false} />
        <XAxis dataKey={categoryKey} tick={{ fill: textSecondary, fontSize: 11 }} />
        <YAxis tick={{ fill: textSecondary, fontSize: 11 }} allowDecimals={false} width={28} />
        <ReferenceLine y={0} stroke={gridLine} />
        <Tooltip contentStyle={{ fontSize: 12 }} itemSorter={(item) => -(Number(item.value) || 0)} />
        {layers.map((layer) => (
          <Bar
            key={layer.dataKey}
            dataKey={layer.dataKey}
            name={layer.name}
            stackId={`stack-${layer.sign}`}
            fill={layer.color}
            radius={[2, 2, 2, 2]}
          >
            {layer.colorFor && data.map((row, i) => <Cell key={i} fill={layer.colorFor!(row, i)} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
