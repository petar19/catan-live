import type { ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";
import { buildStealDiagram } from "../../lib/networkDiagram";
import { NetworkDiagram } from "./NetworkDiagram";
import { ChartLegend } from "./ChartLegend";

/** Experimental — see CLAUDE.md. Shown alongside StealsChart for comparison.
 * Same layout as the trade diagram, minus the bank (steals aren't
 * resource-typed in the data, so each edge is just a two-way split: how much
 * each side stole from the other). */
export function StealNetworkDiagram({ game }: { game: ProcessedGame }) {
  const { gainLoss } = usePalette();
  const colorA = gainLoss.gain;
  const colorB = gainLoss.loss;
  const diagram = buildStealDiagram(game, colorA, colorB);

  if (Object.keys(game.stealMap).length === 0) return <p className="muted">No steals recorded.</p>;

  return (
    <div>
      <ChartLegend
        items={[
          { label: "Direction A", color: colorA },
          { label: "Direction B", color: colorB },
        ]}
      />
      <p className="muted">
        Each edge splits into both steal directions — the two colors just distinguish them per edge, they don't mean
        the same direction globally. Hover an edge for who stole from whom. No bank here since steals aren't
        resource-typed.
      </p>
      <NetworkDiagram diagram={diagram} />
    </div>
  );
}
