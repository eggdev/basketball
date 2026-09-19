import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  Database,
  databaseLayer,
  type DatabaseConfig,
  loadDatabaseConfig,
} from '@fantasy-basketball/database';
import { Effect } from 'effect';

import {
  collectSeasonCalendarImport,
  commitSeasonCalendarImport,
  makeFantraxLeagueInfoProvider,
  resolveSeasonCalendarSelection,
} from '../src/lib/nba-season-calendar';
import { loadBallDontLieConfig, makeBallDontLieProvider } from '../src/lib/player-production';

const argument = (name: string): string | null =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

const shouldCommit = process.argv.includes('--commit');
const shouldRefresh = process.argv.includes('--refresh');

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const run = async () => {
  const root = process.cwd();
  const configuration = JSON.parse(await readFile(join(root, 'config/seasons.json'), 'utf8'));
  const { leagueId, seasonKey } = resolveSeasonCalendarSelection(configuration, argument('season'));
  const asOf = argument('as-of') ?? new Date().toISOString();
  const ballDontLieConfig = await Effect.runPromise(loadBallDontLieConfig(root));
  const nba = makeBallDontLieProvider({
    ...ballDontLieConfig,
    onProgress: (progress) => {
      if (progress.resource === 'games') {
        console.error(
          `BALLDONTLIE games page ${progress.page}: ${progress.recordCount} records (${progress.cacheHit ? 'cache' : 'network'})`,
        );
      }
    },
    refresh: shouldRefresh,
  });
  const fantrax = makeFantraxLeagueInfoProvider({
    cachePath: join(root, 'data/cache/fantrax', seasonKey, 'league-info.json'),
    refresh: shouldRefresh,
  });
  const plan = await Effect.runPromise(
    collectSeasonCalendarImport(
      {
        asOf,
        leagueId,
        nbaSourceId: `balldontlie:/v1/games?seasons[]=${seasonKey.slice(0, 4)}&season_type=regular`,
        seasonKey,
      },
      { fantrax, nba },
    ),
  );
  const diagnostics = {
    fantraxCapturedAt: plan.fantraxCapturedAt,
    fingerprint: plan.fingerprint,
    periods: plan.fantasyPeriods.map((period) => ({
      endAt: period.endAt,
      phase: period.phase,
      playoffRound: period.playoffRound,
      scoringPeriod: period.scoringPeriod,
      startAt: period.startAt,
    })),
    teamGameCounts: Object.fromEntries(
      Object.entries(plan.schedulesByTeam).map(([team, schedule]) => [
        team,
        {
          playoffPeriods: schedule.fantasyPlayoffWeeks.map((period) => period.scheduledGames),
          regularSeason: schedule.regularSeasonScheduledGames,
        },
      ]),
    ),
    providerAsOf: {
      balldontlie: plan.fantraxCapturedAt,
      fantrax: plan.fantraxCapturedAt,
    },
    ...plan.summary,
  };

  if (!shouldCommit) {
    console.log(JSON.stringify({ mode: 'validate', seasonKey, ...diagnostics }, null, 2));
    return;
  }

  const databaseConfig = await Effect.runPromise(loadDatabaseConfig());
  const result = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* commitSeasonCalendarImport(plan, database);
    }),
  );
  console.log(JSON.stringify({ mode: 'commit', seasonKey, ...diagnostics, ...result }, null, 2));
};

run().catch((cause: unknown) => {
  const reason =
    typeof cause === 'object' && cause !== null && 'reason' in cause ? String(cause.reason) : null;
  console.error(
    cause instanceof Error
      ? `${cause.message}${reason === null ? '' : `: ${reason}`}`
      : 'Season calendar import failed',
  );
  process.exitCode = 1;
});
