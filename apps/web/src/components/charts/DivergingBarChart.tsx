import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePalette } from "../../lib/palette";

export interface DivergingLayer {
  dataKey: string;
  name: string;
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
          <Bar key={layer.dataKey} dataKey={layer.dataKey} name={layer.name} stackId="stack" fill={layer.color} radius={[2, 2, 2, 2]}>
            {layer.colorFor && data.map((row, i) => <Cell key={i} fill={layer.colorFor!(row, i)} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
