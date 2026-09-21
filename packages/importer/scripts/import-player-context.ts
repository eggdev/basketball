import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type DatabaseConfig,
} from '@fantasy-basketball/database';
import { Effect } from 'effect';

import {
  commitReviewedPlayerContextImport,
  loadReviewedPlayerContextCsv,
  planReviewedPlayerContextImport,
} from '../src/lib/reviewed-player-context';

const argument = (name: string): string | null =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

const shouldCommit = process.argv.includes('--commit');
const seasonKey = argument('season') ?? '2026-27';
const asOf = argument('as-of') ?? new Date().toISOString().slice(0, 10);
const sourcePath = argument('file') ?? `data/raw/player-context/${seasonKey}.csv`;

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const run = async () => {
  const config = await Effect.runPromise(loadDatabaseConfig());
  const [csv, canonicalPlayers] = await Promise.all([
    Effect.runPromise(loadReviewedPlayerContextCsv(sourcePath)),
    runWithDatabase(
      config,
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.canonicalPlayers;
      }),
    ),
  ]);
  const plan = await Effect.runPromise(
    planReviewedPlayerContextImport({ asOf, canonicalPlayers, csv, seasonKey }),
  );
  const summary = {
    asOf: plan.asOf,
    fingerprint: plan.fingerprint,
    issues: plan.issues,
    seasonKey: plan.seasonKey,
    ...plan.summary,
  };

  if (!shouldCommit) {
    console.log(JSON.stringify({ mode: 'validate', ...summary }, null, 2));
    if (!plan.summary.valid) process.exitCode = 1;
    return;
  }

  const result = await runWithDatabase(
    config,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* commitReviewedPlayerContextImport(plan, database);
    }),
  );
  console.log(JSON.stringify({ mode: 'commit', ...summary, ...result }, null, 2));
};

run().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : 'Player context import failed');
  process.exitCode = 1;
});
