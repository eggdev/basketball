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
  commitFantraxRosterHistoryImport,
  type FantraxRosterHistorySource,
  planFantraxRosterHistoryImport,
  readFantraxPlayerProfileName,
} from '../src/lib/fantrax-roster-history';

const shouldCommit = process.argv.includes('--commit');
const shouldRefresh = process.argv.includes('--refresh');
const seasonsArgument = process.argv
  .find((argument) => argument.startsWith('--seasons='))
  ?.slice('--seasons='.length)
  .split(',')
  .map((season) => season.trim())
  .filter(Boolean);
const intervalArgument = process.argv
  .find((argument) => argument.startsWith('--request-interval-ms='))
  ?.slice('--request-interval-ms='.length);
const requestIntervalMs = intervalArgument === undefined ? 1_000 : Number(intervalArgument);
if (!Number.isInteger(requestIntervalMs) || requestIntervalMs < 250) {
  throw new Error('--request-interval-ms must be an integer of at least 250');
}

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

let networkRequestCount = 0;
let lastRequestStartedAt = 0;
const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const fetchJson = async (url: string, init?: RequestInit): Promise<unknown> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const delay = Math.max(0, requestIntervalMs - (Date.now() - lastRequestStartedAt));
    if (delay > 0) await wait(delay);
    lastRequestStartedAt = Date.now();
    networkRequestCount += 1;
    const response = await fetch(url, {
      ...init,
      headers: {
        accept: 'application/json',
        'user-agent': 'fantasy-basketball-importer/0.1',
        ...init?.headers,
      },
    });
    if (response.ok) return response.json() as Promise<unknown>;
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`Fantrax returned HTTP ${response.status} for ${url}`);
    }
    if (attempt === 3) throw new Error(`Fantrax returned HTTP ${response.status} for ${url}`);
    await wait(2 ** attempt * 2_000);
  }
  throw new Error(`Fantrax request failed for ${url}`);
};

const cachedJson = async (path: string, load: () => Promise<unknown>): Promise<unknown> => {
  if (!shouldRefresh) {
    try {
      return await readJson(path);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    }
  }

  const payload = await load();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  if (networkRequestCount % 25 === 0) {
    console.error(`Cached ${networkRequestCount} Fantrax roster-history responses`);
  }
  return payload;
};

const cachedFantraxJson = (path: string, url: string): Promise<unknown> =>
  cachedJson(path, () => fetchJson(url));

const cachedFantraxPlayerProfile = (root: string, fantraxId: string): Promise<unknown> =>
  cachedJson(join(root, 'data/cache/fantrax/player-profiles', `${fantraxId}.json`), () =>
    fetchJson('https://www.fantrax.com/fxpa/req', {
      body: JSON.stringify({
        msgs: [{ data: { playerId: fantraxId }, method: 'getPlayerProfile' }],
        refUrl: `https://www.fantrax.com/player/${encodeURIComponent(fantraxId)}/public`,
        tz: 'America/New_York',
        uiv: 3,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  );

const objectRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const rosterPlayerIds = (payload: unknown, label: string): ReadonlyArray<string> => {
  const response = objectRecord(payload, label);
  const rosters = objectRecord(response['rosters'], `${label} rosters`);
  const playerIds = new Set<string>();
  for (const rosterValue of Object.values(rosters)) {
    const roster = objectRecord(rosterValue, `${label} roster`);
    if (!Array.isArray(roster['rosterItems'])) throw new Error(`${label} rosterItems must be an array`);
    for (const itemValue of roster['rosterItems']) {
      const item = objectRecord(itemValue, `${label} roster item`);
      if (typeof item['id'] !== 'string' || item['id'].trim() === '') {
        throw new Error(`${label} roster player id is required`);
      }
      playerIds.add(item['id'].trim());
    }
  }
  return [...playerIds];
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

  const playerCatalog = {
    ...objectRecord(
      await cachedFantraxJson(
        join(root, 'data/cache/fantrax/players-nba.json'),
        'https://www.fantrax.com/fxea/general/getPlayerIds?sport=NBA',
      ),
      'Fantrax player catalog',
    ),
  };
  const sources: FantraxRosterHistorySource[] = [];
  for (const season of configuredSeasons) {
    const seasonKey = String(season['season']);
    const leagueId = String(season['league_id']);
    const cacheDirectory = join(root, 'data/cache/fantrax', seasonKey);
    const leagueInfo = objectRecord(
      await readJson(join(cacheDirectory, 'league-info.json')),
      `${seasonKey} league info`,
    );
    if (!Array.isArray(leagueInfo['rosterPeriods'])) {
      throw new Error(`${seasonKey} league info is missing roster periods`);
    }
    const rosterPayloads: unknown[] = [];
    for (const periodValue of leagueInfo['rosterPeriods']) {
      const period = objectRecord(periodValue, `${seasonKey} roster period`);
      const periodNumber = Number(period['number']);
      if (!Number.isInteger(periodNumber)) {
        throw new Error(`${seasonKey} has an invalid roster period`);
      }
      rosterPayloads.push(
        await cachedFantraxJson(
          join(cacheDirectory, 'roster-periods', `period-${periodNumber}.json`),
          `https://www.fantrax.com/fxea/general/getTeamRosters?leagueId=${encodeURIComponent(leagueId)}&period=${periodNumber}`,
        ),
      );
    }
    const missingPlayerIds = new Set(
      rosterPayloads
        .flatMap((payload) => rosterPlayerIds(payload, `${seasonKey} roster response`))
        .filter((fantraxId) => playerCatalog[fantraxId] === undefined),
    );
    for (const fantraxId of [...missingPlayerIds].sort()) {
      const profile = await cachedFantraxPlayerProfile(root, fantraxId);
      playerCatalog[fantraxId] = {
        name: readFantraxPlayerProfileName(profile, fantraxId),
      };
    }
    sources.push({ leagueId, leagueInfo, playerCatalog, rosterPayloads, seasonKey });
  }

  const plan = await Effect.runPromise(planFantraxRosterHistoryImport(sources));
  const changesByPeriod = new Map<string, number>();
  for (const change of plan.changes) {
    const key = `${change.seasonKey}:${change.rosterPeriod}`;
    changesByPeriod.set(key, (changesByPeriod.get(key) ?? 0) + 1);
  }
  const diagnostics = {
    baselines: plan.seasons.map((season) => ({
      rosterPeriod: season.baselineRosterPeriod,
      season: season.seasonKey,
    })),
    busiestPeriods: [...changesByPeriod]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5)
      .map(([key, changeCount]) => {
        const [season, rosterPeriod] = key.split(':');
        return { changeCount, rosterPeriod: Number(rosterPeriod), season };
      }),
  };
  if (!shouldCommit) {
    console.log(
      JSON.stringify(
        {
          mode: 'validate',
          fingerprint: plan.fingerprint,
          networkRequestCount,
          requestIntervalMs,
          ...diagnostics,
          ...plan.summary,
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
      return yield* commitFantraxRosterHistoryImport(plan, database);
    }),
  );
  console.log(
    JSON.stringify(
      {
        mode: 'commit',
        fingerprint: plan.fingerprint,
        networkRequestCount,
        requestIntervalMs,
        ...diagnostics,
        ...result,
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
      : 'Roster history import failed',
  );
  process.exitCode = 1;
});
