import { usePalette } from "../../lib/palette";
import { CANVAS, type Diagram } from "../../lib/networkDiagram";

const MIN_THICKNESS = 3;
const MAX_THICKNESS = 22;

function angleAndLength(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { angle: (Math.atan2(dy, dx) * 180) / Math.PI, length: Math.hypot(dx, dy) };
}

/** Generic renderer for the bank-in-the-center trade/steal network diagrams.
 * Each edge is drawn as a ribbon: a group rotated to lie along the edge, with
 * colored segments stacked perpendicular to it (so segment length along the
 * edge doesn't change, only the stack's total thickness — that's what encodes
 * volume). Opposite-side pairs (left-right, top-bottom) are pre-split into two
 * stub edges by lib/networkDiagram.ts, each ending in an outward chevron to
 * signal "this connects off-screen, not a dead end." */
export function NetworkDiagram({ diagram }: { diagram: Diagram }) {
  const { textSecondary, gridLine } = usePalette();

  return (
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
          <g key={edge.id} transform={`translate(${edge.from.x} ${edge.from.y}) rotate(${angle})`}>
            <line x1={0} y1={0} x2={length} y2={0} stroke={gridLine} strokeWidth={1} />
            {segmentRects}
            {edge.isWrapStub && (
              <polygon points={`${length},-6 ${length + 10},0 ${length},6`} fill={textSecondary} />
            )}
            <title>{edge.tooltip}</title>
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
            <text
              x={node.x}
              y={node.y + node.radius + 16}
              textAnchor="middle"
              fontSize={12}
              fill={textSecondary}
            >
              {node.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
