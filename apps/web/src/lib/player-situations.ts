import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type LatestProjectionSnapshot,
} from '@fantasy-basketball/database/runtime';
import { buildPlayerSituationBoard, type PlayerSituationBoard } from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';

/** Builds the current evidence-aware situation board from immutable source snapshots. */
export async function loadPlayerSituationBoard(
  projections: LatestProjectionSnapshot,
): Promise<PlayerSituationBoard> {
  const config = await Effect.runPromise(loadDatabaseConfig());
  const evidence = await Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      const [advancedHistory, context, productionHistory] = yield* Effect.all([
        database.playerAdvancedStatsHistory,
        database.latestPlayerContextSnapshot(projections.seasonKey),
        database.playerProductionHistory,
      ]);
      return { advancedHistory, context, productionHistory };
    }).pipe(Effect.provide(databaseLayer(config))),
  );

  return buildPlayerSituationBoard({
    advancedHistory: evidence.advancedHistory,
    asOf: evidence.context?.asOf ?? projections.asOf,
    contexts: evidence.context?.players,
    productionHistory: evidence.productionHistory,
    projections: projections.players.map((player) => ({
      availability: { expectedGames: player.availability.expectedGames },
      fantasyPointsPerGame: player.fantasyPointsPerGame,
      playerId: player.playerId,
      playerName: player.playerName,
      positions: player.positions,
      statsPerGame: player.statsPerGame ?? {},
      teamAbbreviation: player.teamAbbreviation,
    })),
    seasonKey: projections.seasonKey,
  });
}
