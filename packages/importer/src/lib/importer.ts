import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'csv-parse/sync';
import { Data, Effect } from 'effect';

export interface HistoricalAuctionSourceBundle {
  readonly auctionCsv: string;
  readonly configJson: string;
  readonly leagueSeasonsJson: string;
  readonly validationJson: string;
}

export interface HistoricalAuctionSeason {
  readonly baseBudgetCents: number;
  readonly leagueId: string;
  readonly rosterSize: number;
  readonly seasonKey: string;
  readonly status: string;
  readonly teamCount: number;
}

export interface HistoricalAuctionPlayer {
  readonly canonicalName: string;
  readonly fantraxId: string;
  readonly normalizedName: string;
}

export interface HistoricalAuctionRecord {
  readonly amountCents: number;
  readonly draftedAtMs: number;
  readonly fantraxPick: number;
  readonly fantraxPlayerId: string;
  readonly leagueId: string;
  readonly managerLabel: string | null;
  readonly rosterSlot: number | null;
  readonly seasonKey: string;
  readonly sourcePayload: Readonly<Record<string, string>>;
  readonly teamId: string;
  readonly teamName: string;
}

export interface HistoricalAuctionImportPlan {
  readonly auctions: ReadonlyArray<HistoricalAuctionRecord>;
  readonly fingerprint: string;
  readonly players: ReadonlyArray<HistoricalAuctionPlayer>;
  readonly seasons: ReadonlyArray<HistoricalAuctionSeason>;
  readonly summary: {
    readonly auctionCount: number;
    readonly seasonCount: number;
    readonly totalAmountCents: number;
    readonly uniquePlayerCount: number;
    readonly warningCount: number;
  };
}

export interface HistoricalAuctionCommitResult {
  readonly auctionCount: number;
  readonly ingestionRunId: string;
  readonly playerCount: number;
  readonly seasonCount: number;
}

export type HistoricalAuctionCommitBatch = Pick<
  HistoricalAuctionImportPlan,
  'auctions' | 'fingerprint' | 'players' | 'seasons'
> & {
  readonly warningCount: number;
};

export interface HistoricalAuctionCommitter<Error> {
  readonly replaceHistoricalAuctions: (
    batch: HistoricalAuctionCommitBatch,
  ) => Effect.Effect<HistoricalAuctionCommitResult, Error>;
}

export class HistoricalAuctionValidationError extends Data.TaggedError(
  'HistoricalAuctionValidationError',
)<{
  readonly code: string;
  readonly details: string;
  readonly message: string;
}> {}

export class HistoricalAuctionSourceError extends Data.TaggedError('HistoricalAuctionSourceError')<{
  readonly message: string;
  readonly reason: string;
}> {}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validationError = (code: string, details: string) =>
  new HistoricalAuctionValidationError({
    code,
    details,
    message: `Historical auction validation failed (${code}): ${details}`,
  });

const parseJson = (label: string, value: string) =>
  Effect.try({
    try: () => JSON.parse(value) as unknown,
    catch: () => validationError('invalid_json', `${label} is not valid JSON`),
  });

const requiredString = (row: Record<string, string>, field: string): string => {
  const value = row[field]?.trim();
  if (!value) throw new Error(`${field} is required`);
  return value;
};

const parseInteger = (
  row: Record<string, string>,
  field: string,
  nullable = false,
): number | null => {
  const value = row[field]?.trim() ?? '';
  if (nullable && value === '') return null;
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} is outside the safe integer range`);
  return parsed;
};

const parseCents = (value: string): number => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (match === null)
    throw new Error('price must be a non-negative amount with at most two decimals');
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('price is outside the safe integer range');
  return cents;
};

const numberField = (record: JsonObject, field: string): number => {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
};

const stringField = (record: JsonObject, field: string): string => {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a string`);
  }
  return value;
};

export const loadHistoricalAuctionSources = (
  projectRoot: string,
): Effect.Effect<HistoricalAuctionSourceBundle, HistoricalAuctionSourceError> =>
  Effect.tryPromise({
    try: async () => {
      const [auctionCsv, configJson, leagueSeasonsJson, validationJson] = await Promise.all([
        readFile(join(projectRoot, 'data/normalized/auction_results.csv'), 'utf8'),
        readFile(join(projectRoot, 'config/seasons.json'), 'utf8'),
        readFile(join(projectRoot, 'data/normalized/league_seasons.json'), 'utf8'),
        readFile(join(projectRoot, 'data/reports/import_validation.json'), 'utf8'),
      ]);
      return { auctionCsv, configJson, leagueSeasonsJson, validationJson };
    },
    catch: () =>
      new HistoricalAuctionSourceError({
        message: 'Normalized auction data is missing; run the Python validator first',
        reason: 'Normalized auction data is missing; run the Python validator first',
      }),
  });

export const planHistoricalAuctionImport = (
  bundle: HistoricalAuctionSourceBundle,
): Effect.Effect<HistoricalAuctionImportPlan, HistoricalAuctionValidationError> =>
  Effect.gen(function* () {
    const config = yield* parseJson('season config', bundle.configJson);
    const seasonMetadata = yield* parseJson('league seasons', bundle.leagueSeasonsJson);
    const validation = yield* parseJson('validation report', bundle.validationJson);

    if (!isObject(validation) || validation['valid'] !== true) {
      return yield* validationError(
        'upstream_validation_failed',
        'The normalized source was rejected by the upstream validator',
      );
    }

    return yield* Effect.try({
      try: () => {
        if (!isObject(config)) throw new Error('season config must be an object');
        if (!Array.isArray(seasonMetadata)) throw new Error('league seasons must be an array');
        const summary = validation['summary'];
        const seasonReports = validation['seasons'];
        if (!isObject(summary) || !Array.isArray(seasonReports)) {
          throw new Error('validation report is missing summary or seasons');
        }

        const rosterSize = numberField(config, 'expected_roster_size');
        const baseBudgetCents = parseCents(String(numberField(config, 'base_budget')));
        const warningCount = numberField(summary, 'warnings');
        const expectedRowCount = numberField(summary, 'normalized_rows');

        const metadataBySeason = new Map<string, JsonObject>();
        for (const value of seasonMetadata) {
          if (!isObject(value)) throw new Error('league season entries must be objects');
          metadataBySeason.set(stringField(value, 'season'), value);
        }

        const reportBySeason = new Map<string, JsonObject>();
        for (const value of seasonReports) {
          if (!isObject(value)) throw new Error('season reports must be objects');
          reportBySeason.set(stringField(value, 'season'), value);
        }

        const rows = parse(bundle.auctionCsv, {
          bom: true,
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as Array<Record<string, string>>;
        if (rows.length !== expectedRowCount) {
          throw new Error(
            `row count ${rows.length} does not match validator count ${expectedRowCount}`,
          );
        }

        const players = new Map<string, HistoricalAuctionPlayer>();
        const auctions: HistoricalAuctionRecord[] = [];
        const seasonPlayerKeys = new Set<string>();
        const seasonPickKeys = new Set<string>();
        const rowCountBySeason = new Map<string, number>();
        const spendBySeason = new Map<string, number>();

        for (const row of rows) {
          const seasonKey = requiredString(row, 'season');
          const leagueId = requiredString(row, 'league_id');
          const fantraxPlayerId = requiredString(row, 'fantrax_player_id');
          const playerKey = requiredString(row, 'player_key');
          const canonicalName = requiredString(row, 'player_name');
          const fantraxPick = parseInteger(row, 'fantrax_pick')!;
          const amountCents = parseCents(requiredString(row, 'price'));
          const draftedAtMs = parseInteger(row, 'drafted_at_ms')!;
          const metadata = metadataBySeason.get(seasonKey);
          const report = reportBySeason.get(seasonKey);
          if (metadata === undefined || report === undefined) {
            throw new Error(`${seasonKey} is missing season metadata or validation totals`);
          }
          if (
            stringField(metadata, 'league_id') !== leagueId ||
            stringField(report, 'league_id') !== leagueId
          ) {
            throw new Error(`${seasonKey} has conflicting league IDs`);
          }

          const seasonPlayerKey = `${seasonKey}:${fantraxPlayerId}`;
          const seasonPickKey = `${seasonKey}:${fantraxPick}`;
          if (seasonPlayerKeys.has(seasonPlayerKey)) {
            throw new Error(`${seasonKey} contains duplicate player ${fantraxPlayerId}`);
          }
          if (seasonPickKeys.has(seasonPickKey)) {
            throw new Error(`${seasonKey} contains duplicate pick ${fantraxPick}`);
          }
          seasonPlayerKeys.add(seasonPlayerKey);
          seasonPickKeys.add(seasonPickKey);

          const knownPlayer = players.get(fantraxPlayerId);
          const normalizedName = playerKey.replaceAll('-', ' ');
          if (knownPlayer !== undefined && knownPlayer.normalizedName !== normalizedName) {
            throw new Error(`${fantraxPlayerId} maps to conflicting player identities`);
          }
          players.set(fantraxPlayerId, {
            canonicalName,
            fantraxId: fantraxPlayerId,
            normalizedName,
          });

          auctions.push({
            amountCents,
            draftedAtMs,
            fantraxPick,
            fantraxPlayerId,
            leagueId,
            managerLabel: row['manager_label']?.trim() || null,
            rosterSlot: parseInteger(row, 'roster_slot', true),
            seasonKey,
            sourcePayload: { ...row },
            teamId: requiredString(row, 'team_id'),
            teamName: requiredString(row, 'team_name'),
          });
          rowCountBySeason.set(seasonKey, (rowCountBySeason.get(seasonKey) ?? 0) + 1);
          spendBySeason.set(seasonKey, (spendBySeason.get(seasonKey) ?? 0) + amountCents);
        }

        const seasons = [...rowCountBySeason.keys()].sort().map((seasonKey) => {
          const metadata = metadataBySeason.get(seasonKey)!;
          const report = reportBySeason.get(seasonKey)!;
          const expectedSeasonRows = numberField(report, 'normalized_price_count');
          const expectedSeasonSpend = parseCents(stringField(report, 'normalized_total_spend'));
          if (rowCountBySeason.get(seasonKey) !== expectedSeasonRows) {
            throw new Error(`${seasonKey} row count does not reconcile`);
          }
          if (spendBySeason.get(seasonKey) !== expectedSeasonSpend) {
            throw new Error(`${seasonKey} spend does not reconcile`);
          }
          return {
            baseBudgetCents,
            leagueId: stringField(metadata, 'league_id'),
            rosterSize,
            seasonKey,
            status: stringField(metadata, 'status'),
            teamCount: numberField(report, 'team_count'),
          };
        });

        const fingerprint = createHash('sha256')
          .update(bundle.configJson)
          .update('\0')
          .update(bundle.leagueSeasonsJson)
          .update('\0')
          .update(bundle.validationJson)
          .update('\0')
          .update(bundle.auctionCsv)
          .digest('hex');

        return {
          auctions,
          fingerprint,
          players: [...players.values()].sort((left, right) =>
            left.fantraxId.localeCompare(right.fantraxId),
          ),
          seasons,
          summary: {
            auctionCount: auctions.length,
            seasonCount: seasons.length,
            totalAmountCents: auctions.reduce((total, auction) => total + auction.amountCents, 0),
            uniquePlayerCount: players.size,
            warningCount,
          },
        };
      },
      catch: (cause) => {
        const details = cause instanceof Error ? cause.message : 'Normalized data is invalid';
        return validationError('invalid_normalized_data', details);
      },
    });
  });

export const commitHistoricalAuctionImport = <Error>(
  plan: HistoricalAuctionImportPlan,
  committer: HistoricalAuctionCommitter<Error>,
) =>
  committer.replaceHistoricalAuctions({
    auctions: plan.auctions,
    fingerprint: plan.fingerprint,
    players: plan.players,
    seasons: plan.seasons,
    warningCount: plan.summary.warningCount,
  });
