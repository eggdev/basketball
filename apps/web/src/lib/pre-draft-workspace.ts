import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type PreDraftWorkspace,
} from '@fantasy-basketball/database/runtime';
import { leagueOwnerProfile } from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';

export async function loadPreDraftWorkspace(seasonKey?: string): Promise<PreDraftWorkspace> {
  const config = await Effect.runPromise(loadDatabaseConfig());
  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.preDraftWorkspace(leagueOwnerProfile.canonicalKey, seasonKey);
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
