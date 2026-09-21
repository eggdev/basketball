import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Data, Effect, Redacted } from 'effect';

import { nbaSeasonKey, type BallDontLieProviderConfig } from './player-production';

export const advancedMetricSets = [
  { category: 'general', type: 'advanced' },
  { category: 'general', type: 'usage' },
  { category: 'tracking', type: 'passing' },
  { category: 'tracking', type: 'drives' },
  { category: 'tracking', type: 'possessions' },
  { category: 'tracking', type: 'speeddistance' },
  { category: 'hustle', type: null },
] as const;

export type AdvancedMetricSet = (typeof advancedMetricSets)[number];

export interface AdvancedStatsProviderRecord {
  readonly externalPlayerId: string;
  readonly playerName: string;
  readonly season: number;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly stats: Readonly<Record<string, number | null>>;
}

export interface AdvancedStatsProvider<Error> {
  readonly listSeasonAverages: (
    metricSet: AdvancedMetricSet,
    playerIds: ReadonlyArray<string>,
    season: number,
  ) => Effect.Effect<ReadonlyArray<AdvancedStatsProviderRecord>, Error>;
}

export interface AdvancedStatsIdentity {
  readonly externalId: string;
  readonly playerId: string;
  readonly playerName: string;
}

export interface AdvancedStatsImportRecord {
  readonly metrics: Readonly<Record<string, number | null>>;
  readonly playerId: string;
  readonly playerName: string;
  readonly providerPlayerId: string;
  readonly seasonKey: string;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
}

export interface AdvancedStatsImportIssue {
  readonly kind: 'duplicate_metric_set' | 'unknown_player';
  readonly providerPlayerId: string;
  readonly reason: string;
  readonly seasonKey: string;
}

export interface AdvancedStatsImportPlan {
  readonly fingerprint: string;
  readonly issues: ReadonlyArray<AdvancedStatsImportIssue>;
  readonly records: ReadonlyArray<AdvancedStatsImportRecord>;
  readonly seasonKeys: ReadonlyArray<string>;
  readonly source: 'balldontlie-advanced';
  readonly summary: {
    readonly metricCount: number;
    readonly metricSetCount: number;
    readonly playerSeasonCount: number;
    readonly valid: boolean;
  };
}

export interface AdvancedStatsCommitResult {
  readonly ingestionRunId: string;
  readonly playerSeasonCount: number;
  readonly seasonCount: number;
}

export interface AdvancedStatsCommitter<Error> {
  readonly replacePlayerAdvancedStats: (
    batch: Pick<AdvancedStatsImportPlan, 'fingerprint' | 'records' | 'seasonKeys'>,
  ) => Effect.Effect<AdvancedStatsCommitResult, Error>;
}

export class AdvancedStatsProviderError extends Data.TaggedError('AdvancedStatsProviderError')<{
  readonly message: string;
  readonly reason: string;
  readonly status: number | null;
}> {}

export class AdvancedStatsValidationError extends Data.TaggedError('AdvancedStatsValidationError')<{
  readonly message: string;
  readonly reason: string;
}> {}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const object = (value: unknown, label: string): JsonObject => {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  return value;
};

const array = (value: unknown, label: string): ReadonlyArray<unknown> => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};

const identifier = (value: unknown, label: string): string => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
    throw new Error(`${label} must be an identifier`);
  }
  return String(value);
};

const string = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const numericStats = (value: unknown): Readonly<Record<string, number | null>> => {
  const stats = object(value, 'season averages stats');
  return Object.fromEntries(
    Object.entries(stats).map(([key, entry]) => {
      if (entry === null) return [key, null];
      const parsed = typeof entry === 'number' ? entry : Number(entry);
      if (!Number.isFinite(parsed))
        throw new Error(`advanced metric ${key} must be numeric or null`);
      return [key, parsed];
    }),
  );
};

const parseRecord = (value: unknown): AdvancedStatsProviderRecord => {
  const record = object(value, 'season averages record');
  const player = object(record['player'], 'season averages player');
  const season = Number(record['season']);
  if (!Number.isSafeInteger(season)) throw new Error('season averages season must be an integer');
  return {
    externalPlayerId: identifier(player['id'], 'season averages player ID'),
    playerName: `${string(player['first_name'], 'player first name')} ${string(
      player['last_name'],
      'player last name',
    )}`,
    season,
    sourcePayload: record,
    stats: numericStats(record['stats']),
  };
};

const nextCursor = (value: unknown): string | null => {
  const cursor = object(value, 'response meta')['next_cursor'];
  return cursor === undefined || cursor === null ? null : identifier(cursor, 'next cursor');
};

const chunks = <Value>(values: ReadonlyArray<Value>, size: number): ReadonlyArray<Value[]> => {
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
};

export const makeBallDontLieAdvancedStatsProvider = (
  config: BallDontLieProviderConfig,
): AdvancedStatsProvider<AdvancedStatsProviderError> => {
  const fetchImplementation = config.fetch ?? globalThis.fetch;
  let requestsPerMinute = config.initialRequestsPerMinute;
  let nextRequestAt = 0;

  const fetchPage = (
    url: URL,
    page: number,
  ): Effect.Effect<JsonObject, AdvancedStatsProviderError> =>
    Effect.tryPromise({
      try: async () => {
        const cacheKey = createHash('sha256')
          .update(`${url.pathname}?${url.searchParams.toString()}`)
          .digest('hex');
        const cachePath = join(config.cacheDirectory, `advanced-${cacheKey}.json`);
        if (!config.refresh) {
          try {
            const cached = object(JSON.parse(await readFile(cachePath, 'utf8')), 'response');
            config.onProgress?.({
              cacheHit: true,
              page,
              recordCount: array(cached['data'], 'response data').length,
              resource: 'advanced',
            });
            return cached;
          } catch (cause) {
            if (!isObject(cause) || cause['code'] !== 'ENOENT') throw cause;
          }
        }

        const waitMilliseconds = Math.max(0, nextRequestAt - Date.now());
        if (waitMilliseconds > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, waitMilliseconds));
        }
        const response = await fetchImplementation(url, {
          headers: { Authorization: Redacted.value(config.apiKey) },
        });
        const advertisedLimit = Number(response.headers.get('x-ratelimit-limit'));
        if (Number.isSafeInteger(advertisedLimit) && advertisedLimit > 0) {
          requestsPerMinute = advertisedLimit;
        }
        nextRequestAt = Date.now() + Math.ceil(60_000 / requestsPerMinute) + 50;
        if (!response.ok) {
          throw new AdvancedStatsProviderError({
            message: `BALLDONTLIE advanced-stat request failed with status ${response.status}`,
            reason:
              response.status === 401 || response.status === 403
                ? 'a BALLDONTLIE GOAT subscription and valid API key are required'
                : 'request failed',
            status: response.status,
          });
        }
        const body = object(await response.json(), 'response');
        await mkdir(config.cacheDirectory, { recursive: true });
        const temporaryPath = `${cachePath}.${process.pid}.tmp`;
        await writeFile(temporaryPath, `${JSON.stringify(body)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
        await rename(temporaryPath, cachePath);
        config.onProgress?.({
          cacheHit: false,
          page,
          recordCount: array(body['data'], 'response data').length,
          resource: 'advanced',
        });
        return body;
      },
      catch: (cause) =>
        cause instanceof AdvancedStatsProviderError
          ? cause
          : new AdvancedStatsProviderError({
              message: 'BALLDONTLIE advanced stats could not be loaded',
              reason: cause instanceof Error ? cause.message : 'provider request failed',
              status: null,
            }),
    });

  return {
    listSeasonAverages: (metricSet, playerIds, season) =>
      Effect.gen(function* () {
        const records: AdvancedStatsProviderRecord[] = [];
        for (const playerChunk of chunks([...new Set(playerIds)].sort(), 50)) {
          let cursor: string | null = null;
          let page = 1;
          do {
            const url = new URL(
              `/nba/v1/season_averages/${metricSet.category}`,
              'https://api.balldontlie.io',
            );
            url.searchParams.set('season', String(season));
            url.searchParams.set('season_type', 'regular');
            url.searchParams.set('per_page', '100');
            if (metricSet.type !== null) url.searchParams.set('type', metricSet.type);
            playerChunk.forEach((playerId) => url.searchParams.append('player_ids[]', playerId));
            if (cursor !== null) url.searchParams.set('cursor', cursor);
            const response = yield* fetchPage(url, page);
            records.push(...array(response['data'], 'response data').map(parseRecord));
            cursor = nextCursor(response['meta']);
            page += 1;
          } while (cursor !== null);
        }
        return records;
      }),
  };
};

const metricSetKey = (metricSet: AdvancedMetricSet): string =>
  metricSet.type === null ? metricSet.category : `${metricSet.category}.${metricSet.type}`;

export const collectAdvancedStats = <Error>(input: {
  readonly identities: ReadonlyArray<AdvancedStatsIdentity>;
  readonly provider: AdvancedStatsProvider<Error>;
  readonly seasons: ReadonlyArray<number>;
}): Effect.Effect<AdvancedStatsImportPlan, Error | AdvancedStatsValidationError> =>
  Effect.gen(function* () {
    const seasons = [...new Set(input.seasons)].sort();
    if (seasons.length === 0 || seasons.some((season) => !Number.isSafeInteger(season))) {
      return yield* new AdvancedStatsValidationError({
        message: 'Advanced-stat seasons are invalid',
        reason: 'at least one integer NBA season is required',
      });
    }
    if (input.identities.length === 0) {
      return yield* new AdvancedStatsValidationError({
        message: 'Advanced-stat identities are unavailable',
        reason: 'at least one canonical BALLDONTLIE player identity is required',
      });
    }
    const uniqueExternalIds = new Set(input.identities.map((identity) => identity.externalId));
    if (uniqueExternalIds.size !== input.identities.length) {
      return yield* new AdvancedStatsValidationError({
        message: 'Advanced-stat identities are ambiguous',
        reason: 'BALLDONTLIE external IDs must be unique',
      });
    }
    const identityByExternalId = new Map(
      input.identities.map((identity) => [identity.externalId, identity]),
    );
    const combined = new Map<
      string,
      {
        identity: AdvancedStatsIdentity;
        metrics: Record<string, number | null>;
        payloads: Record<string, Readonly<Record<string, unknown>>>;
        season: number;
      }
    >();
    const issues: AdvancedStatsImportIssue[] = [];

    for (const season of seasons) {
      for (const metricSet of advancedMetricSets) {
        const setKey = metricSetKey(metricSet);
        const records = yield* input.provider.listSeasonAverages(
          metricSet,
          input.identities.map((identity) => identity.externalId),
          season,
        );
        for (const record of records) {
          if (record.season !== season) {
            return yield* new AdvancedStatsValidationError({
              message: 'Advanced-stat provider returned an unexpected season',
              reason: `requested ${season}, received ${record.season}`,
            });
          }
          const identity = identityByExternalId.get(record.externalPlayerId);
          if (identity === undefined) {
            issues.push({
              kind: 'unknown_player',
              providerPlayerId: record.externalPlayerId,
              reason: 'provider returned a player outside the requested canonical identities',
              seasonKey: nbaSeasonKey(record.season),
            });
            continue;
          }
          const key = `${record.externalPlayerId}:${record.season}`;
          const entry = combined.get(key) ?? {
            identity,
            metrics: {},
            payloads: {},
            season: record.season,
          };
          if (entry.payloads[setKey] !== undefined) {
            issues.push({
              kind: 'duplicate_metric_set',
              providerPlayerId: record.externalPlayerId,
              reason: `${setKey} appeared more than once`,
              seasonKey: nbaSeasonKey(record.season),
            });
            continue;
          }
          entry.payloads[setKey] = record.sourcePayload;
          Object.entries(record.stats).forEach(([name, value]) => {
            entry.metrics[`${setKey}.${name}`] = value;
          });
          combined.set(key, entry);
        }
      }
    }

    if (combined.size === 0) {
      return yield* new AdvancedStatsValidationError({
        message: 'Advanced-stat import is empty',
        reason: 'no player-season records were returned; existing data was left unchanged',
      });
    }

    const records = [...combined.values()]
      .map(
        (entry): AdvancedStatsImportRecord => ({
          metrics: Object.fromEntries(
            Object.entries(entry.metrics).sort(([left], [right]) => left.localeCompare(right)),
          ),
          playerId: entry.identity.playerId,
          playerName: entry.identity.playerName,
          providerPlayerId: entry.identity.externalId,
          seasonKey: nbaSeasonKey(entry.season),
          sourcePayload: Object.fromEntries(
            Object.entries(entry.payloads).sort(([left], [right]) => left.localeCompare(right)),
          ),
        }),
      )
      .sort(
        (left, right) =>
          left.seasonKey.localeCompare(right.seasonKey) ||
          left.playerId.localeCompare(right.playerId),
      );
    issues.sort(
      (left, right) =>
        left.seasonKey.localeCompare(right.seasonKey) ||
        left.providerPlayerId.localeCompare(right.providerPlayerId) ||
        left.kind.localeCompare(right.kind),
    );
    const seasonKeys = seasons.map(nbaSeasonKey);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ issues, records, seasonKeys, source: 'balldontlie-advanced' }))
      .digest('hex');

    return {
      fingerprint,
      issues,
      records,
      seasonKeys,
      source: 'balldontlie-advanced' as const,
      summary: {
        metricCount: records.reduce(
          (total, record) => total + Object.keys(record.metrics).length,
          0,
        ),
        metricSetCount: advancedMetricSets.length,
        playerSeasonCount: records.length,
        valid: issues.length === 0,
      },
    };
  });

export const commitAdvancedStatsImport = <Error>(
  plan: AdvancedStatsImportPlan,
  committer: AdvancedStatsCommitter<Error>,
): Effect.Effect<AdvancedStatsCommitResult, Error | AdvancedStatsValidationError> =>
  plan.summary.valid
    ? committer.replacePlayerAdvancedStats(plan)
    : Effect.fail(
        new AdvancedStatsValidationError({
          message: 'Advanced stats contain unresolved issues',
          reason: `${plan.issues.length} issue(s) require review`,
        }),
      );
