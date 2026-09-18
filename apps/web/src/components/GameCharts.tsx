import type { ProcessedGame } from "@catan-live/parser";
import type { Section } from "./SectionNav";
import { PointsOverTurnsChart } from "./charts/PointsOverTurnsChart";
import { DiceRollTimingChart } from "./charts/DiceRollTimingChart";
import { ResourcesPerPlayerChart } from "./charts/ResourcesPerPlayerChart";
import { ResourcesPerPlayerPerDiceChart } from "./charts/ResourcesPerPlayerPerDiceChart";
import { PlayerDiceRollsChart } from "./charts/PlayerDiceRollsChart";
import { ResourcesThroughTurnsChart } from "./charts/ResourcesThroughTurnsChart";
import { TradesChart } from "./charts/TradesChart";
import { StealsChart } from "./charts/StealsChart";
import { TradeNetworkDiagram } from "./charts/TradeNetworkDiagram";

export const GAME_CHART_SECTIONS: Section[] = [
  { id: "points-over-turns", label: "Points" },
  { id: "resources-over-turns", label: "Resources over time" },
  { id: "resources-per-player", label: "Resources/player" },
  { id: "resources-per-dice", label: "Resources/dice" },
  { id: "dice-per-player", label: "Dice/player" },
  { id: "dice-timing", label: "Dice timing" },
  { id: "trades", label: "Trades" },
  { id: "trades-network", label: "Trade network" },
  { id: "steals", label: "Steals" },
];

/** Same sections, with every id prefixed — lets a page that stacks multiple
 * games (e.g. a combined share link) give each game's SectionNav distinct
 * scroll targets instead of colliding on the plain ids. */
export function gameChartSections(idPrefix: string): Section[] {
  return GAME_CHART_SECTIONS.map((s) => ({ ...s, id: `${idPrefix}${s.id}` }));
}

export function GameCharts({ game, idPrefix = "" }: { game: ProcessedGame; idPrefix?: string }) {
  return (
    <div className="game-charts">
      <section className="card" id={`${idPrefix}points-over-turns`}>
        <h2>Points over turns</h2>
        <PointsOverTurnsChart game={game} />
      </section>

      <section className="card" id={`${idPrefix}resources-over-turns`}>
        <h2>Resources over turns</h2>
        <ResourcesThroughTurnsChart game={game} />
      </section>

      <section className="card" id={`${idPrefix}resources-per-player`}>
        <h2>Resources per player</h2>
        <ResourcesPerPlayerChart game={game} />
      </section>

      <section className="card" id={`${idPrefix}resources-per-dice`}>
        <h2>Resources per player, by dice roll</h2>
        <ResourcesPerPlayerPerDiceChart game={game} />
      </section>

      <section className="card" id={`${idPrefix}dice-per-player`}>
        <h2>Dice rolls per player</h2>
        <PlayerDiceRollsChart game={game} />
      </section>

      <section className="card" id={`${idPrefix}dice-timing`}>
        <h2>Dice roll distribution &amp; timing</h2>
        <DiceRollTimingChart rollSequence={game.rollSequence} />
      </section>

      <section className="card" id={`${idPrefix}trades`}>
        <h2>Trades</h2>
        <TradesChart game={game} />
      </section>

      <section className="card" id={`${idPrefix}trades-network`}>
        <h2>
          Trades — network diagram <span className="badge">experimental</span>
        </h2>
        <TradeNetworkDiagram game={game} />
      </section>

      <section className="card" id={`${idPrefix}steals`}>
        <h2>Steals</h2>
        <StealsChart game={game} />
      </section>

      {/* Steal network diagram hidden for now per Petar (2026-09-16) — didn't like it as-is.
          Component still exists (StealNetworkDiagram.tsx, lib/networkDiagram.ts's
          buildStealDiagram) in case it's worth revisiting later. */}
    </div>
  );
}
