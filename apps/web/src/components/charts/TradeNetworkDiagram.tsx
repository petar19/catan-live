import { POSSIBLE_RESOURCES, type ProcessedGame } from "@catan-live/parser";
import { usePalette } from "../../lib/palette";
import { buildTradeDiagram } from "../../lib/networkDiagram";
import { NetworkDiagram } from "./NetworkDiagram";
import { ChartLegend } from "./ChartLegend";

/** Experimental — see CLAUDE.md. Shown alongside TradesChart for comparison,
 * not as a replacement. Edge thickness = total resources moved between that
 * pair (either direction combined); color segments = resource breakdown.
 * Hover an edge for the exact split. */
export function TradeNetworkDiagram({ game }: { game: ProcessedGame }) {
  const { resourceColors } = usePalette();
  const diagram = buildTradeDiagram(game, resourceColors);

  return (
    <div>
      <ChartLegend items={POSSIBLE_RESOURCES.map((r) => ({ label: r, color: resourceColors[r] }))} />
      <p className="muted">
        Thickness = total resources moved between that pair. Bank sits in the center; opposite-side players connect
        via the stubs at the edges (they'd otherwise cross straight through the bank). Hover an edge for the exact
        breakdown.
      </p>
      <NetworkDiagram diagram={diagram} />
    </div>
  );
}
