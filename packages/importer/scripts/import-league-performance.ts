import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  Database,
  databaseLayer,
  type DatabaseConfig,
  loadDatabaseConfig,
} from '@fantasy-basketball/database';
import { Effect } from 'effect';

import {
  commitFantraxLeaguePerformanceImport,
  type FantraxLeaguePerformanceSource,
  planFantraxLeaguePerformanceImport,
} from '../src/lib/fantrax-league-performance';

const shouldCommit = process.argv.includes('--commit');
const shouldRefresh = process.argv.includes('--refresh');
const seasonsArgument = process.argv
  .find((argument) => argument.startsWith('--seasons='))
  ?.slice('--seasons='.length)
  .split(',')
  .map((season) => season.trim())
  .filter(Boolean);

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

let networkRequestCount = 0;
const fetchJson = async (url: string): Promise<unknown> => {
  if (networkRequestCount > 0) {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  networkRequestCount += 1;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Fantrax returned HTTP ${response.status} for ${url}`);
  return response.json() as Promise<unknown>;
};

const cachedFantraxJson = async (path: string, url: string): Promise<unknown> => {
  if (!shouldRefresh) {
    try {
      return await readJson(path);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    }
  }

  const payload = await fetchJson(url);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
};

const objectRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const run = async () => {
  const root = process.cwd();
  const config = objectRecord(await readJson(join(root, 'config/seasons.json')), 'season config');
  if (!Array.isArray(config['seasons'])) throw new Error('season config must contain seasons');
  const configuredSeasons = config['seasons']
    .map((value) => objectRecord(value, 'configured season'))
    .filter((season) => season['status'] === 'historical')
    .filter(
      (season) =>
        seasonsArgument === undefined || seasonsArgument.includes(String(season['season'])),
    );
  if (configuredSeasons.length === 0) throw new Error('No historical seasons were selected');

  const sources: FantraxLeaguePerformanceSource[] = [];
  for (const season of configuredSeasons) {
    const seasonKey = String(season['season']);
    const leagueId = String(season['league_id']);
    const cacheDirectory = join(root, 'data/cache/fantrax', seasonKey);
    const leagueInfo = objectRecord(
      await readJson(join(cacheDirectory, 'league-info.json')),
      `${seasonKey} league info`,
    );
    if (!Array.isArray(leagueInfo['scoringPeriods'])) {
      throw new Error(`${seasonKey} league info is missing scoring periods`);
    }
    const standings = await cachedFantraxJson(
      join(cacheDirectory, 'standings.json'),
      `https://www.fantrax.com/fxea/general/getStandings?leagueId=${encodeURIComponent(leagueId)}`,
    );
    const matchupScores: unknown[] = [];
    for (const periodValue of leagueInfo['scoringPeriods']) {
      const period = objectRecord(periodValue, `${seasonKey} scoring period`);
      const periodNumber = Number(period['number']);
      if (!Number.isInteger(periodNumber)) {
        throw new Error(`${seasonKey} has an invalid scoring period`);
      }
      matchupScores.push(
        await cachedFantraxJson(
          join(cacheDirectory, 'matchup-scores', `period-${periodNumber}.json`),
          `https://www.fantrax.com/fxea/general/getMatchupScores?leagueId=${encodeURIComponent(leagueId)}&period=${periodNumber}`,
        ),
      );
    }
    sources.push({ leagueId, leagueInfo, matchupScores, seasonKey, standings });
  }

  const plan = await Effect.runPromise(planFantraxLeaguePerformanceImport(sources));
  const champions = plan.standings
    .filter((standing) => standing.postseasonResult === 'champion')
    .map((standing) => ({ season: standing.seasonKey, team: standing.teamName }));

  if (!shouldCommit) {
    console.log(
      JSON.stringify(
        {
          mode: 'validate',
          fingerprint: plan.fingerprint,
          networkRequestCount,
          ...plan.summary,
          champions,
        },
        null,
        2,
      ),
    );
    return;
  }

  const databaseConfig = await Effect.runPromise(loadDatabaseConfig());
  const result = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* commitFantraxLeaguePerformanceImport(plan, database);
    }),
  );
  console.log(
    JSON.stringify(
      {
        mode: 'commit',
        fingerprint: plan.fingerprint,
        networkRequestCount,
        ...result,
        champions,
      },
      null,
      2,
    ),
  );
};

run().catch((cause: unknown) => {
  const reason =
    typeof cause === 'object' && cause !== null && 'reason' in cause ? String(cause.reason) : null;
  console.error(
    cause instanceof Error
      ? `${cause.message}${reason === null ? '' : `: ${reason}`}`
      : 'League performance import failed',
  );
  process.exitCode = 1;
});
