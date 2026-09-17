import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'csv-parse/sync';
import { Data, Effect } from 'effect';

import {
  resolveLeagueIdentity,
  type CanonicalLeagueMember,
  type CanonicalLeagueTeamSeason,
  type LeagueIdentitySourceTeam,
} from './league-identity';

export interface HistoricalAuctionSourceBundle {
  readonly auctionCsv: string;
  readonly configJson: string;
  readonly leagueMembersJson: string;
  readonly leagueSeasonsJson: string;
  readonly validationJson: string;
}

export interface HistoricalAuctionSeason {
  readonly baseBudgetCents: number;
  readonly leagueHistoryId: string;
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
  readonly leagueMembers: ReadonlyArray<CanonicalLeagueMember>;
  readonly leagueTeams: ReadonlyArray<CanonicalLeagueTeamSeason>;
  readonly players: ReadonlyArray<HistoricalAuctionPlayer>;
  readonly seasons: ReadonlyArray<HistoricalAuctionSeason>;
  readonly summary: {
    readonly auctionCount: number;
    readonly canonicalMemberCount: number;
    readonly leagueTeamSeasonCount: number;
    readonly seasonCount: number;
    readonly totalAmountCents: number;
    readonly uniquePlayerCount: number;
    readonly unresolvedTeamSeasonCount: number;
    readonly warningCount: number;
  };
}

export interface HistoricalAuctionCommitResult {
  readonly auctionCount: number;
  readonly canonicalMemberCount: number;
  readonly ingestionRunId: string;
  readonly leagueTeamSeasonCount: number;
  readonly playerCount: number;
  readonly seasonCount: number;
  readonly unresolvedTeamSeasonCount: number;
}

export type HistoricalAuctionCommitBatch = Pick<
  HistoricalAuctionImportPlan,
  'auctions' | 'fingerprint' | 'leagueMembers' | 'leagueTeams' | 'players' | 'seasons'
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
      const [auctionCsv, configJson, leagueMembersJson, leagueSeasonsJson, validationJson] =
        await Promise.all([
          readFile(join(projectRoot, 'data/normalized/auction_results.csv'), 'utf8'),
          readFile(join(projectRoot, 'config/seasons.json'), 'utf8'),
          readFile(join(projectRoot, 'config/league-members.json'), 'utf8').catch(
            (cause: NodeJS.ErrnoException) => {
              if (cause.code === 'ENOENT') return '{"members":[]}\n';
              throw cause;
            },
          ),
          readFile(join(projectRoot, 'data/normalized/league_seasons.json'), 'utf8'),
          readFile(join(projectRoot, 'data/reports/import_validation.json'), 'utf8'),
        ]);
      return { auctionCsv, configJson, leagueMembersJson, leagueSeasonsJson, validationJson };
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
    const leagueMembers = yield* parseJson('league member config', bundle.leagueMembersJson);
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
        const managerBySeasonTeam = new Map<string, string>();

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
          const managerLabel = row['manager_label']?.trim();
          if (managerLabel) {
            const teamKey = `${seasonKey}:${requiredString(row, 'team_id')}`;
            const knownManager = managerBySeasonTeam.get(teamKey);
            if (knownManager !== undefined && knownManager !== managerLabel) {
              throw new Error(`${teamKey} maps to conflicting manager labels`);
            }
            managerBySeasonTeam.set(teamKey, managerLabel);
          }
          rowCountBySeason.set(seasonKey, (rowCountBySeason.get(seasonKey) ?? 0) + 1);
          spendBySeason.set(seasonKey, (spendBySeason.get(seasonKey) ?? 0) + amountCents);
        }

        const sourceTeams: LeagueIdentitySourceTeam[] = [];
        const seasons = [...metadataBySeason.keys()].sort().map((seasonKey) => {
          const metadata = metadataBySeason.get(seasonKey)!;
          const report = reportBySeason.get(seasonKey)!;
          const expectedSeasonRows = numberField(report, 'normalized_price_count');
          const expectedSeasonSpend = parseCents(stringField(report, 'normalized_total_spend'));
          if ((rowCountBySeason.get(seasonKey) ?? 0) !== expectedSeasonRows) {
            throw new Error(`${seasonKey} row count does not reconcile`);
          }
          if ((spendBySeason.get(seasonKey) ?? 0) !== expectedSeasonSpend) {
            throw new Error(`${seasonKey} spend does not reconcile`);
          }
          const leagueHistoryId = stringField(metadata, 'league_history_id');
          const leagueId = stringField(metadata, 'league_id');
          const teamMetadata = metadata['teams'];
          if (!Array.isArray(teamMetadata)) {
            throw new Error(`${seasonKey} is missing normalized Fantrax teams`);
          }
          if (teamMetadata.length !== numberField(report, 'team_count')) {
            throw new Error(`${seasonKey} team count does not reconcile`);
          }
          const sourceTeamIds = new Set<string>();
          for (const team of teamMetadata) {
            if (!isObject(team)) throw new Error(`${seasonKey} team metadata must be objects`);
            const sourceTeamId = stringField(team, 'id');
            if (sourceTeamIds.has(sourceTeamId)) {
              throw new Error(`${seasonKey} contains duplicate team ${sourceTeamId}`);
            }
            sourceTeamIds.add(sourceTeamId);
            const division = team['division'];
            if (division !== null && division !== undefined && typeof division !== 'string') {
              throw new Error(`${seasonKey}:${sourceTeamId} division must be a string or null`);
            }
            sourceTeams.push({
              division: typeof division === 'string' && division.trim() ? division.trim() : null,
              leagueHistoryId,
              leagueId,
              managerLabel: managerBySeasonTeam.get(`${seasonKey}:${sourceTeamId}`) ?? null,
              seasonKey,
              sourceTeamId,
              teamName: stringField(team, 'name'),
            });
          }
          return {
            baseBudgetCents,
            leagueHistoryId,
            leagueId,
            rosterSize,
            seasonKey,
            status: stringField(metadata, 'status'),
            teamCount: numberField(report, 'team_count'),
          };
        });

        for (const auction of auctions) {
          if (
            !sourceTeams.some(
              (team) =>
                team.seasonKey === auction.seasonKey && team.sourceTeamId === auction.teamId,
            )
          ) {
            throw new Error(
              `${auction.seasonKey} auction references unknown team ${auction.teamId}`,
            );
          }
        }

        const identity = resolveLeagueIdentity(leagueMembers, sourceTeams);

        const fingerprint = createHash('sha256')
          .update(bundle.configJson)
          .update('\0')
          .update(bundle.leagueSeasonsJson)
          .update('\0')
          .update(bundle.leagueMembersJson)
          .update('\0')
          .update(bundle.validationJson)
          .update('\0')
          .update(bundle.auctionCsv)
          .digest('hex');

        return {
          auctions,
          fingerprint,
          leagueMembers: identity.members,
          leagueTeams: identity.teams,
          players: [...players.values()].sort((left, right) =>
            left.fantraxId.localeCompare(right.fantraxId),
          ),
          seasons,
          summary: {
            auctionCount: auctions.length,
            canonicalMemberCount: identity.members.length,
            leagueTeamSeasonCount: identity.teams.length,
            seasonCount: seasons.length,
            totalAmountCents: auctions.reduce((total, auction) => total + auction.amountCents, 0),
            uniquePlayerCount: players.size,
            unresolvedTeamSeasonCount: identity.teams.filter((team) => team.memberKey === null)
              .length,
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
    leagueMembers: plan.leagueMembers,
    leagueTeams: plan.leagueTeams,
    players: plan.players,
    seasons: plan.seasons,
    warningCount: plan.summary.warningCount,
  });
