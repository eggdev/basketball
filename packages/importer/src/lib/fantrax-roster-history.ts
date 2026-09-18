import { createHash } from 'node:crypto';

import { Data, Effect } from 'effect';

import { normalizeProviderPlayerName } from './player-production';

export type InferredRosterChangeType = 'add' | 'drop' | 'team-change';

export interface FantraxRosterHistorySource {
  readonly leagueId: string;
  readonly leagueInfo: unknown;
  readonly playerCatalog: unknown;
  readonly rosterPayloads: ReadonlyArray<unknown>;
  readonly seasonKey: string;
}

export interface FantraxRosterHistoryPlayer {
  readonly canonicalName: string;
  readonly fantraxId: string;
  readonly normalizedName: string;
  readonly sourceName: string;
}

export interface FantraxRosterSnapshotRecord {
  readonly entries: ReadonlyArray<{
    readonly fantraxId: string;
    readonly position: string;
    readonly sourceTeamId: string;
    readonly status: string;
  }>;
  readonly leagueId: string;
  readonly periodEndAt: string;
  readonly periodStartAt: string;
  readonly rosterPeriod: number;
  readonly seasonKey: string;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
}

export interface InferredRosterChangeRecord {
  readonly changeType: InferredRosterChangeType;
  readonly fantraxId: string;
  readonly fromPosition: string | null;
  readonly fromStatus: string | null;
  readonly fromTeamId: string | null;
  readonly leagueId: string;
  readonly observedAt: string;
  readonly previousRosterPeriod: number;
  readonly rosterPeriod: number;
  readonly seasonKey: string;
  readonly toPosition: string | null;
  readonly toStatus: string | null;
  readonly toTeamId: string | null;
}

export interface FantraxRosterHistoryImportPlan {
  readonly changes: ReadonlyArray<InferredRosterChangeRecord>;
  readonly fingerprint: string;
  readonly players: ReadonlyArray<FantraxRosterHistoryPlayer>;
  readonly seasons: ReadonlyArray<{
    readonly baselineRosterPeriod: number;
    readonly leagueHistoryId: string;
    readonly leagueId: string;
    readonly seasonKey: string;
  }>;
  readonly snapshots: ReadonlyArray<FantraxRosterSnapshotRecord>;
  readonly source: 'fantrax-roster-history';
  readonly summary: {
    readonly addCount: number;
    readonly changeCount: number;
    readonly dropCount: number;
    readonly entryCount: number;
    readonly playerCount: number;
    readonly seasonCount: number;
    readonly snapshotCount: number;
    readonly teamChangeCount: number;
  };
}

export interface FantraxRosterHistoryImportResult {
  readonly alreadyImported: boolean;
  readonly changeCount: number;
  readonly ingestionRunId: string;
  readonly newPlayerCount: number;
  readonly playerCount: number;
  readonly seasonCount: number;
  readonly snapshotCount: number;
  readonly snapshotEntryCount: number;
}

export interface FantraxRosterHistoryCommitter<Error> {
  readonly saveLeagueRosterHistory: (
    batch: FantraxRosterHistoryImportPlan,
  ) => Effect.Effect<FantraxRosterHistoryImportResult, Error>;
}

export class FantraxRosterHistoryValidationError extends Data.TaggedError(
  'FantraxRosterHistoryValidationError',
)<{
  readonly message: string;
  readonly reason: string;
}> {}

const objectRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const arrayField = (
  row: Readonly<Record<string, unknown>>,
  key: string,
): ReadonlyArray<unknown> => {
  const value = row[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value;
};

const stringField = (row: Readonly<Record<string, unknown>>, key: string): string => {
  const value = row[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} is required`);
  return value.trim();
};

const integerField = (row: Readonly<Record<string, unknown>>, key: string): number => {
  const value = row[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${key} must be an integer`);
  return parsed;
};

const isoTimestamp = (value: string, label: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a timestamp`);
  return parsed.toISOString();
};

const canonicalFantraxName = (sourceName: string): string => {
  const parts = sourceName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : sourceName.trim();
};

export const readFantraxPlayerProfileName = (value: unknown, fantraxId: string): string => {
  const payload = objectRecord(value, `Fantrax player profile ${fantraxId}`);
  const responses = arrayField(payload, 'responses');
  const response = objectRecord(responses[0], `Fantrax player profile response ${fantraxId}`);
  const data = objectRecord(response['data'], `Fantrax player profile data ${fantraxId}`);
  const miscData = objectRecord(
    data['miscData'],
    `Fantrax player profile metadata ${fantraxId}`,
  );
  return stringField(miscData, 'name');
};

interface RosterOwnership {
  readonly position: string;
  readonly sourceTeamId: string;
  readonly status: string;
}

export const planFantraxRosterHistoryImport = (
  sources: ReadonlyArray<FantraxRosterHistorySource>,
): Effect.Effect<FantraxRosterHistoryImportPlan, FantraxRosterHistoryValidationError> =>
  Effect.try({
    try: () => {
      if (sources.length === 0) throw new Error('at least one historical season is required');
      const seasonKeys = new Set<string>();
      const leagueIds = new Set<string>();
      const allPlayers = new Map<string, FantraxRosterHistoryPlayer>();
      const snapshots: FantraxRosterSnapshotRecord[] = [];
      const changes: InferredRosterChangeRecord[] = [];
      const seasons: FantraxRosterHistoryImportPlan['seasons'][number][] = [];

      for (const source of sources) {
        if (!/^\d{4}-\d{2}$/.test(source.seasonKey)) {
          throw new Error(`${source.seasonKey} must use YYYY-YY format`);
        }
        if (seasonKeys.has(source.seasonKey)) {
          throw new Error(`${source.seasonKey} appears more than once`);
        }
        if (leagueIds.has(source.leagueId)) {
          throw new Error(`${source.leagueId} appears more than once`);
        }
        seasonKeys.add(source.seasonKey);
        leagueIds.add(source.leagueId);

        const leagueInfo = objectRecord(source.leagueInfo, `${source.seasonKey} league info`);
        const leagueHistoryId = stringField(leagueInfo, 'leagueHistoryId');
        const teamInfo = objectRecord(leagueInfo['teamInfo'], `${source.seasonKey} team info`);
        const sourceTeamIds = new Set(Object.keys(teamInfo));
        if (sourceTeamIds.size === 0) throw new Error(`${source.seasonKey} has no teams`);
        const periodByNumber = new Map(
          arrayField(leagueInfo, 'rosterPeriods').map((value) => {
            const period = objectRecord(value, `${source.seasonKey} roster period`);
            const number = integerField(period, 'number');
            return [
              number,
              {
                endAt: isoTimestamp(stringField(period, 'endDate'), 'roster period endDate'),
                startAt: isoTimestamp(stringField(period, 'startDate'), 'roster period startDate'),
              },
            ] as const;
          }),
        );
        if (source.rosterPayloads.length !== periodByNumber.size) {
          throw new Error(
            `${source.seasonKey} has ${source.rosterPayloads.length} roster payloads for ${periodByNumber.size} periods`,
          );
        }
        const playerCatalog = objectRecord(
          source.playerCatalog,
          `${source.seasonKey} player catalog`,
        );
        const seasonSnapshots: FantraxRosterSnapshotRecord[] = [];
        const seenPeriods = new Set<number>();

        for (const payloadValue of source.rosterPayloads) {
          const payload = objectRecord(payloadValue, `${source.seasonKey} roster response`);
          const rosterPeriod = integerField(payload, 'period');
          if (seenPeriods.has(rosterPeriod)) {
            throw new Error(`${source.seasonKey} repeats roster period ${rosterPeriod}`);
          }
          seenPeriods.add(rosterPeriod);
          const period = periodByNumber.get(rosterPeriod);
          if (period === undefined) {
            throw new Error(`${source.seasonKey} has unknown roster period ${rosterPeriod}`);
          }
          const rosters = objectRecord(payload['rosters'], `${source.seasonKey} rosters`);
          const rosterTeamIds = Object.keys(rosters);
          if (
            rosterTeamIds.length !== sourceTeamIds.size ||
            rosterTeamIds.some((teamId) => !sourceTeamIds.has(teamId))
          ) {
            throw new Error(
              `${source.seasonKey} period ${rosterPeriod} has incomplete or unknown teams`,
            );
          }
          const entries: FantraxRosterSnapshotRecord['entries'][number][] = [];
          const seenPlayers = new Set<string>();
          for (const [sourceTeamId, rosterValue] of Object.entries(rosters)) {
            const roster = objectRecord(rosterValue, `${source.seasonKey} team roster`);
            for (const itemValue of arrayField(roster, 'rosterItems')) {
              const item = objectRecord(itemValue, `${source.seasonKey} roster item`);
              const fantraxId = stringField(item, 'id');
              if (seenPlayers.has(fantraxId)) {
                throw new Error(
                  `${source.seasonKey} period ${rosterPeriod} repeats player ${fantraxId}`,
                );
              }
              seenPlayers.add(fantraxId);
              const catalogValue = playerCatalog[fantraxId];
              if (catalogValue === undefined) {
                throw new Error(`${source.seasonKey} roster player ${fantraxId} is not cataloged`);
              }
              const catalogPlayer = objectRecord(catalogValue, `player ${fantraxId}`);
              const sourceName = stringField(catalogPlayer, 'name');
              const canonicalName = canonicalFantraxName(sourceName);
              const knownPlayer = allPlayers.get(fantraxId);
              if (knownPlayer !== undefined && knownPlayer.sourceName !== sourceName) {
                throw new Error(`${fantraxId} maps to conflicting player names`);
              }
              allPlayers.set(fantraxId, {
                canonicalName,
                fantraxId,
                normalizedName: normalizeProviderPlayerName(canonicalName),
                sourceName,
              });
              entries.push({
                fantraxId,
                position: stringField(item, 'position'),
                sourceTeamId,
                status: stringField(item, 'status'),
              });
            }
          }
          entries.sort(
            (left, right) =>
              left.sourceTeamId.localeCompare(right.sourceTeamId) ||
              left.fantraxId.localeCompare(right.fantraxId),
          );
          seasonSnapshots.push({
            entries,
            leagueId: source.leagueId,
            periodEndAt: period.endAt,
            periodStartAt: period.startAt,
            rosterPeriod,
            seasonKey: source.seasonKey,
            sourcePayload: payload,
          });
        }

        seasonSnapshots.sort((left, right) => left.rosterPeriod - right.rosterPeriod);
        const baselineIndex = seasonSnapshots.findIndex((snapshot) => snapshot.entries.length > 0);
        if (baselineIndex < 0)
          throw new Error(`${source.seasonKey} has no populated roster period`);
        const baseline = seasonSnapshots[baselineIndex]!;
        let previous = baseline;
        let previousOwnership = new Map(
          baseline.entries.map(
            (entry) =>
              [
                entry.fantraxId,
                {
                  position: entry.position,
                  sourceTeamId: entry.sourceTeamId,
                  status: entry.status,
                },
              ] as const,
          ),
        );
        for (const snapshot of seasonSnapshots.slice(baselineIndex + 1)) {
          if (snapshot.entries.length === 0) {
            throw new Error(
              `${source.seasonKey} period ${snapshot.rosterPeriod} is empty after the roster baseline`,
            );
          }
          const ownership = new Map<string, RosterOwnership>(
            snapshot.entries.map((entry) => [
              entry.fantraxId,
              {
                position: entry.position,
                sourceTeamId: entry.sourceTeamId,
                status: entry.status,
              },
            ]),
          );
          const playerIds = new Set([...previousOwnership.keys(), ...ownership.keys()]);
          for (const fantraxId of playerIds) {
            const from = previousOwnership.get(fantraxId) ?? null;
            const to = ownership.get(fantraxId) ?? null;
            if (from?.sourceTeamId === to?.sourceTeamId) continue;
            changes.push({
              changeType: from === null ? 'add' : to === null ? 'drop' : 'team-change',
              fantraxId,
              fromPosition: from?.position ?? null,
              fromStatus: from?.status ?? null,
              fromTeamId: from?.sourceTeamId ?? null,
              leagueId: source.leagueId,
              observedAt: snapshot.periodStartAt,
              previousRosterPeriod: previous.rosterPeriod,
              rosterPeriod: snapshot.rosterPeriod,
              seasonKey: source.seasonKey,
              toPosition: to?.position ?? null,
              toStatus: to?.status ?? null,
              toTeamId: to?.sourceTeamId ?? null,
            });
          }
          previous = snapshot;
          previousOwnership = ownership;
        }

        seasons.push({
          baselineRosterPeriod: baseline.rosterPeriod,
          leagueHistoryId,
          leagueId: source.leagueId,
          seasonKey: source.seasonKey,
        });
        snapshots.push(...seasonSnapshots);
      }

      seasons.sort((left, right) => left.seasonKey.localeCompare(right.seasonKey));
      snapshots.sort(
        (left, right) =>
          left.seasonKey.localeCompare(right.seasonKey) || left.rosterPeriod - right.rosterPeriod,
      );
      changes.sort(
        (left, right) =>
          left.seasonKey.localeCompare(right.seasonKey) ||
          left.rosterPeriod - right.rosterPeriod ||
          left.fantraxId.localeCompare(right.fantraxId),
      );
      const players = [...allPlayers.values()].sort((left, right) =>
        left.fantraxId.localeCompare(right.fantraxId),
      );
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            changes,
            players,
            seasons,
            snapshots,
            source: 'fantrax-roster-history',
          }),
        )
        .digest('hex');

      return {
        changes,
        fingerprint,
        players,
        seasons,
        snapshots,
        source: 'fantrax-roster-history' as const,
        summary: {
          addCount: changes.filter((change) => change.changeType === 'add').length,
          changeCount: changes.length,
          dropCount: changes.filter((change) => change.changeType === 'drop').length,
          entryCount: snapshots.reduce((count, snapshot) => count + snapshot.entries.length, 0),
          playerCount: players.length,
          seasonCount: seasons.length,
          snapshotCount: snapshots.length,
          teamChangeCount: changes.filter((change) => change.changeType === 'team-change').length,
        },
      };
    },
    catch: (cause) => {
      const reason = cause instanceof Error ? cause.message : 'Fantrax roster history is invalid';
      return new FantraxRosterHistoryValidationError({
        message: `Fantrax roster history could not be validated: ${reason}`,
        reason,
      });
    },
  });

export const commitFantraxRosterHistoryImport = <Error>(
  plan: FantraxRosterHistoryImportPlan,
  committer: FantraxRosterHistoryCommitter<Error>,
): Effect.Effect<FantraxRosterHistoryImportResult, Error> =>
  committer.saveLeagueRosterHistory(plan);
