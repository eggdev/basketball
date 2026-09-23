import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';
import type { DraftActor } from './draft-access';
import { readDraftCapture, recordLiveDraftEvent } from './fantrax-live-server';

export async function saveDraftCapture(
  actor: DraftActor,
  leagueId: string,
  event: Record<string, unknown>,
): Promise<boolean> {
  if (actor.local) return recordLiveDraftEvent(leagueId, event);
  try {
    const config = await Effect.runPromise(loadDatabaseConfig());
    await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        yield* database.saveLiveDraftEvent(actor.id, leagueId, event);
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    return true;
  } catch {
    return false;
  }
}

export async function exportDraftCapture(
  actor: DraftActor,
  leagueId: string,
): Promise<string | null> {
  if (actor.local) return readDraftCapture(leagueId);
  const config = await Effect.runPromise(loadDatabaseConfig());
  const events = await Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.liveDraftEvents(actor.id, leagueId);
    }).pipe(Effect.provide(databaseLayer(config))),
  );
  return events.length ? events.map((event) => JSON.stringify(event)).join('\n') + '\n' : null;
}
