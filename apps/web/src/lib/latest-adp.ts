import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type LatestAdpSnapshot,
} from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';

/** Loads the newest versioned Fantrax public-market snapshot. */
export async function loadLatestAdpSnapshot(): Promise<LatestAdpSnapshot | null> {
  const config = await Effect.runPromise(loadDatabaseConfig());
  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.latestAdpSnapshot;
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
