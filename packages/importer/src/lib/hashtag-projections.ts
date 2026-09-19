import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  buildProjectionRun,
  type GameStatLine,
  type HistoricalBonusSeason,
  type PlayerSeasonProjection,
  type PlayerSeasonSchedule,
  type ProjectionModelSettings,
  type ScoringRules,
} from '@fantasy-basketball/fantasy';
import { parse } from 'csv-parse/sync';
import { Data, Effect } from 'effect';

import { normalizeProviderPlayerName } from './player-production';

export interface ProjectionCanonicalPlayer {
  readonly canonicalName: string;
  readonly normalizedName: string;
  readonly playerId: string;
}

export interface ProjectionHistoryRecord {
  readonly gamesPlayed: number;
  readonly playerId: string;
  readonly seasonKey: string;
  readonly stats: Readonly<Record<string, number | null>>;
}

export interface HashtagProjectionRecord {
  readonly canonicalName: string;
  readonly existingPlayerId: string | null;
  readonly normalizedName: string;
  readonly projection: PlayerSeasonProjection;
  readonly sourceExternalId: string;
  readonly sourceName: string;
  readonly sourcePayload: Readonly<Record<string, string>>;
}

export interface HashtagProjectionIssue {
  readonly candidatePlayerIds: ReadonlyArray<string>;
  readonly kind: 'ambiguous_player' | 'unresolved_abbreviation' | 'unresolved_team_schedule';
  readonly sourceName: string;
}

export interface HashtagProjectionImportPlan {
  readonly asOf: string;
  readonly calendar: {
    readonly fingerprint: string;
    readonly snapshotId: string;
  } | null;
  readonly fingerprint: string;
  readonly issues: ReadonlyArray<HashtagProjectionIssue>;
  readonly limitations: ReadonlyArray<string>;
  readonly modelVersion: string;
  readonly records: ReadonlyArray<HashtagProjectionRecord>;
  readonly seasonKey: string;
  readonly source: 'hashtag';
  readonly summary: {
    readonly existingPlayerCount: number;
    readonly newPlayerCount: number;
    readonly playerCount: number;
    readonly unresolvedPlayerCount: number;
    readonly valid: boolean;
  };
}

export type HashtagProjectionCommitBatch = Pick<
  HashtagProjectionImportPlan,
  | 'asOf'
  | 'calendar'
  | 'fingerprint'
  | 'limitations'
  | 'modelVersion'
  | 'records'
  | 'seasonKey'
  | 'source'
>;

export interface ProjectionSnapshotCommitResult {
  readonly ingestionRunId: string;
  readonly newPlayerCount: number;
  readonly playerProjectionCount: number;
  readonly snapshotId: string;
}

export interface ProjectionSnapshotCommitter<Error> {
  readonly saveProjectionSnapshot: (
    batch: HashtagProjectionCommitBatch,
  ) => Effect.Effect<ProjectionSnapshotCommitResult, Error>;
}

export class HashtagProjectionSourceError extends Data.TaggedError('HashtagProjectionSourceError')<{
  readonly message: string;
  readonly reason: string;
}> {}

export class HashtagProjectionValidationError extends Data.TaggedError(
  'HashtagProjectionValidationError',
)<{
  readonly message: string;
  readonly reason: string;
}> {}

const normalizedHeader = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll('%', ' pct ')
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_|_$/g, '');

const normalizedRow = (row: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizedHeader(key), value.trim()]),
  );

const field = (
  row: Readonly<Record<string, string>>,
  names: ReadonlyArray<string>,
  label: string,
): string => {
  for (const name of names) {
    const value = row[normalizedHeader(name)];
    if (value !== undefined && value !== '') return value;
  }
  throw new Error(`${label} is required`);
};

const optionalField = (
  row: Readonly<Record<string, string>>,
  names: ReadonlyArray<string>,
): string | null => {
  for (const name of names) {
    const value = row[normalizedHeader(name)];
    if (value !== undefined && value !== '') return value;
  }
  return null;
};

const numberField = (
  row: Readonly<Record<string, string>>,
  names: ReadonlyArray<string>,
  label: string,
): number => {
  const value = Number(field(row, names, label));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
};

const optionalProjectedBonusRates = (
  row: Readonly<Record<string, string>>,
):
  | {
      readonly doubleDoubleRate: number;
      readonly tripleDoubleRate: number;
    }
  | undefined => {
  const doubleDouble = optionalField(row, [
    'dd',
    '2d',
    'double_double_rate',
    'double_doubles_per_game',
  ]);
  const tripleDouble = optionalField(row, [
    'td',
    '3d',
    'triple_double_rate',
    'triple_doubles_per_game',
  ]);
  if (doubleDouble === null && tripleDouble === null) return undefined;
  if (doubleDouble === null || tripleDouble === null) {
    throw new Error('double-double and triple-double projection rates must be supplied together');
  }

  const doubleDoubleRate = Number(doubleDouble);
  const tripleDoubleRate = Number(tripleDouble);
  if (!Number.isFinite(doubleDoubleRate) || doubleDoubleRate < 0 || doubleDoubleRate > 1) {
    throw new Error('double-double projection rate must be between zero and one');
  }
  if (!Number.isFinite(tripleDoubleRate) || tripleDoubleRate < 0 || tripleDoubleRate > 1) {
    throw new Error('triple-double projection rate must be between zero and one');
  }
  if (tripleDoubleRate > doubleDoubleRate) {
    throw new Error('triple-double projection rate cannot exceed double-double projection rate');
  }
  return { doubleDoubleRate, tripleDoubleRate };
};

const shootingVolume = (
  row: Readonly<Record<string, string>>,
  makeHeaders: ReadonlyArray<string>,
  attemptHeaders: ReadonlyArray<string>,
  percentageHeaders: ReadonlyArray<string>,
  label: string,
): readonly [number, number] => {
  const makes = optionalField(row, makeHeaders);
  const attempts = optionalField(row, attemptHeaders);
  if (makes !== null && attempts !== null) {
    const parsedMakes = Number(makes);
    const parsedAttempts = Number(attempts);
    if (
      Number.isFinite(parsedMakes) &&
      Number.isFinite(parsedAttempts) &&
      parsedMakes >= 0 &&
      parsedAttempts >= parsedMakes
    ) {
      return [parsedMakes, parsedAttempts];
    }
    throw new Error(`${label} makes and attempts are invalid`);
  }

  const percentage = field(row, percentageHeaders, `${label} percentage`);
  const match = /\(\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\)/.exec(percentage);
  if (match === null) {
    throw new Error(`${label} percentage must include projected makes/attempts`);
  }
  const parsedMakes = Number(match[1]);
  const parsedAttempts = Number(match[2]);
  if (parsedAttempts < parsedMakes) throw new Error(`${label} attempts cannot be below makes`);
  return [parsedMakes, parsedAttempts];
};

const positions = (value: string): ReadonlyArray<string> => {
  const parsed = value
    .toUpperCase()
    .split(/[\s,/]+/)
    .map((position) => position.trim())
    .filter(Boolean);
  if (parsed.length === 0) throw new Error('position is required');
  return [...new Set(parsed)];
};

const abbreviationParts = (
  value: string,
): { readonly initial: string; readonly surname: string } | null => {
  const match = /^([A-Za-z])(?:\.\s*|\s+)(.+)$/.exec(value.trim());
  if (match === null) return null;
  return {
    initial: match[1]!.toLowerCase(),
    surname: normalizeProviderPlayerName(match[2]!),
  };
};

const abbreviatedName = (value: string): boolean => abbreviationParts(value) !== null;

const collapseLeadingInitials = (value: string): string => {
  const match = /^((?:[A-Za-z]\.){2,})\s*(.+)$/.exec(value.trim());
  return match === null ? value.trim() : `${match[1]!.replaceAll('.', '')} ${match[2]!}`;
};

const abbreviationCandidates = (
  sourceName: string,
  players: ReadonlyArray<ProjectionCanonicalPlayer>,
): ReadonlyArray<ProjectionCanonicalPlayer> => {
  const abbreviation = abbreviationParts(sourceName);
  if (abbreviation === null) return [];
  return players.filter((player) => {
    const tokens = normalizeProviderPlayerName(player.canonicalName).split(' ');
    return tokens[0]?.at(0) === abbreviation.initial && tokens.at(-1) === abbreviation.surname;
  });
};

const historyStat = (record: ProjectionHistoryRecord, key: string): number => {
  const value = record.stats[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${record.playerId} ${record.seasonKey} has invalid ${key}`);
  }
  return value;
};

export const loadHashtagProjectionCsv = (
  path: string,
): Effect.Effect<string, HashtagProjectionSourceError> =>
  Effect.tryPromise({
    try: () => readFile(path, 'utf8'),
    catch: (cause) =>
      new HashtagProjectionSourceError({
        message: 'Hashtag projection CSV could not be loaded',
        reason: cause instanceof Error ? cause.message : 'projection source is unavailable',
      }),
  });

export const planHashtagProjectionImport = (input: {
  readonly asOf: string;
  readonly calendar?: {
    readonly fingerprint: string;
    readonly schedulesByTeam: Readonly<Record<string, PlayerSeasonSchedule>>;
    readonly snapshotId: string;
  };
  readonly canonicalPlayers: ReadonlyArray<ProjectionCanonicalPlayer>;
  readonly csv: string;
  readonly history: ReadonlyArray<ProjectionHistoryRecord>;
  readonly modelVersion: string;
  readonly rules: ScoringRules;
  readonly seasonKey: string;
  readonly settings?: ProjectionModelSettings;
}): Effect.Effect<HashtagProjectionImportPlan, HashtagProjectionValidationError> =>
  Effect.try({
    try: () => {
      const asOf = new Date(input.asOf);
      if (Number.isNaN(asOf.getTime())) throw new Error('asOf must be an ISO date or timestamp');
      if (!/^\d{4}-\d{2}$/.test(input.seasonKey)) {
        throw new Error('seasonKey must use YYYY-YY format');
      }
      if (input.modelVersion.trim() === '') throw new Error('modelVersion is required');

      const parsedRows = parse(input.csv, {
        bom: true,
        columns: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, string>>;
      if (parsedRows.length === 0) throw new Error('projection CSV contains no players');

      const playersByNormalizedName = new Map<string, ProjectionCanonicalPlayer[]>();
      for (const player of input.canonicalPlayers) {
        const normalizedName = normalizeProviderPlayerName(player.normalizedName);
        const candidates = playersByNormalizedName.get(normalizedName) ?? [];
        candidates.push(player);
        playersByNormalizedName.set(normalizedName, candidates);
      }

      const sourceRows: Array<{
        canonicalName: string;
        existingPlayerId: string | null;
        normalizedName: string;
        playerKey: string;
        positions: ReadonlyArray<string>;
        projectedBonusRates?: {
          readonly doubleDoubleRate: number;
          readonly tripleDoubleRate: number;
        };
        sourceExternalId: string;
        sourceName: string;
        sourcePayload: Readonly<Record<string, string>>;
        statLine: GameStatLine;
        teamAbbreviation: string;
        expectedGames: number;
      }> = [];
      const issues: HashtagProjectionIssue[] = [];
      const seenPlayerKeys = new Set<string>();

      for (const sourcePayload of parsedRows) {
        const row = normalizedRow(sourcePayload);
        const sourceName = field(row, ['player', 'name'], 'player name');
        const completeSourceName = collapseLeadingInitials(sourceName);
        const normalizedSourceName = normalizeProviderPlayerName(completeSourceName);
        const rawNormalizedSourceName = normalizeProviderPlayerName(sourceName);
        let candidates = [
          ...(playersByNormalizedName.get(normalizedSourceName) ?? []),
          ...(playersByNormalizedName.get(rawNormalizedSourceName) ?? []),
        ].filter(
          (candidate, index, all) =>
            all.findIndex((item) => item.playerId === candidate.playerId) === index,
        );
        if (candidates.length === 0 && abbreviatedName(sourceName)) {
          candidates = [...abbreviationCandidates(sourceName, input.canonicalPlayers)];
        }
        if (candidates.length > 1) {
          issues.push({
            candidatePlayerIds: candidates.map((candidate) => candidate.playerId).sort(),
            kind: 'ambiguous_player',
            sourceName,
          });
          continue;
        }
        const existing = candidates[0] ?? null;
        if (existing === null && abbreviatedName(sourceName) && completeSourceName === sourceName) {
          issues.push({
            candidatePlayerIds: [],
            kind: 'unresolved_abbreviation',
            sourceName,
          });
          continue;
        }

        const canonicalName = existing?.canonicalName ?? completeSourceName;
        const normalizedName = normalizeProviderPlayerName(canonicalName);
        const playerKey = existing?.playerId ?? `hashtag:${normalizedName}`;
        if (seenPlayerKeys.has(playerKey)) throw new Error(`${sourceName} appears more than once`);
        seenPlayerKeys.add(playerKey);

        const [fieldGoalsMade, fieldGoalsAttempted] = shootingVolume(
          row,
          ['fgm'],
          ['fga'],
          ['fg%', 'fg_pct'],
          'field goal',
        );
        const [freeThrowsMade, freeThrowsAttempted] = shootingVolume(
          row,
          ['ftm'],
          ['fta'],
          ['ft%', 'ft_pct'],
          'free throw',
        );
        const teamAbbreviation = field(row, ['team'], 'team').toUpperCase();
        if (
          input.calendar !== undefined &&
          input.calendar.schedulesByTeam[teamAbbreviation] === undefined
        ) {
          issues.push({
            candidatePlayerIds: [],
            kind: 'unresolved_team_schedule',
            sourceName: `${sourceName} (${teamAbbreviation})`,
          });
        }
        const explicitExternalId = optionalField(row, ['player_id', 'id']);
        sourceRows.push({
          canonicalName,
          existingPlayerId: existing?.playerId ?? null,
          expectedGames: numberField(row, ['gp', 'games'], 'games played'),
          normalizedName,
          playerKey,
          positions: positions(field(row, ['pos', 'position'], 'position')),
          projectedBonusRates: optionalProjectedBonusRates(row),
          sourceExternalId: explicitExternalId ?? normalizedName,
          sourceName,
          sourcePayload,
          statLine: {
            assists: numberField(row, ['ast'], 'assists'),
            blocks: numberField(row, ['blk'], 'blocks'),
            fieldGoalsAttempted,
            fieldGoalsMade,
            freeThrowsAttempted,
            freeThrowsMade,
            points: numberField(row, ['pts'], 'points'),
            rebounds: numberField(row, ['treb', 'reb'], 'rebounds'),
            steals: numberField(row, ['stl'], 'steals'),
            threePointersMade: numberField(row, ['3pm', '3ptm', 'fg3m'], 'three-pointers made'),
            turnovers: numberField(row, ['to', 'tov'], 'turnovers'),
          },
          teamAbbreviation,
        });
      }

      const history: HistoricalBonusSeason[] = input.history.map((record) => ({
        doubleDoubles: historyStat(record, 'double_double'),
        gamesPlayed: record.gamesPlayed,
        playerId: record.playerId,
        seasonKey: record.seasonKey,
        tripleDoubles: historyStat(record, 'triple_double'),
      }));
      const projectionRun = buildProjectionRun({
        history,
        players: sourceRows.map((row) => ({
          expectedGames: row.expectedGames,
          playerId: row.playerKey,
          playerName: row.canonicalName,
          positions: row.positions,
          projectedBonusRates: row.projectedBonusRates,
          schedule: input.calendar?.schedulesByTeam[row.teamAbbreviation],
          statsPerGame: row.statLine,
          teamAbbreviation: row.teamAbbreviation,
        })),
        rules: input.rules,
        settings: input.settings,
      });
      const projectionsByPlayer = new Map(
        projectionRun.players.map((projection) => [projection.playerId, projection]),
      );
      const records = sourceRows.map((row): HashtagProjectionRecord => {
        const projection = projectionsByPlayer.get(row.playerKey);
        if (projection === undefined) throw new Error(`${row.canonicalName} was not projected`);
        return {
          canonicalName: row.canonicalName,
          existingPlayerId: row.existingPlayerId,
          normalizedName: row.normalizedName,
          projection,
          sourceExternalId: row.sourceExternalId,
          sourceName: row.sourceName,
          sourcePayload: row.sourcePayload,
        };
      });
      records.sort(
        (left, right) =>
          right.projection.fantasyPoints - left.projection.fantasyPoints ||
          left.canonicalName.localeCompare(right.canonicalName),
      );
      issues.sort((left, right) => left.sourceName.localeCompare(right.sourceName));
      const fingerprintRecords = records.map((record) => ({
        canonicalName: record.canonicalName,
        normalizedName: record.normalizedName,
        projection: {
          ...record.projection,
          playerId: record.sourceExternalId,
        },
        sourceExternalId: record.sourceExternalId,
        sourceName: record.sourceName,
        sourcePayload: record.sourcePayload,
      }));
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            asOf: asOf.toISOString(),
            calendar:
              input.calendar === undefined
                ? null
                : {
                    fingerprint: input.calendar.fingerprint,
                    snapshotId: input.calendar.snapshotId,
                  },
            issues,
            modelVersion: input.modelVersion,
            records: fingerprintRecords,
            seasonKey: input.seasonKey,
            source: 'hashtag',
          }),
        )
        .digest('hex');
      const existingPlayerCount = records.filter(
        (record) => record.existingPlayerId !== null,
      ).length;

      return {
        asOf: asOf.toISOString(),
        calendar:
          input.calendar === undefined
            ? null
            : {
                fingerprint: input.calendar.fingerprint,
                snapshotId: input.calendar.snapshotId,
              },
        fingerprint,
        issues,
        limitations: input.calendar === undefined ? ['missing-season-calendar'] : [],
        modelVersion: input.modelVersion,
        records,
        seasonKey: input.seasonKey,
        source: 'hashtag' as const,
        summary: {
          existingPlayerCount,
          newPlayerCount: records.length - existingPlayerCount,
          playerCount: records.length,
          unresolvedPlayerCount: issues.length,
          valid: issues.length === 0,
        },
      };
    },
    catch: (cause) =>
      new HashtagProjectionValidationError({
        message: 'Hashtag projections could not be validated',
        reason: cause instanceof Error ? cause.message : 'projection source is invalid',
      }),
  });

export const commitHashtagProjectionImport = <Error>(
  plan: HashtagProjectionImportPlan,
  committer: ProjectionSnapshotCommitter<Error>,
  options: { readonly allowMissingSchedule?: boolean } = {},
): Effect.Effect<ProjectionSnapshotCommitResult, Error | HashtagProjectionValidationError> => {
  if (!plan.summary.valid) {
    return Effect.fail(
      new HashtagProjectionValidationError({
        message: 'Hashtag projections contain unresolved players',
        reason: `${plan.summary.unresolvedPlayerCount} player identities are unresolved`,
      }),
    );
  }
  if (plan.calendar === null && options.allowMissingSchedule !== true) {
    return Effect.fail(
      new HashtagProjectionValidationError({
        message: 'Hashtag projections are missing a season calendar',
        reason: 'pass --allow-missing-schedule to record a schedule-null projection snapshot',
      }),
    );
  }
  return committer.saveProjectionSnapshot({
    asOf: plan.asOf,
    calendar: plan.calendar,
    fingerprint: plan.fingerprint,
    limitations: plan.limitations,
    modelVersion: plan.modelVersion,
    records: plan.records,
    seasonKey: plan.seasonKey,
    source: plan.source,
  });
};
