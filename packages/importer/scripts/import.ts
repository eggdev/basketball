import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database';
import { Effect } from 'effect';

import {
  commitHistoricalAuctionImport,
  loadHistoricalAuctionSources,
  planHistoricalAuctionImport,
} from '../src/lib/importer';

const shouldCommit = process.argv.includes('--commit');

const run = async () => {
  const plan = await Effect.runPromise(
    loadHistoricalAuctionSources(process.cwd()).pipe(Effect.flatMap(planHistoricalAuctionImport)),
  );

  if (!shouldCommit) {
    console.log(
      JSON.stringify({ mode: 'validate', fingerprint: plan.fingerprint, ...plan.summary }, null, 2),
    );
    return;
  }

  const config = await Effect.runPromise(loadDatabaseConfig());
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* commitHistoricalAuctionImport(plan, database);
    }).pipe(Effect.provide(databaseLayer(config))),
  );

  console.log(JSON.stringify({ mode: 'commit', ...result }, null, 2));
};

run().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : 'Historical import failed');
  process.exitCode = 1;
});
