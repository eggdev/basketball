import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type DatabaseConfig,
} from '@fantasy-basketball/database';
import { Effect } from 'effect';

import {
  collectAdvancedStats,
  commitAdvancedStatsImport,
  makeBallDontLieAdvancedStatsProvider,
} from '../src/lib/balldontlie-advanced';
import { loadBallDontLieConfig } from '../src/lib/player-production';

const shouldCommit = process.argv.includes('--commit');
const shouldRefresh = process.argv.includes('--refresh');
const seasonArgument = process.argv.find((argument) => argument.startsWith('--seasons='));
const seasons = (seasonArgument?.slice('--seasons='.length).split(',') ?? ['2025']).map((value) =>
  Number(value.trim()),
);

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const run = async () => {
  const databaseConfig = await Effect.runPromise(loadDatabaseConfig());
  const identities = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.playerProviderIdentities('balldontlie');
    }),
  );
  const providerConfig = await Effect.runPromise(loadBallDontLieConfig(process.cwd()));
  let pagesSeen = 0;
  const provider = makeBallDontLieAdvancedStatsProvider({
    ...providerConfig,
    onProgress: (progress) => {
      pagesSeen += 1;
      if (pagesSeen === 1 || pagesSeen % 10 === 0) {
        console.error(
          `[balldontlie] ${pagesSeen} advanced-stat pages processed (${progress.cacheHit ? 'cache' : 'network'})`,
        );
      }
    },
    refresh: shouldRefresh,
  });
  const plan = await Effect.runPromise(collectAdvancedStats({ identities, provider, seasons }));
  const summary = {
    fingerprint: plan.fingerprint,
    issues: plan.issues,
    seasonKeys: plan.seasonKeys,
    ...plan.summary,
  };

  if (!shouldCommit) {
    console.log(JSON.stringify({ mode: 'validate', ...summary }, null, 2));
    if (!plan.summary.valid) process.exitCode = 1;
    return;
  }

  const result = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* commitAdvancedStatsImport(plan, database);
    }),
  );
  console.log(JSON.stringify({ mode: 'commit', ...summary, ...result }, null, 2));
};

run().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : 'Advanced-stat import failed');
  process.exitCode = 1;
});
