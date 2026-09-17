import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type LeagueRosterSnapshot,
} from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';

/** Loads owner-only season rosters assembled from validated Fantrax auction imports. */
export async function loadLeagueRosters(): Promise<LeagueRosterSnapshot> {
  const config = await Effect.runPromise(loadDatabaseConfig());

  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.leagueRosterSnapshot;
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
