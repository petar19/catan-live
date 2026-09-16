import { POSSIBLE_RESOURCES, type ProcessedGame } from "@catan-live/parser";

/**
 * Layout/data for the experimental trade & steal "network" diagrams — Petar's
 * idea: bank at center, 4 players at N/S/E/W, edges between every pair
 * (including a bank/player "spoke"), with opposite-side pairs (left-right,
 * top-bottom) drawn as two stubs running off the canvas edge instead of a
 * line straight through the bank node, per his ASCII sketch. Shown alongside
 * the existing diverging-bar charts for comparison, not replacing them —
 * see CLAUDE.md for why this is marked experimental.
 */

export const CANVAS = 600;
export const CENTER = CANVAS / 2;
const NODE_DIST = 220;
const STUB_LEN = 55;
const STUB_GAP = 18;

type Direction = "left" | "right" | "top" | "bottom";
const DIRECTIONS: Direction[] = ["left", "right", "top", "bottom"];
// index pairs into DIRECTIONS/playerOrder that are "adjacent" (form the diamond around the bank)
const DIAGONAL_PAIRS: [number, number][] = [
  [0, 2], // left-top
  [2, 1], // top-right
  [1, 3], // right-bottom
  [3, 0], // bottom-left
];
// index pairs that are directly opposite — drawn as wraparound stubs, not a line through the bank
const WRAP_PAIRS: [number, number][] = [
  [0, 1], // left-right
  [2, 3], // top-bottom
];

function directionVector(d: Direction) {
  switch (d) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
  }
}

function nodePoint(d: Direction) {
  const v = directionVector(d);
  return { x: CENTER + v.x * NODE_DIST, y: CENTER + v.y * NODE_DIST };
}

export interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  isCenter?: boolean;
}

export interface DiagramSegment {
  color: string;
  value: number;
  label: string;
}

export interface DiagramEdge {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  segments: DiagramSegment[];
  tooltip: string;
  isWrapStub?: boolean;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  maxEdgeTotal: number;
}

function edgeTotal(segments: DiagramSegment[]) {
  return segments.reduce((sum, s) => sum + s.value, 0);
}

function wrapStubs(
  aPoint: { x: number; y: number },
  bPoint: { x: number; y: number },
  aLabel: string,
  bLabel: string,
  segments: DiagramSegment[],
  tooltip: string,
  idPrefix: string,
): DiagramEdge[] {
  // both stubs carry the same data — they're the two visible ends of one logical
  // edge that "wraps around" the outside of the canvas instead of crossing the bank.
  const dir = { x: bPoint.x - aPoint.x, y: bPoint.y - aPoint.y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const unit = { x: dir.x / len, y: dir.y / len };
  return [
    {
      id: `${idPrefix}-a`,
      from: aPoint,
      to: { x: aPoint.x - unit.x * STUB_LEN, y: aPoint.y - unit.y * STUB_LEN },
      segments,
      tooltip: `${aLabel} ↔ ${bLabel} (wraps around): ${tooltip}`,
      isWrapStub: true,
    },
    {
      id: `${idPrefix}-b`,
      from: bPoint,
      to: { x: bPoint.x + unit.x * STUB_LEN, y: bPoint.y + unit.y * STUB_LEN },
      segments,
      tooltip: `${aLabel} ↔ ${bLabel} (wraps around): ${tooltip}`,
      isWrapStub: true,
    },
  ];
}

export { STUB_GAP };

export function buildTradeDiagram(game: ProcessedGame, resourceColors: Record<string, string>): Diagram {
  const players = game.playerOrder.map((name, i) => ({ name, direction: DIRECTIONS[i], point: nodePoint(DIRECTIONS[i]) }));

  const nodes: DiagramNode[] = [
    { id: "bank", label: "Bank", x: CENTER, y: CENTER, radius: 28, isCenter: true },
    ...players.map((p) => ({ id: p.name, label: p.name, x: p.point.x, y: p.point.y, radius: 22 })),
  ];

  function pairSegments(a: string, b: string): DiagramSegment[] {
    const aToB = game.tradesBetweenPlayers[a]?.[b] ?? [];
    const bToA = game.tradesBetweenPlayers[b]?.[a] ?? [];
    return POSSIBLE_RESOURCES.map((resource, i) => ({
      color: resourceColors[resource],
      value: (aToB[i] ?? 0) + (bToA[i] ?? 0),
      label: resource,
    }));
  }

  function bankSegments(player: string): DiagramSegment[] {
    return POSSIBLE_RESOURCES.map((resource, i) => ({
      color: resourceColors[resource],
      value: (game.trades.p2bReceived[player]?.[i] ?? 0) + (game.trades.p2bGiven[player]?.[i] ?? 0),
      label: resource,
    }));
  }

  const edges: DiagramEdge[] = [];

  players.forEach((p) => {
    const segments = bankSegments(p.name);
    edges.push({
      id: `bank-${p.name}`,
      from: { x: CENTER, y: CENTER },
      to: p.point,
      segments,
      tooltip: `Bank ↔ ${p.name}: ${edgeTotal(segments)} total (${segments.filter((s) => s.value > 0).map((s) => `${s.value} ${s.label}`).join(", ") || "none"})`,
    });
  });

  DIAGONAL_PAIRS.forEach(([ai, bi]) => {
    const a = players[ai];
    const b = players[bi];
    if (!a || !b) return;
    const segments = pairSegments(a.name, b.name);
    edges.push({
      id: `${a.name}-${b.name}`,
      from: a.point,
      to: b.point,
      segments,
      tooltip: `${a.name} ↔ ${b.name}: ${edgeTotal(segments)} total (${segments.filter((s) => s.value > 0).map((s) => `${s.value} ${s.label}`).join(", ") || "none"})`,
    });
  });

  WRAP_PAIRS.forEach(([ai, bi]) => {
    const a = players[ai];
    const b = players[bi];
    if (!a || !b) return;
    const segments = pairSegments(a.name, b.name);
    const summary = `${edgeTotal(segments)} total (${segments.filter((s) => s.value > 0).map((s) => `${s.value} ${s.label}`).join(", ") || "none"})`;
    edges.push(...wrapStubs(a.point, b.point, a.name, b.name, segments, summary, `${a.name}-${b.name}`));
  });

  return { nodes, edges, maxEdgeTotal: Math.max(1, ...edges.map((e) => edgeTotal(e.segments))) };
}

export function buildStealDiagram(game: ProcessedGame, colorA: string, colorB: string): Diagram {
  const players = game.playerOrder.map((name, i) => ({ name, direction: DIRECTIONS[i], point: nodePoint(DIRECTIONS[i]) }));

  const nodes: DiagramNode[] = players.map((p) => ({ id: p.name, label: p.name, x: p.point.x, y: p.point.y, radius: 22 }));

  function pairSegments(a: string, b: string): DiagramSegment[] {
    const aStoleFromB = game.stealMap[a]?.[b] ?? 0;
    const bStoleFromA = game.stealMap[b]?.[a] ?? 0;
    return [
      { color: colorA, value: aStoleFromB, label: `${a} stole from ${b}` },
      { color: colorB, value: bStoleFromA, label: `${b} stole from ${a}` },
    ];
  }

  const edges: DiagramEdge[] = [];

  DIAGONAL_PAIRS.forEach(([ai, bi]) => {
    const a = players[ai];
    const b = players[bi];
    if (!a || !b) return;
    const segments = pairSegments(a.name, b.name);
    edges.push({
      id: `${a.name}-${b.name}`,
      from: a.point,
      to: b.point,
      segments,
      tooltip: segments.map((s) => `${s.label}: ${s.value}`).join(" · "),
    });
  });

  WRAP_PAIRS.forEach(([ai, bi]) => {
    const a = players[ai];
    const b = players[bi];
    if (!a || !b) return;
    const segments = pairSegments(a.name, b.name);
    const summary = segments.map((s) => `${s.label}: ${s.value}`).join(" · ");
    edges.push(...wrapStubs(a.point, b.point, a.name, b.name, segments, summary, `${a.name}-${b.name}`));
  });

  return { nodes, edges, maxEdgeTotal: Math.max(1, ...edges.map((e) => edgeTotal(e.segments))) };
}
