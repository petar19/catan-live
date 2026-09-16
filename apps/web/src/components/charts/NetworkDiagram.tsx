import { useState } from "react";
import { usePalette } from "../../lib/palette";
import { CANVAS, type Diagram, type DiagramEdge } from "../../lib/networkDiagram";

const MIN_THICKNESS = 3;
const MAX_THICKNESS = 22;

function angleAndLength(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { angle: (Math.atan2(dy, dx) * 180) / Math.PI, length: Math.hypot(dx, dy) };
}

interface HoverState {
  edge: DiagramEdge;
  x: number;
  y: number;
}

/** Generic renderer for the bank-in-the-center trade/steal network diagrams.
 * Each edge is drawn as a ribbon: a group rotated to lie along the edge, with
 * colored segments stacked perpendicular to it (segment length along the edge
 * doesn't change, only the stack's total thickness — that's what encodes
 * volume). Opposite-side pairs are pre-split into two stub edges by
 * lib/networkDiagram.ts, each ending in an outward chevron to signal "this
 * connects off-screen, not a dead end."
 *
 * Hover uses a custom instant tooltip (mouse-tracked div), not native SVG
 * <title> — browsers delay those by ~1s and they can't show a table, and
 * Petar specifically wanted the full per-resource, per-direction breakdown
 * (e.g. "3 ore A->B, 1 ore B->A") on hover, not just a combined total. */
export function NetworkDiagram({ diagram }: { diagram: Diagram }) {
  const { textSecondary, gridLine } = usePalette();
  const [hover, setHover] = useState<HoverState | null>(null);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} style={{ width: "100%", height: "auto", maxWidth: 520, display: "block", margin: "0 auto" }}>
        {diagram.edges.map((edge) => {
          const { angle, length } = angleAndLength(edge.from, edge.to);
          const total = edge.segments.reduce((sum, s) => sum + s.value, 0);
          const thickness = total > 0 ? MIN_THICKNESS + (MAX_THICKNESS - MIN_THICKNESS) * (total / diagram.maxEdgeTotal) : MIN_THICKNESS;

          let cumulative = -thickness / 2;
          const segmentRects = edge.segments.map((seg, i) => {
            const h = total > 0 ? (seg.value / total) * thickness : 0;
            const y = cumulative;
            cumulative += h;
            return h > 0 ? <rect key={i} x={0} y={y} width={length} height={h} fill={seg.color} /> : null;
          });

          return (
            <g
              key={edge.id}
              transform={`translate(${edge.from.x} ${edge.from.y}) rotate(${angle})`}
              onMouseEnter={(e) => setHover({ edge, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover({ edge, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "default" }}
            >
              {/* wider invisible hit area, easier to hover than the (often thin) ribbon itself */}
              <line x1={0} y1={0} x2={length} y2={0} stroke="transparent" strokeWidth={Math.max(16, thickness)} />
              <line x1={0} y1={0} x2={length} y2={0} stroke={gridLine} strokeWidth={1} />
              {segmentRects}
              {edge.isWrapStub && <polygon points={`${length},-6 ${length + 10},0 ${length},6`} fill={textSecondary} />}
            </g>
          );
        })}

        {diagram.nodes.map((node) => (
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius}
              fill="var(--surface-raised)"
              stroke={node.isCenter ? textSecondary : "var(--text-primary)"}
              strokeWidth={2}
            />
            <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central" fontSize={node.isCenter ? 12 : 11} fill="var(--text-primary)">
              {node.isCenter ? node.label : node.label.slice(0, 2)}
            </text>
            {!node.isCenter && (
              <text x={node.x} y={node.y + node.radius + 16} textAnchor="middle" fontSize={12} fill={textSecondary}>
                {node.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hover && <EdgeTooltip hover={hover} />}
    </div>
  );
}

function EdgeTooltip({ hover }: { hover: HoverState }) {
  const { edge } = hover;
  const rows = edge.breakdown.filter((r) => r.aValue > 0 || r.bValue > 0);

  return (
    <div
      className="chart-tooltip"
      style={{ position: "fixed", left: hover.x + 14, top: hover.y + 14, zIndex: 1000, pointerEvents: "none", minWidth: 180 }}
    >
      <strong>
        {edge.aLabel} ↔ {edge.bLabel}
      </strong>
      {rows.length === 0 ? (
        <div className="muted">No activity</div>
      ) : (
        <table className="tooltip-table">
          <thead>
            <tr>
              <th></th>
              <th>{edge.aLabel} →</th>
              <th>{edge.bLabel} →</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>
                  <i style={{ background: row.aColor }} /> {row.label}
                </td>
                <td>{row.aValue}</td>
                <td>{row.bValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
