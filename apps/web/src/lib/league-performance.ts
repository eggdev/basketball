import {
  Database,
  databaseLayer,
  type LeaguePerformanceHistory,
  loadDatabaseConfig,
} from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';

/** Loads normalized standings, weekly matchups, and derived team success metrics. */
export async function loadLeaguePerformance(): Promise<LeaguePerformanceHistory> {
  const config = await Effect.runPromise(loadDatabaseConfig());

  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.leaguePerformanceHistory;
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
