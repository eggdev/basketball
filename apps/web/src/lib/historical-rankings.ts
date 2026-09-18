import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type HistoricalRankingSnapshot,
} from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';

/** Loads scored historical seasons without treating actual results as projections. */
export async function loadHistoricalRankings(): Promise<HistoricalRankingSnapshot> {
  const config = await Effect.runPromise(loadDatabaseConfig());

  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.historicalRankings;
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
