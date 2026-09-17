import {
  Database,
  databaseLayer,
  type DatabaseConfig,
  loadDatabaseConfig,
} from '@fantasy-basketball/database';
import { Effect } from 'effect';

import {
  commitHistoricalScoring,
  loadHistoricalScoringSource,
  planHistoricalScoring,
} from '../src/lib/historical-scoring';

const shouldCommit = process.argv.includes('--commit');

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const run = async () => {
  const databaseConfig = await Effect.runPromise(loadDatabaseConfig());
  const [configJson, production] = await Promise.all([
    Effect.runPromise(loadHistoricalScoringSource(process.cwd())),
    runWithDatabase(
      databaseConfig,
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.playerProductionHistory;
      }),
    ),
  ]);
  const plan = await Effect.runPromise(planHistoricalScoring(configJson, production));
  const leaders = Object.fromEntries(
    plan.seasons.map((seasonKey) => [
      seasonKey,
      plan.rankings
        .filter((ranking) => ranking.seasonKey === seasonKey)
        .slice(0, 5)
        .map((ranking) => ({
          fantasyPoints: ranking.fantasyPoints,
          fantasyPointsPerGame: ranking.fantasyPointsPerGame,
          name: ranking.playerName,
          rank: ranking.rank,
        })),
    ]),
  );

  if (!shouldCommit) {
    console.log(
      JSON.stringify(
        {
          mode: 'validate',
          fingerprint: plan.fingerprint,
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
      return yield* commitHistoricalScoring(plan, database);
    }),
  );

  console.log(
    JSON.stringify(
      {
        mode: 'commit',
        fingerprint: plan.fingerprint,
        ...result,
        leaders,
      },
      null,
      2,
    ),
  );
};

run().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : 'Historical scoring import failed');
  process.exitCode = 1;
});
