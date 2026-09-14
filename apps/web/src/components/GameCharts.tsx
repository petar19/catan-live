import type { ProcessedGame } from "@catan-live/parser";
import { PointsOverTurnsChart } from "./charts/PointsOverTurnsChart";
import { DiceDistributionChart } from "./charts/DiceDistributionChart";
import { ResourcesPerPlayerChart } from "./charts/ResourcesPerPlayerChart";
import { PlayerDiceRollsChart } from "./charts/PlayerDiceRollsChart";
import { ResourcesThroughTurnsChart } from "./charts/ResourcesThroughTurnsChart";
import { TradesTable } from "./TradesTable";
import { StealsTable } from "./StealsTable";

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

      <div className="card-grid">
        <section className="card">
          <h2>Resources per player</h2>
          <ResourcesPerPlayerChart game={game} />
        </section>

        <section className="card">
          <h2>Dice rolls per player</h2>
          <PlayerDiceRollsChart game={game} />
        </section>
      </div>

      <section className="card">
        <h2>Dice roll distribution</h2>
        <DiceDistributionChart dice={game.dice} />
      </section>

      <div className="card-grid">
        <section className="card">
          <h2>Trades</h2>
          <TradesTable game={game} />
        </section>

        <section className="card">
          <h2>Steals</h2>
          <StealsTable game={game} />
        </section>
      </div>
    </div>
  );
}
