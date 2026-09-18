import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type LatestProjectionSnapshot,
} from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';

/** Loads the newest immutable projection snapshot for the research board. */
export async function loadLatestProjectionSnapshot(): Promise<LatestProjectionSnapshot | null> {
  const config = await Effect.runPromise(loadDatabaseConfig());

  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.latestProjectionSnapshot;
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
