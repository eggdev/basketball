import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type LeagueTeamHistory,
} from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';

/** Loads the owner-only canonical team and manager history snapshot. */
export async function loadLeagueTeamHistory(): Promise<LeagueTeamHistory> {
  const config = await Effect.runPromise(loadDatabaseConfig());

  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.leagueTeamHistory;
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
