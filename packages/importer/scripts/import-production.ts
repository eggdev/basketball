import {
  Database,
  databaseLayer,
  type DatabaseConfig,
  loadDatabaseConfig,
} from '@fantasy-basketball/database';
import { Effect } from 'effect';

import {
  collectPlayerProduction,
  commitPlayerProductionImport,
  loadBallDontLieConfig,
  loadPlayerProductionOverrides,
  makeBallDontLieProvider,
} from '../src/lib/player-production';

const shouldCommit = process.argv.includes('--commit');
const shouldRefresh = process.argv.includes('--refresh');
const seasonArgument = process.argv.find((argument) => argument.startsWith('--seasons='));

const seasons = (
  seasonArgument?.slice('--seasons='.length).split(',') ?? ['2021', '2022', '2023', '2024', '2025']
).map((value) => Number(value.trim()));

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const run = async () => {
  const databaseConfig = await Effect.runPromise(loadDatabaseConfig());
  const targets = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.canonicalPlayerIdentities;
    }),
  );

  let pagesSeen = 0;
  const providerConfig = await Effect.runPromise(loadBallDontLieConfig(process.cwd()));
  const overrides = await Effect.runPromise(loadPlayerProductionOverrides(process.cwd()));
  const provider = makeBallDontLieProvider({
    ...providerConfig,
    onProgress: (progress) => {
      pagesSeen += 1;
      const reportEvery = progress.cacheHit ? 100 : 10;
      if (pagesSeen === 1 || pagesSeen % reportEvery === 0) {
        const source = progress.cacheHit ? 'cache' : 'network';
        console.error(
          `[balldontlie] ${pagesSeen} pages processed (${progress.resource}, ${source})`,
        );
      }
    },
    refresh: shouldRefresh,
  });
  const plan = await Effect.runPromise(
    collectPlayerProduction({ overrides, provider, seasons, targets }),
  );

  if (!shouldCommit) {
    console.log(
      JSON.stringify(
        {
          mode: 'validate',
          fingerprint: plan.fingerprint,
          ...plan.summary,
          issues: plan.issues,
        },
        null,
        2,
      ),
    );
    if (!plan.summary.valid) process.exitCode = 1;
    return;
  }

  const result = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* commitPlayerProductionImport(plan, database);
    }),
  );

  console.log(
    JSON.stringify({ mode: 'commit', fingerprint: plan.fingerprint, ...result }, null, 2),
  );
};

run().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : 'Player production import failed');
  process.exitCode = 1;
});
