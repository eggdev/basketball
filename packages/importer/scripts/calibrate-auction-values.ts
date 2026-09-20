import { readFile } from 'node:fs/promises';

import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type DatabaseConfig,
} from '@fantasy-basketball/database';
import { evaluateLeagueFormat } from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';

import {
  commitAuctionValuationRun,
  planAuctionValuationRun,
  promoteAuctionValuationRun,
} from '../src/lib/auction-valuation-run';

const argument = (name: string): string | null =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const run = async () => {
  const config = await Effect.runPromise(loadDatabaseConfig());
  const promotionRunId = argument('promote');
  if (promotionRunId !== null) {
    const actorId = argument('actor') ?? '';
    const result = await runWithDatabase(
      config,
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* promoteAuctionValuationRun(promotionRunId, actorId, database);
      }),
    );
    console.log(JSON.stringify({ mode: 'promote', ...result }, null, 2));
    return;
  }

  const leagueFormat = await Effect.runPromise(
    evaluateLeagueFormat(await readFile('config/league-format.json', 'utf8')),
  );
  const inputs = await runWithDatabase(
    config,
    Effect.gen(function* () {
      const database = yield* Database;
      const [projection, rankings, workspace] = yield* Effect.all([
        database.latestProjectionSnapshot,
        database.historicalRankings,
        database.preDraftWorkspace('clyde'),
      ]);
      if (projection === null) throw new Error('No projection snapshot is available');
      if (workspace.league === null) throw new Error('No current league season is available');
      const seasonCalendar = yield* database.latestSeasonCalendar(projection.seasonKey);
      if (seasonCalendar === null)
        throw new Error(`No season calendar is available for ${projection.seasonKey}`);
      return {
        league: workspace.league,
        leagueFormat,
        projection,
        rankings,
        seasonCalendar,
        streamingSlotsPerTeam: workspace.activePlan?.streamingSlots ?? 1,
      };
    }),
  );
  const artifact = planAuctionValuationRun(inputs);
  const selected = artifact.candidateResults.find(
    (candidate) => candidate.id === artifact.selectedModelId,
  );
  const summary = {
    candidateMetrics: artifact.candidateResults.map((candidate) => ({
      id: candidate.id,
      metrics: candidate.metrics,
    })),
    estimateCount: artifact.current.players.length,
    fingerprint: artifact.fingerprint,
    historicalInputFingerprint: artifact.historicalInputs.fingerprint,
    historicalSeasonKeys: artifact.historicalInputs.seasonKeys,
    projectionSnapshotId: artifact.projection.snapshotId,
    productionValue: artifact.productionValue,
    seasonKey: artifact.seasonKey,
    selectedModelId: selected?.id ?? artifact.selectedModelId,
  };

  if (!process.argv.includes('--commit')) {
    console.log(JSON.stringify({ mode: 'validate', ...summary }, null, 2));
    return;
  }
  const result = await runWithDatabase(
    config,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* commitAuctionValuationRun(artifact, database);
    }),
  );
  console.log(JSON.stringify({ mode: 'commit', ...summary, ...result }, null, 2));
};

run().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : 'Auction valuation calibration failed');
  process.exitCode = 1;
});
