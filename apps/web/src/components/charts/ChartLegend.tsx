interface Props {
  items: Array<{ label: string; color: string }>;
}

/** Static legend rendered once above a grid of small multiples, instead of
 * repeating Recharts' per-chart Legend on every subplot. */
export function ChartLegend({ items }: Props) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label}>
          <i style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
