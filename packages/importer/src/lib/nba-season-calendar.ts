import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { PlayerSeasonSchedule } from '@fantasy-basketball/fantasy';
import { Data, Effect } from 'effect';

import type {
  BallDontLieRegularSeasonGame,
  BallDontLieScheduleProvider,
} from './player-production';

export const nbaTeamAbbreviations = [
  'ATL',
  'BKN',
  'BOS',
  'CHA',
  'CHI',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GSW',
  'HOU',
  'IND',
  'LAC',
  'LAL',
  'MEM',
  'MIA',
  'MIL',
  'MIN',
  'NOP',
  'NYK',
  'OKC',
  'ORL',
  'PHI',
  'PHX',
  'POR',
  'SAC',
  'SAS',
  'TOR',
  'UTA',
  'WAS',
] as const;

const nbaTeams = new Set<string>(nbaTeamAbbreviations);

export type FantasyPlayoffRound = 'final' | 'quarterfinal' | 'semifinal';

export interface SeasonCalendarGame extends BallDontLieRegularSeasonGame {}

export interface SeasonCalendarPeriod {
  readonly endAt: string;
  readonly phase: 'playoffs' | 'regular-season';
  readonly playoffRound: FantasyPlayoffRound | null;
  readonly scoringPeriod: number;
  readonly startAt: string;
}

export interface SeasonCalendar {
  readonly fantraxCapturedAt: string;
  readonly fingerprint: string;
  readonly games: ReadonlyArray<SeasonCalendarGame>;
  readonly leagueId: string;
  readonly nbaScheduleSnapshotId: string;
  readonly fantasyPeriods: ReadonlyArray<SeasonCalendarPeriod>;
  readonly schedulesByTeam: Readonly<Record<string, PlayerSeasonSchedule>>;
  readonly seasonKey: string;
}

export interface SeasonCalendarImportPlan extends Omit<SeasonCalendar, 'nbaScheduleSnapshotId'> {
  readonly nbaSourceId: string;
  readonly summary: {
    readonly gameCount: number;
    readonly playoffPeriodCount: number;
    readonly postponedGameCount: number;
    readonly regularSeasonPeriodCount: number;
    readonly teamCount: number;
  };
}

export interface SeasonCalendarCommitResult {
  readonly alreadyImported: boolean;
  readonly gameCount: number;
  readonly ingestionRunId: string;
  readonly periodCount: number;
  readonly snapshotId: string;
}

export interface SeasonCalendarCommitter<Error> {
  readonly saveSeasonCalendar: (
    plan: SeasonCalendarImportPlan,
  ) => Effect.Effect<SeasonCalendarCommitResult, Error>;
}

export interface FantraxLeagueInfoProvider<Error> {
  readonly getLeagueInfo: (leagueId: string) => Effect.Effect<unknown, Error>;
}

export interface SeasonCalendarSourceProvider<NbaError, FantraxError> {
  readonly fantrax: FantraxLeagueInfoProvider<FantraxError>;
  readonly nba: BallDontLieScheduleProvider<NbaError>;
}

export class SeasonCalendarValidationError extends Data.TaggedError(
  'SeasonCalendarValidationError',
)<{
  readonly message: string;
  readonly reason: string;
}> {}

export class FantraxLeagueInfoProviderError extends Data.TaggedError(
  'FantraxLeagueInfoProviderError',
)<{
  readonly message: string;
  readonly reason: string;
  readonly status: number | null;
}> {}

type JsonObject = Record<string, unknown>;

const objectRecord = (value: unknown, label: string): JsonObject => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
};

const arrayField = (row: Readonly<JsonObject>, key: string): ReadonlyArray<unknown> => {
  const value = row[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value;
};

const integerField = (row: Readonly<JsonObject>, key: string): number => {
  const value = typeof row[key] === 'number' ? row[key] : Number(row[key]);
  if (!Number.isSafeInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
};

const isoTimestamp = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a timestamp`);
  return parsed.toISOString();
};

const seasonStartYear = (seasonKey: string): number => {
  const match = /^(\d{4})-(\d{2})$/.exec(seasonKey);
  if (match === null) throw new Error('seasonKey must use YYYY-YY format');
  const start = Number(match[1]);
  if ((start + 1) % 100 !== Number(match[2])) {
    throw new Error('seasonKey end year must follow its start year');
  }
  return start;
};

const playoffRound = (period: number, finalPeriod: number): FantasyPlayoffRound => {
  const distance = finalPeriod - period;
  if (distance === 0) return 'final';
  if (distance === 1) return 'semifinal';
  return 'quarterfinal';
};

const playoffWeight = (round: FantasyPlayoffRound): number => {
  if (round === 'final') return 1.5;
  if (round === 'semifinal') return 1;
  return 0.75;
};

const playoffLabel = (round: FantasyPlayoffRound): string => {
  if (round === 'final') return 'Championship';
  if (round === 'semifinal') return 'Semifinal';
  return 'Quarterfinal';
};

export const buildSchedulesByTeam = (
  games: ReadonlyArray<SeasonCalendarGame>,
  periods: ReadonlyArray<SeasonCalendarPeriod>,
): Readonly<Record<string, PlayerSeasonSchedule>> => {
  const gamesByTeam = new Map<string, SeasonCalendarGame[]>();
  for (const team of nbaTeamAbbreviations) gamesByTeam.set(team, []);
  for (const game of games) {
    gamesByTeam.get(game.homeTeam)?.push(game);
    gamesByTeam.get(game.awayTeam)?.push(game);
  }

  return Object.fromEntries(
    nbaTeamAbbreviations.map((team) => {
      const teamGames = gamesByTeam.get(team) ?? [];
      return [
        team,
        {
          fantasyPlayoffWeeks: periods
            .filter(
              (period): period is SeasonCalendarPeriod & { playoffRound: FantasyPlayoffRound } =>
                period.phase === 'playoffs' && period.playoffRound !== null,
            )
            .map((period) => ({
              endAt: period.endAt,
              label: playoffLabel(period.playoffRound),
              playoffRound: period.playoffRound,
              scheduledGames: teamGames.filter((game) => {
                const scheduledAt = Date.parse(game.scheduledAt);
                return (
                  scheduledAt >= Date.parse(period.startAt) &&
                  scheduledAt <= Date.parse(period.endAt)
                );
              }).length,
              scoringPeriod: period.scoringPeriod,
              startAt: period.startAt,
              weight: playoffWeight(period.playoffRound),
              weekKey: `period-${period.scoringPeriod}`,
            })),
          regularSeasonScheduledGames: teamGames.length,
        },
      ] as const;
    }),
  );
};

export const planSeasonCalendarImport = (input: {
  readonly asOf: string;
  readonly games: ReadonlyArray<BallDontLieRegularSeasonGame>;
  readonly leagueId: string;
  readonly leagueInfo: unknown;
  readonly nbaSourceId: string;
  readonly seasonKey: string;
}): Effect.Effect<SeasonCalendarImportPlan, SeasonCalendarValidationError> =>
  Effect.try({
    try: () => {
      const startYear = seasonStartYear(input.seasonKey);
      const asOf = isoTimestamp(input.asOf, 'asOf');
      if (input.leagueId.trim() === '') throw new Error('leagueId is required');
      if (input.nbaSourceId.trim() === '') throw new Error('nbaSourceId is required');

      const leagueInfo = objectRecord(input.leagueInfo, 'Fantrax league info');
      const playoffs = objectRecord(leagueInfo['playoffs'], 'Fantrax playoffs');
      if (playoffs['used'] !== true) throw new Error('Fantrax playoffs are not configured');
      const firstPlayoffPeriod = integerField(playoffs, 'firstPlayoffPeriod');
      const lastRegularSeasonPeriod = integerField(playoffs, 'lastRegularSeasonPeriod');
      if (firstPlayoffPeriod <= lastRegularSeasonPeriod) {
        throw new Error('Fantrax playoff periods must follow the regular season');
      }

      const seenPeriods = new Set<number>();
      const fantasyPeriods = arrayField(leagueInfo, 'scoringPeriods')
        .map((value): Omit<SeasonCalendarPeriod, 'phase' | 'playoffRound'> => {
          const period = objectRecord(value, 'Fantrax scoring period');
          const scoringPeriod = integerField(period, 'number');
          if (seenPeriods.has(scoringPeriod)) {
            throw new Error(`Fantrax scoring period ${scoringPeriod} appears more than once`);
          }
          seenPeriods.add(scoringPeriod);
          const startAt = isoTimestamp(period['startDate'], `period ${scoringPeriod} startDate`);
          const endAt = isoTimestamp(period['endDate'], `period ${scoringPeriod} endDate`);
          if (Date.parse(endAt) < Date.parse(startAt)) {
            throw new Error(`Fantrax scoring period ${scoringPeriod} ends before it starts`);
          }
          return { endAt, scoringPeriod, startAt };
        })
        .sort((left, right) => left.scoringPeriod - right.scoringPeriod);
      if (fantasyPeriods.length === 0) throw new Error('Fantrax scoring periods are empty');
      fantasyPeriods.forEach((period, index) => {
        const previous = fantasyPeriods[index - 1];
        if (previous !== undefined) {
          if (period.scoringPeriod <= previous.scoringPeriod) {
            throw new Error('Fantrax scoring periods must be ordered');
          }
          if (Date.parse(period.startAt) <= Date.parse(previous.endAt)) {
            throw new Error('Fantrax scoring periods overlap');
          }
        }
      });
      if (!seenPeriods.has(firstPlayoffPeriod)) {
        throw new Error('Fantrax first playoff period is missing from scoring periods');
      }
      const finalScoringPeriod = fantasyPeriods.at(-1)!.scoringPeriod;
      const periods: SeasonCalendarPeriod[] = fantasyPeriods.map((period) => {
        const phase =
          period.scoringPeriod >= firstPlayoffPeriod
            ? ('playoffs' as const)
            : ('regular-season' as const);
        return {
          ...period,
          phase,
          playoffRound:
            phase === 'playoffs' ? playoffRound(period.scoringPeriod, finalScoringPeriod) : null,
        };
      });
      if (periods.filter((period) => period.playoffRound === 'final').length !== 1) {
        throw new Error('Fantrax calendar must contain exactly one final scoring period');
      }

      const seenGameIds = new Set<string>();
      const games = [...input.games]
        .map((game): SeasonCalendarGame => {
          if (game.seasonStartYear !== startYear) {
            throw new Error(`${game.providerGameId} belongs to NBA season ${game.seasonStartYear}`);
          }
          if (game.seasonType !== 'regular') {
            throw new Error(`${game.providerGameId} is not a regular-season game`);
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(game.date) || Number.isNaN(Date.parse(game.date))) {
            throw new Error(`${game.providerGameId} has an invalid NBA game date`);
          }
          if (Number.isNaN(Date.parse(game.scheduledAt))) {
            throw new Error(`${game.providerGameId} has an invalid scheduled timestamp`);
          }
          if (!nbaTeams.has(game.homeTeam) || !nbaTeams.has(game.awayTeam)) {
            throw new Error(`${game.providerGameId} has an unrecognized NBA team abbreviation`);
          }
          if (game.homeTeam === game.awayTeam) {
            throw new Error(`${game.providerGameId} repeats one NBA team`);
          }
          if (seenGameIds.has(game.providerGameId)) {
            throw new Error(`BALLDONTLIE game ${game.providerGameId} appears more than once`);
          }
          seenGameIds.add(game.providerGameId);
          return {
            ...game,
            awayTeam: game.awayTeam.toUpperCase(),
            homeTeam: game.homeTeam.toUpperCase(),
            scheduledAt: new Date(game.scheduledAt).toISOString(),
          };
        })
        .sort(
          (left, right) =>
            left.scheduledAt.localeCompare(right.scheduledAt) ||
            left.providerGameId.localeCompare(right.providerGameId),
        );
      if (games.length === 0) throw new Error('BALLDONTLIE returned no regular-season games');

      const schedulesByTeam = buildSchedulesByTeam(games, periods);
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            games: games.map(({ sourcePayload: _sourcePayload, ...game }) => game),
            leagueId: input.leagueId,
            nbaSourceId: input.nbaSourceId,
            periods,
            seasonKey: input.seasonKey,
          }),
        )
        .digest('hex');

      return {
        fantraxCapturedAt: asOf,
        fantasyPeriods: periods,
        fingerprint,
        games,
        leagueId: input.leagueId,
        nbaSourceId: input.nbaSourceId,
        schedulesByTeam,
        seasonKey: input.seasonKey,
        summary: {
          gameCount: games.length,
          playoffPeriodCount: periods.filter((period) => period.phase === 'playoffs').length,
          postponedGameCount: games.filter((game) => game.postponed).length,
          regularSeasonPeriodCount: periods.filter((period) => period.phase === 'regular-season')
            .length,
          teamCount: Object.keys(schedulesByTeam).length,
        },
      };
    },
    catch: (cause) =>
      new SeasonCalendarValidationError({
        message: 'Season calendar could not be validated',
        reason: cause instanceof Error ? cause.message : 'season calendar is invalid',
      }),
  });

export const collectSeasonCalendarImport = <NbaError, FantraxError>(
  input: Omit<Parameters<typeof planSeasonCalendarImport>[0], 'games' | 'leagueInfo'>,
  provider: SeasonCalendarSourceProvider<NbaError, FantraxError>,
): Effect.Effect<
  SeasonCalendarImportPlan,
  FantraxError | NbaError | SeasonCalendarValidationError
> =>
  Effect.gen(function* () {
    const startYear = yield* Effect.try({
      try: () => seasonStartYear(input.seasonKey),
      catch: (cause) =>
        new SeasonCalendarValidationError({
          message: 'Season calendar could not be validated',
          reason: cause instanceof Error ? cause.message : 'season is invalid',
        }),
    });
    const [games, leagueInfo] = yield* Effect.all([
      provider.nba.listRegularSeasonGames(startYear),
      provider.fantrax.getLeagueInfo(input.leagueId),
    ]);
    return yield* planSeasonCalendarImport({ ...input, games, leagueInfo });
  });

export const commitSeasonCalendarImport = <Error>(
  plan: SeasonCalendarImportPlan,
  committer: SeasonCalendarCommitter<Error>,
): Effect.Effect<SeasonCalendarCommitResult, Error> => committer.saveSeasonCalendar(plan);

export const makeFantraxLeagueInfoProvider = (config: {
  readonly cachePath: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly refresh?: boolean;
}): FantraxLeagueInfoProvider<FantraxLeagueInfoProviderError> => ({
  getLeagueInfo: (leagueId) =>
    Effect.tryPromise({
      try: async () => {
        if (!config.refresh) {
          try {
            return JSON.parse(await readFile(config.cachePath, 'utf8')) as unknown;
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
          }
        }
        const url = new URL('https://www.fantrax.com/fxea/general/getLeagueInfo');
        url.searchParams.set('leagueId', leagueId);
        const response = await (config.fetch ?? globalThis.fetch)(url, {
          headers: { accept: 'application/json', 'user-agent': 'fantasy-basketball-importer/0.1' },
        });
        if (!response.ok) {
          throw new FantraxLeagueInfoProviderError({
            message: `Fantrax league-info request failed with status ${response.status}`,
            reason: 'request failed',
            status: response.status,
          });
        }
        const payload = (await response.json()) as unknown;
        await mkdir(dirname(config.cachePath), { recursive: true });
        const temporaryPath = `${config.cachePath}.${process.pid}.tmp`;
        await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
        await rename(temporaryPath, config.cachePath);
        return payload;
      },
      catch: (cause) =>
        cause instanceof FantraxLeagueInfoProviderError
          ? cause
          : new FantraxLeagueInfoProviderError({
              message: 'Fantrax league info could not be loaded',
              reason: cause instanceof Error ? cause.message : 'provider request failed',
              status: null,
            }),
    }),
});

export const resolveSeasonCalendarSelection = (
  configuration: unknown,
  requestedSeason: string | null,
): { readonly leagueId: string; readonly seasonKey: string } => {
  const config = objectRecord(configuration, 'season config');
  const seasons = arrayField(config, 'seasons').map((value) =>
    objectRecord(value, 'configured season'),
  );
  const selected =
    requestedSeason === null
      ? seasons.filter((season) => season['status'] === 'live')
      : seasons.filter((season) => season['season'] === requestedSeason);
  if (selected.length === 0) {
    throw new Error(
      requestedSeason === null
        ? 'Season config does not contain a live league'
        : `Season config does not contain ${requestedSeason}`,
    );
  }
  if (selected.length > 1) throw new Error('Season config selects more than one league');
  const seasonKey = String(selected[0]!['season'] ?? '');
  seasonStartYear(seasonKey);
  const leagueId = String(selected[0]!['league_id'] ?? '').trim();
  if (leagueId === '') throw new Error(`${seasonKey} is missing its Fantrax league ID`);
  return { leagueId, seasonKey };
};
