import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type HistoricalAuctionMarket,
} from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';

/** Loads a serializable market snapshot using the pooled application connection. */
export async function loadHistoricalAuctionMarket(): Promise<HistoricalAuctionMarket> {
  const config = await Effect.runPromise(loadDatabaseConfig());

  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.historicalAuctionMarket;
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
