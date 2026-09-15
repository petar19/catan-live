import type { ProcessedGame } from "@catan-live/parser";
import { PointsOverTurnsChart } from "./charts/PointsOverTurnsChart";
import { DiceHeatmap } from "./charts/DiceHeatmap";
import { ResourcesPerPlayerChart } from "./charts/ResourcesPerPlayerChart";
import { PlayerDiceRollsChart } from "./charts/PlayerDiceRollsChart";
import { ResourcesThroughTurnsChart } from "./charts/ResourcesThroughTurnsChart";
import { TradesChart } from "./charts/TradesChart";
import { StealsChart } from "./charts/StealsChart";

export function GameCharts({ game }: { game: ProcessedGame }) {
  return (
    <div className="game-charts">
      <section className="card">
        <h2>Points over turns</h2>
        <PointsOverTurnsChart game={game} />
      </section>

      <section className="card">
        <h2>Resources over turns</h2>
        <ResourcesThroughTurnsChart game={game} />
      </section>

      <section className="card">
        <h2>Resources per player</h2>
        <ResourcesPerPlayerChart game={game} />
      </section>

      <section className="card">
        <h2>Dice rolls per player</h2>
        <PlayerDiceRollsChart game={game} />
      </section>

      <section className="card">
        <h2>When each dice total rolled</h2>
        <DiceHeatmap rollSequence={game.rollSequence} />
      </section>

      <section className="card">
        <h2>Trades</h2>
        <TradesChart game={game} />
      </section>

      <section className="card">
        <h2>Steals</h2>
        <StealsChart game={game} />
      </section>
    </div>
  );
}
