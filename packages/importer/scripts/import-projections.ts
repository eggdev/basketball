import {
  Database,
  databaseLayer,
  type DatabaseConfig,
  loadDatabaseConfig,
} from '@fantasy-basketball/database';
import { Effect } from 'effect';

import {
  commitHashtagProjectionImport,
  loadHashtagProjectionCsv,
  planHashtagProjectionImport,
} from '../src/lib/hashtag-projections';
import {
  loadHistoricalScoringSource,
  parseLeagueScoringConfiguration,
} from '../src/lib/historical-scoring';

const argument = (name: string): string | null =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

const shouldCommit = process.argv.includes('--commit');
const seasonKey = argument('season') ?? '2026-27';
const asOf = argument('as-of') ?? new Date().toISOString().slice(0, 10);
const sourcePath = argument('file') ?? `data/raw/hashtag/${seasonKey}.csv`;

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const run = async () => {
  const databaseConfig = await Effect.runPromise(loadDatabaseConfig());
  const [csv, scoringSource, canonicalPlayers, history] = await Promise.all([
    Effect.runPromise(loadHashtagProjectionCsv(sourcePath)),
    Effect.runPromise(loadHistoricalScoringSource(process.cwd())),
    runWithDatabase(
      databaseConfig,
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.canonicalPlayers;
      }),
    ),
    runWithDatabase(
      databaseConfig,
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.playerProductionHistory;
      }),
    ),
  ]);
  const scoring = await Effect.runPromise(parseLeagueScoringConfiguration(scoringSource));
  const modelVersion = argument('model-version') ?? `availability-v1-scoring-v${scoring.version}`;
  const plan = await Effect.runPromise(
    planHashtagProjectionImport({
      asOf,
      canonicalPlayers,
      csv,
      history,
      modelVersion,
      rules: scoring.scoringRules,
      seasonKey,
    }),
  );
  const leaders = plan.records.slice(0, 10).map((record, index) => ({
    availability: record.projection.availability,
    fantasyPoints: record.projection.fantasyPoints,
    fantasyPointsPerGame: record.projection.fantasyPointsPerGame,
    name: record.canonicalName,
    rank: index + 1,
  }));

  if (!shouldCommit) {
    console.log(
      JSON.stringify(
        {
          mode: 'validate',
          asOf: plan.asOf,
          fingerprint: plan.fingerprint,
          scoring: `${scoring.name} v${scoring.version}`,
          seasonKey: plan.seasonKey,
          ...plan.summary,
          issues: plan.issues,
          leaders,
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
      return yield* commitHashtagProjectionImport(plan, database);
    }),
  );
  console.log(
    JSON.stringify(
      {
        mode: 'commit',
        asOf: plan.asOf,
        fingerprint: plan.fingerprint,
        scoring: `${scoring.name} v${scoring.version}`,
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
  console.error(cause instanceof Error ? cause.message : 'Projection import failed');
  process.exitCode = 1;
});
