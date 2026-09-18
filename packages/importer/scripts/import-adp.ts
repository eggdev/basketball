import {
  Database,
  databaseLayer,
  type DatabaseConfig,
  loadDatabaseConfig,
} from '@fantasy-basketball/database';
import { Effect } from 'effect';

import {
  commitFantraxAdpImport,
  fetchFantraxAdp,
  planFantraxAdpImport,
} from '../src/lib/fantrax-adp';

const argument = (name: string): string | null =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

const shouldCommit = process.argv.includes('--commit');
const seasonKey = argument('season') ?? '2026-27';
const capturedAt = argument('captured-at') ?? new Date().toISOString();

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const run = async () => {
  const databaseConfig = await Effect.runPromise(loadDatabaseConfig());
  const [response, canonicalIdentities] = await Promise.all([
    Effect.runPromise(fetchFantraxAdp()),
    runWithDatabase(
      databaseConfig,
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.canonicalPlayerIdentities;
      }),
    ),
  ]);
  const plan = await Effect.runPromise(
    planFantraxAdpImport({ canonicalIdentities, capturedAt, response, seasonKey }),
  );
  const leaders = plan.records.slice(0, 10).map((record, index) => ({
    adp: record.adp,
    name: record.canonicalName,
    position: record.position,
    rank: index + 1,
  }));

  if (!shouldCommit) {
    console.log(
      JSON.stringify(
        {
          mode: 'validate',
          capturedAt: plan.capturedAt,
          fingerprint: plan.fingerprint,
          seasonKey: plan.seasonKey,
          ...plan.summary,
          leaders,
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* commitFantraxAdpImport(plan, database);
    }),
  );
  console.log(
    JSON.stringify(
      {
        mode: 'commit',
        capturedAt: plan.capturedAt,
        fingerprint: plan.fingerprint,
        seasonKey: plan.seasonKey,
        ...result,
        leaders,
      },
      null,
      2,
    ),
  );
};

run().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : 'ADP import failed');
  process.exitCode = 1;
});
