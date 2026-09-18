import {
  Database,
  databaseLayer,
  type LeagueRosterActivityHistory,
  loadDatabaseConfig,
} from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';

/** Loads daily Fantrax roster snapshots and ownership changes inferred between them. */
export async function loadLeagueRosterActivity(): Promise<LeagueRosterActivityHistory> {
  const config = await Effect.runPromise(loadDatabaseConfig());

  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.leagueRosterActivity;
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
