import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Data, Effect, Redacted } from 'effect';

export interface CanonicalPlayerTarget {
  readonly canonicalName: string;
  readonly fantraxId: string;
  readonly normalizedName: string;
  readonly playerId: string;
}

export interface ProductionProviderPlayer {
  readonly draftYear: number | null;
  readonly externalId: string;
  readonly name: string;
  readonly teamAbbreviation: string | null;
}

export interface ProductionGameStat {
  readonly externalId: string;
  readonly gameId: string;
  readonly playerExternalId: string;
  readonly playerName: string;
  readonly season: number;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly stats: Readonly<Record<ProductionStatKey, number>>;
}

export interface BallDontLieRegularSeasonGame {
  readonly awayTeam: string;
  readonly date: string;
  readonly homeTeam: string;
  readonly postponed: boolean;
  readonly providerGameId: string;
  readonly scheduledAt: string;
  readonly seasonStartYear: number;
  readonly seasonType: 'regular';
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly status: string;
}

export const productionStatKeys = [
  'minutes',
  'fgm',
  'fga',
  'fg3m',
  'fg3a',
  'ftm',
  'fta',
  'oreb',
  'dreb',
  'reb',
  'ast',
  'stl',
  'blk',
  'turnover',
  'pf',
  'pts',
  'plus_minus',
] as const;

export type ProductionStatKey = (typeof productionStatKeys)[number];

export interface PlayerProductionProvider<Error> {
  readonly listPlayers: Effect.Effect<ReadonlyArray<ProductionProviderPlayer>, Error>;
  readonly listRegularSeasonStats: (
    playerIds: ReadonlyArray<string>,
    seasons: ReadonlyArray<number>,
  ) => Effect.Effect<ReadonlyArray<ProductionGameStat>, Error>;
}

export interface PlayerProductionIssue {
  readonly candidateExternalIds: ReadonlyArray<string>;
  readonly canonicalName: string;
  readonly fantraxId: string;
  readonly kind: 'ambiguous_player' | 'unmatched_player';
}

export interface PlayerProductionRecord {
  readonly fantraxId: string;
  readonly gamesPlayed: number;
  readonly period: 'regular-season';
  readonly providerPlayerId: string;
  readonly providerPlayerName: string;
  readonly seasonKey: string;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly stats: Readonly<Record<string, number | null>>;
}

export interface PlayerProductionIdentity {
  readonly fantraxId: string;
  readonly providerPlayerId: string;
  readonly providerPlayerName: string;
}

export interface PlayerProductionImportPlan {
  readonly fingerprint: string;
  readonly identities: ReadonlyArray<PlayerProductionIdentity>;
  readonly issues: ReadonlyArray<PlayerProductionIssue>;
  readonly records: ReadonlyArray<PlayerProductionRecord>;
  readonly seasons: ReadonlyArray<string>;
  readonly summary: {
    readonly ambiguousPlayerCount: number;
    readonly canonicalPlayerCount: number;
    readonly gameStatCount: number;
    readonly matchedPlayerCount: number;
    readonly playerSeasonCount: number;
    readonly seasonCount: number;
    readonly unmatchedPlayerCount: number;
    readonly valid: boolean;
  };
}

export type PlayerProductionCommitBatch = Pick<
  PlayerProductionImportPlan,
  'fingerprint' | 'identities' | 'records' | 'seasons'
> & {
  readonly gameStatCount: number;
};

export interface PlayerProductionCommitResult {
  readonly ingestionRunId: string;
  readonly playerCount: number;
  readonly playerSeasonCount: number;
  readonly seasonCount: number;
}

export interface PlayerProductionCommitter<Error> {
  readonly replacePlayerProduction: (
    batch: PlayerProductionCommitBatch,
  ) => Effect.Effect<PlayerProductionCommitResult, Error>;
}

export interface BallDontLieProgress {
  readonly cacheHit: boolean;
  readonly page: number;
  readonly recordCount: number;
  readonly resource: 'games' | 'players' | 'stats';
}

export interface BallDontLieScheduleProvider<Error> {
  readonly listRegularSeasonGames: (
    seasonStartYear: number,
  ) => Effect.Effect<ReadonlyArray<BallDontLieRegularSeasonGame>, Error>;
}

export interface BallDontLieProviderConfig {
  readonly apiKey: Redacted.Redacted<string>;
  readonly cacheDirectory: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly initialRequestsPerMinute: number;
  readonly onProgress?: (progress: BallDontLieProgress) => void;
  readonly refresh?: boolean;
}

export class PlayerProductionConfigurationError extends Data.TaggedError(
  'PlayerProductionConfigurationError',
)<{
  readonly message: string;
  readonly reason: string;
  readonly variable: 'BALLDONTLIE_API_KEY' | 'BALLDONTLIE_REQUESTS_PER_MINUTE';
}> {}

export class PlayerProductionProviderError extends Data.TaggedError(
  'PlayerProductionProviderError',
)<{
  readonly message: string;
  readonly reason: string;
  readonly status: number | null;
}> {}

export class PlayerProductionValidationError extends Data.TaggedError(
  'PlayerProductionValidationError',
)<{
  readonly message: string;
  readonly reason: string;
}> {}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredObject = (value: unknown, label: string): JsonObject => {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  return value;
};

const requiredArray = (value: unknown, label: string): ReadonlyArray<unknown> => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const stringField = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value.trim();
};

const requiredIdentifier = (value: unknown, label: string): string => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
    throw new Error(`${label} must be an identifier`);
  }
  return String(value);
};

const nullableInteger = (value: unknown, label: string): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer or null`);
  }
  return value;
};

const finiteNumber = (value: unknown, label: string): number => {
  if (value === null) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
};

const parseMinutes = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') throw new Error('min must be a number or minute string');

  const match = /^(\d+)(?::(\d{1,2}))?$/.exec(value.trim());
  if (match === null) throw new Error('min must use MM or MM:SS');
  const seconds = Number(match[2] ?? '0');
  if (seconds >= 60) throw new Error('min contains invalid seconds');
  return Number(match[1]) + seconds / 60;
};

export const normalizeProviderPlayerName = (value: string): string =>
  value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replaceAll(/[.'’]/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()
    .replaceAll(/\s+/g, ' ');

const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

const withoutSuffix = (value: string): string => {
  const tokens = normalizeProviderPlayerName(value).split(' ');
  while (tokens.length > 0 && suffixes.has(tokens.at(-1)!)) tokens.pop();
  return tokens.join(' ');
};

export const nbaSeasonKey = (season: number): string =>
  `${season}-${String((season + 1) % 100).padStart(2, '0')}`;

export const loadBallDontLieConfig = (
  projectRoot: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<BallDontLieProviderConfig, PlayerProductionConfigurationError> =>
  Effect.gen(function* () {
    const apiKey = environment['BALLDONTLIE_API_KEY']?.trim();
    if (!apiKey) {
      return yield* new PlayerProductionConfigurationError({
        message: 'BALLDONTLIE_API_KEY is missing',
        reason: 'is missing',
        variable: 'BALLDONTLIE_API_KEY',
      });
    }

    const rateValue = environment['BALLDONTLIE_REQUESTS_PER_MINUTE']?.trim() || '5';
    const initialRequestsPerMinute = Number(rateValue);
    if (!Number.isSafeInteger(initialRequestsPerMinute) || initialRequestsPerMinute <= 0) {
      return yield* new PlayerProductionConfigurationError({
        message: 'BALLDONTLIE_REQUESTS_PER_MINUTE must be a positive integer',
        reason: 'must be a positive integer',
        variable: 'BALLDONTLIE_REQUESTS_PER_MINUTE',
      });
    }

    return {
      apiKey: Redacted.make(apiKey),
      cacheDirectory: join(projectRoot, 'data/cache/balldontlie'),
      initialRequestsPerMinute,
    };
  });

export const loadPlayerProductionOverrides = (
  projectRoot: string,
): Effect.Effect<Readonly<Record<string, string>>, PlayerProductionValidationError> =>
  Effect.tryPromise({
    try: async () => {
      const value = requiredObject(
        JSON.parse(
          await readFile(join(projectRoot, 'config/balldontlie_player_overrides.json'), 'utf8'),
        ),
        'BALLDONTLIE player overrides',
      );
      return Object.fromEntries(
        Object.entries(value).map(([fantraxId, providerId]) => [
          requiredString(fantraxId, 'override Fantrax ID'),
          requiredIdentifier(providerId, `override ${fantraxId}`),
        ]),
      );
    },
    catch: (cause) =>
      new PlayerProductionValidationError({
        message: 'BALLDONTLIE player overrides could not be loaded',
        reason: cause instanceof Error ? cause.message : 'invalid player overrides',
      }),
  });

const parseProviderPlayer = (value: unknown): ProductionProviderPlayer => {
  const record = requiredObject(value, 'player');
  const team = record['team'] === null ? null : requiredObject(record['team'], 'player.team');
  const firstName = stringField(record['first_name'], 'player.first_name');
  const lastName = stringField(record['last_name'], 'player.last_name');
  return {
    draftYear: nullableInteger(record['draft_year'], 'player.draft_year'),
    externalId: requiredIdentifier(record['id'], 'player.id'),
    name: `${firstName} ${lastName}`.trim(),
    teamAbbreviation:
      team === null ? null : requiredString(team['abbreviation'], 'player.team.abbreviation'),
  };
};

const parseGameStat = (value: unknown): ProductionGameStat => {
  const record = requiredObject(value, 'stat');
  const player = requiredObject(record['player'], 'stat.player');
  const game = requiredObject(record['game'], 'stat.game');
  const season = finiteNumber(game['season'], 'stat.game.season');
  if (!Number.isSafeInteger(season)) throw new Error('stat.game.season must be an integer');

  const stats = Object.fromEntries(
    productionStatKeys.map((key) => [
      key,
      key === 'minutes' ? parseMinutes(record['min']) : finiteNumber(record[key], `stat.${key}`),
    ]),
  ) as unknown as Record<ProductionStatKey, number>;

  return {
    externalId: requiredIdentifier(record['id'], 'stat.id'),
    gameId: requiredIdentifier(game['id'], 'stat.game.id'),
    playerExternalId: requiredIdentifier(player['id'], 'stat.player.id'),
    playerName: `${requiredString(player['first_name'], 'stat.player.first_name')} ${requiredString(
      player['last_name'],
      'stat.player.last_name',
    )}`,
    season,
    sourcePayload: record,
    stats,
  };
};

const parseRegularSeasonGame = (value: unknown): BallDontLieRegularSeasonGame => {
  const record = requiredObject(value, 'game');
  const homeTeam = requiredObject(record['home_team'], 'game.home_team');
  const awayTeam = requiredObject(record['visitor_team'], 'game.visitor_team');
  const season = finiteNumber(record['season'], 'game.season');
  if (!Number.isSafeInteger(season)) throw new Error('game.season must be an integer');
  const date = requiredString(record['date'], 'game.date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error('game.date must use YYYY-MM-DD');
  }
  const scheduledAt = requiredString(record['datetime'], 'game.datetime');
  const parsedScheduledAt = new Date(scheduledAt);
  if (Number.isNaN(parsedScheduledAt.getTime()))
    throw new Error('game.datetime must be a timestamp');
  const status = requiredString(record['status'], 'game.status');
  const statusState =
    typeof record['status_state'] === 'string' ? record['status_state'].toLowerCase() : '';

  return {
    awayTeam: requiredString(awayTeam['abbreviation'], 'game.visitor_team.abbreviation'),
    date,
    homeTeam: requiredString(homeTeam['abbreviation'], 'game.home_team.abbreviation'),
    postponed: record['postponed'] === true || statusState === 'postponed',
    providerGameId: requiredIdentifier(record['id'], 'game.id'),
    scheduledAt: parsedScheduledAt.toISOString(),
    seasonStartYear: season,
    seasonType: 'regular',
    sourcePayload: record,
    status,
  };
};

const nextCursor = (value: unknown): string | null => {
  const meta = requiredObject(value, 'response.meta');
  const cursor = meta['next_cursor'];
  return cursor === undefined || cursor === null ? null : requiredIdentifier(cursor, 'next_cursor');
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const chunks = <Value>(values: ReadonlyArray<Value>, size: number): ReadonlyArray<Value[]> => {
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
};

export const makeBallDontLieProvider = (
  config: BallDontLieProviderConfig,
): PlayerProductionProvider<PlayerProductionProviderError> &
  BallDontLieScheduleProvider<PlayerProductionProviderError> => {
  const fetchImplementation = config.fetch ?? globalThis.fetch;
  let requestsPerMinute = config.initialRequestsPerMinute;
  let nextRequestAt = 0;

  const fetchPage = (
    resource: BallDontLieProgress['resource'],
    path: string,
    parameters: ReadonlyArray<readonly [string, string]>,
    page: number,
  ): Effect.Effect<JsonObject, PlayerProductionProviderError> =>
    Effect.tryPromise({
      try: async () => {
        const url = new URL(path, 'https://api.balldontlie.io');
        for (const [key, value] of parameters) url.searchParams.append(key, value);
        const cacheKey = createHash('sha256')
          .update(`${url.pathname}?${url.searchParams.toString()}`)
          .digest('hex');
        const cachePath = join(config.cacheDirectory, `${resource}-${cacheKey}.json`);

        if (!config.refresh) {
          try {
            const cached = requiredObject(
              JSON.parse(await readFile(cachePath, 'utf8')),
              'response',
            );
            const records = requiredArray(cached['data'], 'response.data');
            config.onProgress?.({ cacheHit: true, page, recordCount: records.length, resource });
            return cached;
          } catch (cause) {
            const code = isObject(cause) ? cause['code'] : undefined;
            if (code !== 'ENOENT') throw cause;
          }
        }

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const waitMilliseconds = Math.max(0, nextRequestAt - Date.now());
          if (waitMilliseconds > 0) await sleep(waitMilliseconds);

          const response = await fetchImplementation(url, {
            headers: { Authorization: Redacted.value(config.apiKey) },
          });
          const advertisedLimit = Number(response.headers.get('x-ratelimit-limit'));
          if (Number.isSafeInteger(advertisedLimit) && advertisedLimit > 0) {
            requestsPerMinute = advertisedLimit;
          }
          nextRequestAt = Date.now() + Math.ceil(60_000 / requestsPerMinute) + 50;

          if (response.status === 429 && attempt < 3) {
            const retryAfter = Number(response.headers.get('retry-after'));
            nextRequestAt =
              Date.now() +
              (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 60_000);
            continue;
          }

          if (!response.ok) {
            throw new PlayerProductionProviderError({
              message: `BALLDONTLIE request failed with status ${response.status}`,
              reason:
                response.status === 401
                  ? 'API key or account tier is not authorized'
                  : 'request failed',
              status: response.status,
            });
          }

          const body = requiredObject(await response.json(), 'response');
          const records = requiredArray(body['data'], 'response.data');
          await mkdir(config.cacheDirectory, { recursive: true });
          const temporaryPath = `${cachePath}.${process.pid}.tmp`;
          await writeFile(temporaryPath, `${JSON.stringify(body)}\n`, {
            encoding: 'utf8',
            mode: 0o600,
          });
          await rename(temporaryPath, cachePath);
          config.onProgress?.({ cacheHit: false, page, recordCount: records.length, resource });
          return body;
        }

        throw new Error('BALLDONTLIE request exhausted its retry budget');
      },
      catch: (cause) =>
        cause instanceof PlayerProductionProviderError
          ? cause
          : new PlayerProductionProviderError({
              message: 'BALLDONTLIE data could not be loaded',
              reason: cause instanceof Error ? cause.message : 'provider request failed',
              status: null,
            }),
    });

  const fetchAllPages = <Value>(
    resource: BallDontLieProgress['resource'],
    path: string,
    baseParameters: ReadonlyArray<readonly [string, string]>,
    parseValue: (value: unknown) => Value,
  ): Effect.Effect<ReadonlyArray<Value>, PlayerProductionProviderError> =>
    Effect.gen(function* () {
      const values: Value[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      let page = 1;

      do {
        const parameters: ReadonlyArray<readonly [string, string]> =
          cursor === null ? baseParameters : [...baseParameters, ['cursor', cursor] as const];
        const response: JsonObject = yield* fetchPage(resource, path, parameters, page);
        const parsedPage: { followingCursor: string | null; values: Value[] } = yield* Effect.try({
          try: (): { followingCursor: string | null; values: Value[] } => ({
            followingCursor: nextCursor(response['meta']),
            values: requiredArray(response['data'], 'response.data').map(parseValue),
          }),
          catch: (cause) =>
            new PlayerProductionProviderError({
              message: 'BALLDONTLIE response validation failed',
              reason: cause instanceof Error ? cause.message : 'invalid provider response',
              status: null,
            }),
        });
        values.push(...parsedPage.values);
        const followingCursor: string | null = parsedPage.followingCursor;
        if (followingCursor !== null && seenCursors.has(followingCursor)) {
          return yield* new PlayerProductionProviderError({
            message: 'BALLDONTLIE returned a repeated pagination cursor',
            reason: 'repeated pagination cursor',
            status: null,
          });
        }
        if (followingCursor !== null) seenCursors.add(followingCursor);
        cursor = followingCursor;
        page += 1;
      } while (cursor !== null);

      return values;
    });

  return {
    listRegularSeasonGames: (seasonStartYear) => {
      if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < 1946) {
        return Effect.fail(
          new PlayerProductionProviderError({
            message: 'BALLDONTLIE season must be a valid NBA season start year',
            reason: 'invalid season start year',
            status: null,
          }),
        );
      }
      return fetchAllPages(
        'games',
        '/v1/games',
        [
          ['per_page', '100'],
          ['season_type', 'regular'],
          ['seasons[]', String(seasonStartYear)],
        ],
        parseRegularSeasonGame,
      );
    },
    listPlayers: fetchAllPages(
      'players',
      '/v1/players',
      [['per_page', '100']],
      parseProviderPlayer,
    ).pipe(Effect.map((players) => players.filter((player) => player.name !== ''))),
    listRegularSeasonStats: (playerIds, seasons) =>
      Effect.gen(function* () {
        const records: ProductionGameStat[] = [];
        for (const playerChunk of chunks([...new Set(playerIds)].sort(), 50)) {
          const parameters: Array<readonly [string, string]> = [
            ['per_page', '100'],
            ['period', '0'],
            ['season_type', 'regular'],
          ];
          for (const playerId of playerChunk) parameters.push(['player_ids[]', playerId]);
          for (const season of [...new Set(seasons)].sort()) {
            parameters.push(['seasons[]', String(season)]);
          }
          records.push(...(yield* fetchAllPages('stats', '/v1/stats', parameters, parseGameStat)));
        }
        return records;
      }),
  };
};

interface PlayerMatch {
  readonly candidates: ReadonlyArray<ProductionProviderPlayer>;
  readonly isOverride: boolean;
  readonly target: CanonicalPlayerTarget;
}

const candidateMatches = (
  targets: ReadonlyArray<CanonicalPlayerTarget>,
  providerPlayers: ReadonlyArray<ProductionProviderPlayer>,
  overrides: Readonly<Record<string, string>>,
): ReadonlyArray<PlayerMatch> => {
  const exact = new Map<string, ProductionProviderPlayer[]>();
  const base = new Map<string, ProductionProviderPlayer[]>();
  const byId = new Map(providerPlayers.map((player) => [player.externalId, player]));
  for (const player of providerPlayers) {
    const normalized = normalizeProviderPlayerName(player.name);
    exact.set(normalized, [...(exact.get(normalized) ?? []), player]);
    const baseName = withoutSuffix(player.name);
    base.set(baseName, [...(base.get(baseName) ?? []), player]);
  }

  return targets.map((target) => {
    const overrideId = overrides[target.fantraxId] ?? overrides[target.normalizedName];
    const override = overrideId === undefined ? undefined : byId.get(overrideId);
    if (overrideId !== undefined && override === undefined) {
      return { candidates: [], isOverride: true, target };
    }
    if (override !== undefined) return { candidates: [override], isOverride: true, target };

    const normalized = normalizeProviderPlayerName(target.canonicalName);
    const exactCandidates = exact.get(normalized) ?? [];
    return {
      candidates:
        exactCandidates.length > 0 ? exactCandidates : (base.get(withoutSuffix(normalized)) ?? []),
      isOverride: false,
      target,
    };
  });
};

const zeroTotals = (): Record<string, number> => ({
  ast: 0,
  blk: 0,
  double_double: 0,
  dreb: 0,
  fg3a: 0,
  fg3m: 0,
  fg3_missed: 0,
  fga: 0,
  fgm: 0,
  fg_missed: 0,
  fta: 0,
  ftm: 0,
  ft_missed: 0,
  minutes: 0,
  oreb: 0,
  pf: 0,
  plus_minus: 0,
  pts: 0,
  reb: 0,
  stl: 0,
  triple_double: 0,
  turnover: 0,
});

const aggregateStats = (
  target: CanonicalPlayerTarget,
  providerPlayer: ProductionProviderPlayer,
  gameStats: ReadonlyArray<ProductionGameStat>,
): ReadonlyArray<PlayerProductionRecord> => {
  const recordsBySeason = new Map<number, ProductionGameStat[]>();
  const seenGames = new Set<string>();
  for (const gameStat of gameStats) {
    const key = `${gameStat.playerExternalId}:${gameStat.gameId}`;
    if (seenGames.has(key)) throw new Error(`duplicate game stat ${key}`);
    seenGames.add(key);
    const isAppearance = productionStatKeys.some((statKey) => gameStat.stats[statKey] !== 0);
    if (!isAppearance) continue;
    const seasonRecords = recordsBySeason.get(gameStat.season) ?? [];
    seasonRecords.push(gameStat);
    recordsBySeason.set(gameStat.season, seasonRecords);
  }

  return [...recordsBySeason.entries()]
    .sort(([left], [right]) => left - right)
    .map(([season, seasonRecords]) => {
      const totals = zeroTotals();
      for (const gameStat of seasonRecords) {
        for (const key of productionStatKeys) totals[key] += gameStat.stats[key];
        totals['fg_missed'] += gameStat.stats.fga - gameStat.stats.fgm;
        totals['fg3_missed'] += gameStat.stats.fg3a - gameStat.stats.fg3m;
        totals['ft_missed'] += gameStat.stats.fta - gameStat.stats.ftm;
        const doubleDigitCategories = [
          gameStat.stats.pts,
          gameStat.stats.reb,
          gameStat.stats.ast,
          gameStat.stats.stl,
          gameStat.stats.blk,
        ].filter((value) => value >= 10).length;
        if (doubleDigitCategories >= 2) totals['double_double'] += 1;
        if (doubleDigitCategories >= 3) totals['triple_double'] += 1;
      }
      totals['minutes'] = Number(totals['minutes'].toFixed(3));

      return {
        fantraxId: target.fantraxId,
        gamesPlayed: seasonRecords.length,
        period: 'regular-season' as const,
        providerPlayerId: providerPlayer.externalId,
        providerPlayerName: providerPlayer.name,
        seasonKey: nbaSeasonKey(season),
        sourcePayload: {
          gameStatIds: seasonRecords.map((record) => record.externalId).sort(),
          providerPlayerId: providerPlayer.externalId,
          providerPlayerName: providerPlayer.name,
          season,
          seasonType: 'regular',
        },
        stats: totals,
      };
    });
};

export const collectPlayerProduction = <Error>(options: {
  readonly overrides?: Readonly<Record<string, string>>;
  readonly provider: PlayerProductionProvider<Error>;
  readonly seasons: ReadonlyArray<number>;
  readonly targets: ReadonlyArray<CanonicalPlayerTarget>;
}): Effect.Effect<PlayerProductionImportPlan, Error | PlayerProductionValidationError> =>
  Effect.gen(function* () {
    const seasons = [...new Set(options.seasons)].sort();
    if (seasons.length === 0 || seasons.some((season) => !Number.isSafeInteger(season))) {
      return yield* new PlayerProductionValidationError({
        message: 'At least one valid NBA season is required',
        reason: 'invalid seasons',
      });
    }

    const providerPlayers = yield* options.provider.listPlayers;
    const candidateSets = candidateMatches(
      options.targets,
      providerPlayers,
      options.overrides ?? {},
    );
    const candidateIds = (isOverride: boolean) => [
      ...new Set(
        candidateSets
          .filter((match) => match.isOverride === isOverride)
          .flatMap((match) => match.candidates.map((candidate) => candidate.externalId)),
      ),
    ];
    const standardGameStats = yield* options.provider.listRegularSeasonStats(
      candidateIds(false),
      seasons,
    );
    const overrideIds = candidateIds(true);
    const overrideGameStats =
      overrideIds.length === 0
        ? []
        : yield* options.provider.listRegularSeasonStats(overrideIds, seasons);
    const gameStats = [...standardGameStats, ...overrideGameStats];
    const statsByPlayer = new Map<string, ProductionGameStat[]>();
    for (const gameStat of gameStats) {
      if (!seasons.includes(gameStat.season)) continue;
      statsByPlayer.set(gameStat.playerExternalId, [
        ...(statsByPlayer.get(gameStat.playerExternalId) ?? []),
        gameStat,
      ]);
    }

    const issues: PlayerProductionIssue[] = [];
    const identities: PlayerProductionIdentity[] = [];
    const records: PlayerProductionRecord[] = [];
    let matchedPlayerCount = 0;
    const claimedProviderIds = new Set<string>();
    for (const match of candidateSets) {
      const candidatesWithStats = match.candidates.filter(
        (candidate) => (statsByPlayer.get(candidate.externalId)?.length ?? 0) > 0,
      );
      const viableCandidates =
        candidatesWithStats.length > 0 ? candidatesWithStats : match.candidates;
      if (viableCandidates.length !== 1) {
        issues.push({
          candidateExternalIds: viableCandidates.map((candidate) => candidate.externalId).sort(),
          canonicalName: match.target.canonicalName,
          fantraxId: match.target.fantraxId,
          kind: viableCandidates.length === 0 ? 'unmatched_player' : 'ambiguous_player',
        });
        continue;
      }

      const providerPlayer = viableCandidates[0]!;
      if (claimedProviderIds.has(providerPlayer.externalId)) {
        issues.push({
          candidateExternalIds: [providerPlayer.externalId],
          canonicalName: match.target.canonicalName,
          fantraxId: match.target.fantraxId,
          kind: 'ambiguous_player',
        });
        continue;
      }
      claimedProviderIds.add(providerPlayer.externalId);
      matchedPlayerCount += 1;
      identities.push({
        fantraxId: match.target.fantraxId,
        providerPlayerId: providerPlayer.externalId,
        providerPlayerName: providerPlayer.name,
      });
      records.push(
        ...aggregateStats(
          match.target,
          providerPlayer,
          statsByPlayer.get(providerPlayer.externalId) ?? [],
        ),
      );
    }

    records.sort(
      (left, right) =>
        left.seasonKey.localeCompare(right.seasonKey) ||
        left.fantraxId.localeCompare(right.fantraxId),
    );
    identities.sort((left, right) => left.fantraxId.localeCompare(right.fantraxId));
    issues.sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));
    const seasonKeys = seasons.map(nbaSeasonKey);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          identities,
          issues,
          records: records.map((record) => ({
            fantraxId: record.fantraxId,
            gamesPlayed: record.gamesPlayed,
            providerPlayerId: record.providerPlayerId,
            seasonKey: record.seasonKey,
            sourcePayload: record.sourcePayload,
            stats: record.stats,
          })),
          seasons: seasonKeys,
        }),
      )
      .digest('hex');
    const ambiguousPlayerCount = issues.filter((issue) => issue.kind === 'ambiguous_player').length;
    const unmatchedPlayerCount = issues.filter((issue) => issue.kind === 'unmatched_player').length;

    return {
      fingerprint,
      identities,
      issues,
      records,
      seasons: seasonKeys,
      summary: {
        ambiguousPlayerCount,
        canonicalPlayerCount: options.targets.length,
        gameStatCount: gameStats.length,
        matchedPlayerCount,
        playerSeasonCount: records.length,
        seasonCount: seasonKeys.length,
        unmatchedPlayerCount,
        valid: issues.length === 0,
      },
    };
  });

export const commitPlayerProductionImport = <Error>(
  plan: PlayerProductionImportPlan,
  committer: PlayerProductionCommitter<Error>,
): Effect.Effect<PlayerProductionCommitResult, Error | PlayerProductionValidationError> => {
  if (!plan.summary.valid) {
    return Effect.fail(
      new PlayerProductionValidationError({
        message: 'Player production contains unresolved identities and cannot be committed',
        reason: `${plan.summary.unmatchedPlayerCount} unmatched and ${plan.summary.ambiguousPlayerCount} ambiguous players`,
      }),
    );
  }

  return committer.replacePlayerProduction({
    fingerprint: plan.fingerprint,
    gameStatCount: plan.summary.gameStatCount,
    identities: plan.identities,
    records: plan.records,
    seasons: plan.seasons,
  });
};
