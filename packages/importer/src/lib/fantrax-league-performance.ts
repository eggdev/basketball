import { createHash } from 'node:crypto';

import { Data, Effect } from 'effect';

export type LeaguePostseasonResult =
  | 'champion'
  | 'missed-playoffs'
  | 'playoff-qualifier'
  | 'quarterfinalist'
  | 'runner-up'
  | 'semifinalist';

export interface FantraxLeaguePerformanceSource {
  readonly leagueId: string;
  readonly leagueInfo: unknown;
  readonly matchupScores: ReadonlyArray<unknown>;
  readonly seasonKey: string;
  readonly standings: unknown;
}

export interface LeaguePerformanceStandingRecord {
  readonly gamesBack: number;
  readonly leagueId: string;
  readonly losses: number;
  readonly madePlayoffs: boolean;
  readonly playoffSeed: number | null;
  readonly pointsFor: number;
  readonly postseasonFinish: number | null;
  readonly postseasonResult: LeaguePostseasonResult;
  readonly rank: number;
  readonly record: string;
  readonly seasonKey: string;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly sourceTeamId: string;
  readonly teamName: string;
  readonly ties: number;
  readonly winPercentage: number;
  readonly wins: number;
}

export interface LeaguePerformanceMatchupRecord {
  readonly awayCategoryTotals: Readonly<Record<string, unknown>>;
  readonly awayGamesPlayed: number;
  readonly awayScore: number;
  readonly awayTeamId: string;
  readonly awayTeamName: string;
  readonly homeCategoryTotals: Readonly<Record<string, unknown>>;
  readonly homeGamesPlayed: number;
  readonly homeScore: number;
  readonly homeTeamId: string;
  readonly homeTeamName: string;
  readonly isTie: boolean;
  readonly leagueId: string;
  readonly periodEndAt: string;
  readonly periodStartAt: string;
  readonly phase: 'playoffs' | 'regular-season';
  readonly playoffRound: 'final' | 'quarterfinal' | 'semifinal' | null;
  readonly scoringPeriod: number;
  readonly seasonKey: string;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly winnerTeamId: string | null;
}

export interface LeaguePerformanceSeasonRecord {
  readonly finalScoringPeriod: number;
  readonly firstPlayoffPeriod: number | null;
  readonly lastRegularSeasonPeriod: number;
  readonly leagueHistoryId: string;
  readonly leagueId: string;
  readonly playoffTeamCount: number;
  readonly scoringType: string;
  readonly seasonKey: string;
}

export interface FantraxLeaguePerformanceImportPlan {
  readonly fingerprint: string;
  readonly matchups: ReadonlyArray<LeaguePerformanceMatchupRecord>;
  readonly seasons: ReadonlyArray<LeaguePerformanceSeasonRecord>;
  readonly source: 'fantrax-league-performance';
  readonly standings: ReadonlyArray<LeaguePerformanceStandingRecord>;
  readonly summary: {
    readonly championCount: number;
    readonly matchupCount: number;
    readonly regularSeasonMatchupCount: number;
    readonly seasonCount: number;
    readonly standingCount: number;
  };
}

export interface FantraxLeaguePerformanceImportResult {
  readonly alreadyImported: boolean;
  readonly ingestionRunId: string;
  readonly matchupCount: number;
  readonly seasonCount: number;
  readonly standingCount: number;
}

export interface FantraxLeaguePerformanceCommitter<Error> {
  readonly saveLeaguePerformance: (
    batch: FantraxLeaguePerformanceImportPlan,
  ) => Effect.Effect<FantraxLeaguePerformanceImportResult, Error>;
}

export class FantraxLeaguePerformanceValidationError extends Data.TaggedError(
  'FantraxLeaguePerformanceValidationError',
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

const numberField = (
  row: Readonly<Record<string, unknown>>,
  key: string,
  fallback?: number,
): number => {
  const value = row[key];
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${key} must be a finite number`);
  return parsed;
};

const integerField = (
  row: Readonly<Record<string, unknown>>,
  key: string,
  fallback?: number,
): number => {
  const value = numberField(row, key, fallback);
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
};

const isoTimestamp = (value: string, label: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a timestamp`);
  return parsed.toISOString();
};

const parseRecord = (value: string): { losses: number; ties: number; wins: number } => {
  const match = /^(\d+)-(\d+)-(\d+)$/.exec(value);
  if (match === null) throw new Error(`standing record ${value} must use W-L-T format`);
  return { wins: Number(match[1]), losses: Number(match[2]), ties: Number(match[3]) };
};

const parseCategoryTotals = (
  matchup: Readonly<Record<string, unknown>>,
  side: 'away' | 'home',
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    arrayField(matchup, 'categories').map((value) => {
      const category = objectRecord(value, 'matchup category');
      const shortName = stringField(category, 'shortName');
      const total = objectRecord(category[side], `${shortName} ${side} total`);
      return [
        shortName,
        {
          display: typeof total['display'] === 'string' ? total['display'] : null,
          points: total['points'] === undefined ? null : numberField(total, 'points'),
          value: total['value'] === undefined ? null : numberField(total, 'value'),
        },
      ];
    }),
  );

const playoffRoundForPeriod = (
  scoringPeriod: number,
  finalScoringPeriod: number,
): LeaguePerformanceMatchupRecord['playoffRound'] => {
  const distanceFromFinal = finalScoringPeriod - scoringPeriod;
  if (distanceFromFinal === 0) return 'final';
  if (distanceFromFinal === 1) return 'semifinal';
  return 'quarterfinal';
};

const resultFinish = (result: LeaguePostseasonResult): number | null => {
  if (result === 'champion') return 1;
  if (result === 'runner-up') return 2;
  if (result === 'semifinalist') return 3;
  if (result === 'quarterfinalist') return 5;
  return null;
};

export const planFantraxLeaguePerformanceImport = (
  sources: ReadonlyArray<FantraxLeaguePerformanceSource>,
): Effect.Effect<FantraxLeaguePerformanceImportPlan, FantraxLeaguePerformanceValidationError> =>
  Effect.try({
    try: () => {
      if (sources.length === 0) throw new Error('at least one historical season is required');
      const seasonKeys = new Set<string>();
      const leagueIds = new Set<string>();
      const seasons: LeaguePerformanceSeasonRecord[] = [];
      const allStandings: LeaguePerformanceStandingRecord[] = [];
      const allMatchups: LeaguePerformanceMatchupRecord[] = [];

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
        const scoringSystem = objectRecord(
          leagueInfo['scoringSystem'],
          `${source.seasonKey} scoring system`,
        );
        const scoringType = stringField(scoringSystem, 'type');
        const playoffSettings = objectRecord(
          leagueInfo['playoffs'],
          `${source.seasonKey} playoffs`,
        );
        const playoffsUsed = playoffSettings['used'] === true;
        const lastRegularSeasonPeriod = integerField(playoffSettings, 'lastRegularSeasonPeriod');
        const firstPlayoffPeriod = playoffsUsed
          ? integerField(playoffSettings, 'firstPlayoffPeriod')
          : null;
        const playoffTeamCount = playoffsUsed
          ? integerField(playoffSettings, 'numPlayoffTeams')
          : 0;
        const periodByNumber = new Map(
          arrayField(leagueInfo, 'scoringPeriods').map((value) => {
            const period = objectRecord(value, `${source.seasonKey} scoring period`);
            const number = integerField(period, 'number');
            return [
              number,
              {
                endAt: isoTimestamp(stringField(period, 'endDate'), 'period endDate'),
                startAt: isoTimestamp(stringField(period, 'startDate'), 'period startDate'),
              },
            ] as const;
          }),
        );
        const finalScoringPeriod = Math.max(...periodByNumber.keys());
        if (source.matchupScores.length !== periodByNumber.size) {
          throw new Error(
            `${source.seasonKey} has ${source.matchupScores.length} matchup payloads for ${periodByNumber.size} scoring periods`,
          );
        }

        const seasonMatchups: LeaguePerformanceMatchupRecord[] = [];
        const seenPeriods = new Set<number>();
        for (const payload of source.matchupScores) {
          const response = objectRecord(payload, `${source.seasonKey} matchup response`);
          const scoringPeriod = integerField(response, 'period');
          if (seenPeriods.has(scoringPeriod)) {
            throw new Error(`${source.seasonKey} repeats matchup period ${scoringPeriod}`);
          }
          seenPeriods.add(scoringPeriod);
          const period = periodByNumber.get(scoringPeriod);
          if (period === undefined) {
            throw new Error(`${source.seasonKey} has unknown matchup period ${scoringPeriod}`);
          }
          const phase =
            firstPlayoffPeriod !== null && scoringPeriod >= firstPlayoffPeriod
              ? ('playoffs' as const)
              : ('regular-season' as const);
          const teamsSeen = new Set<string>();
          for (const matchupValue of arrayField(response, 'matchups')) {
            const matchup = objectRecord(matchupValue, `${source.seasonKey} matchup`);
            const away = objectRecord(matchup['away'], 'away team');
            const home = objectRecord(matchup['home'], 'home team');
            const awayTeamId = stringField(away, 'teamId');
            const homeTeamId = stringField(home, 'teamId');
            if (!sourceTeamIds.has(awayTeamId) || !sourceTeamIds.has(homeTeamId)) {
              throw new Error(
                `${source.seasonKey} period ${scoringPeriod} references an unknown team`,
              );
            }
            if (awayTeamId === homeTeamId) {
              throw new Error(`${source.seasonKey} period ${scoringPeriod} repeats one team`);
            }
            if (teamsSeen.has(awayTeamId) || teamsSeen.has(homeTeamId)) {
              throw new Error(`${source.seasonKey} period ${scoringPeriod} schedules a team twice`);
            }
            teamsSeen.add(awayTeamId);
            teamsSeen.add(homeTeamId);
            const awayScore = numberField(away, 'score');
            const homeScore = numberField(home, 'score');
            const isTie = awayScore === homeScore;
            seasonMatchups.push({
              awayCategoryTotals: parseCategoryTotals(matchup, 'away'),
              awayGamesPlayed: integerField(away, 'gamesPlayed', 0),
              awayScore,
              awayTeamId,
              awayTeamName: stringField(away, 'teamName'),
              homeCategoryTotals: parseCategoryTotals(matchup, 'home'),
              homeGamesPlayed: integerField(home, 'gamesPlayed', 0),
              homeScore,
              homeTeamId,
              homeTeamName: stringField(home, 'teamName'),
              isTie,
              leagueId: source.leagueId,
              periodEndAt: period.endAt,
              periodStartAt: period.startAt,
              phase,
              playoffRound:
                phase === 'playoffs'
                  ? playoffRoundForPeriod(scoringPeriod, finalScoringPeriod)
                  : null,
              scoringPeriod,
              seasonKey: source.seasonKey,
              sourcePayload: matchup,
              winnerTeamId: isTie ? null : awayScore > homeScore ? awayTeamId : homeTeamId,
            });
          }
          if (phase === 'regular-season' && teamsSeen.size !== sourceTeamIds.size) {
            throw new Error(
              `${source.seasonKey} period ${scoringPeriod} covers ${teamsSeen.size}/${sourceTeamIds.size} teams`,
            );
          }
        }

        const standingsPayload = source.standings;
        if (!Array.isArray(standingsPayload)) {
          throw new Error(`${source.seasonKey} standings must be an array`);
        }
        if (standingsPayload.length !== sourceTeamIds.size) {
          throw new Error(
            `${source.seasonKey} has ${standingsPayload.length}/${sourceTeamIds.size} standings rows`,
          );
        }

        const postseasonByTeam = new Map<string, LeaguePostseasonResult>();
        const regularSeasonScoreByTeam = new Map<string, number>();
        for (const matchup of seasonMatchups.filter(
          (candidate) => candidate.phase === 'regular-season',
        )) {
          regularSeasonScoreByTeam.set(
            matchup.awayTeamId,
            (regularSeasonScoreByTeam.get(matchup.awayTeamId) ?? 0) + matchup.awayScore,
          );
          regularSeasonScoreByTeam.set(
            matchup.homeTeamId,
            (regularSeasonScoreByTeam.get(matchup.homeTeamId) ?? 0) + matchup.homeScore,
          );
        }
        for (const matchup of seasonMatchups
          .filter((candidate) => candidate.phase === 'playoffs')
          .sort((left, right) => left.scoringPeriod - right.scoringPeriod)) {
          if (matchup.winnerTeamId === null) continue;
          const loserTeamId =
            matchup.winnerTeamId === matchup.awayTeamId ? matchup.homeTeamId : matchup.awayTeamId;
          if (matchup.playoffRound === 'final') {
            postseasonByTeam.set(matchup.winnerTeamId, 'champion');
            postseasonByTeam.set(loserTeamId, 'runner-up');
          } else if (matchup.playoffRound === 'semifinal') {
            postseasonByTeam.set(loserTeamId, 'semifinalist');
          } else {
            postseasonByTeam.set(loserTeamId, 'quarterfinalist');
          }
        }

        const seenStandingTeams = new Set<string>();
        const standings = standingsPayload.map((value): LeaguePerformanceStandingRecord => {
          const row = objectRecord(value, `${source.seasonKey} standing`);
          const sourceTeamId = stringField(row, 'teamId');
          if (!sourceTeamIds.has(sourceTeamId)) {
            throw new Error(`${source.seasonKey} standings reference unknown team ${sourceTeamId}`);
          }
          if (seenStandingTeams.has(sourceTeamId)) {
            throw new Error(`${source.seasonKey} repeats standing team ${sourceTeamId}`);
          }
          seenStandingTeams.add(sourceTeamId);
          const rank = integerField(row, 'rank');
          const record = stringField(row, 'points');
          const { wins, losses, ties } = parseRecord(record);
          const madePlayoffs = playoffsUsed && rank <= playoffTeamCount;
          const postseasonResult = madePlayoffs
            ? (postseasonByTeam.get(sourceTeamId) ?? 'playoff-qualifier')
            : 'missed-playoffs';
          return {
            gamesBack: numberField(row, 'gamesBack'),
            leagueId: source.leagueId,
            losses,
            madePlayoffs,
            playoffSeed: madePlayoffs ? rank : null,
            pointsFor:
              row['totalPointsFor'] === undefined
                ? (regularSeasonScoreByTeam.get(sourceTeamId) ?? 0)
                : numberField(row, 'totalPointsFor'),
            postseasonFinish: resultFinish(postseasonResult),
            postseasonResult,
            rank,
            record,
            seasonKey: source.seasonKey,
            sourcePayload: row,
            sourceTeamId,
            teamName: stringField(row, 'teamName'),
            ties,
            winPercentage: numberField(row, 'winPercentage'),
            wins,
          };
        });

        const championCount = standings.filter(
          (standing) => standing.postseasonResult === 'champion',
        ).length;
        if (playoffsUsed && championCount !== 1) {
          throw new Error(`${source.seasonKey} must resolve exactly one playoff champion`);
        }

        seasons.push({
          finalScoringPeriod,
          firstPlayoffPeriod,
          lastRegularSeasonPeriod,
          leagueHistoryId,
          leagueId: source.leagueId,
          playoffTeamCount,
          scoringType,
          seasonKey: source.seasonKey,
        });
        allStandings.push(...standings);
        allMatchups.push(...seasonMatchups);
      }

      seasons.sort((left, right) => left.seasonKey.localeCompare(right.seasonKey));
      allStandings.sort(
        (left, right) => left.seasonKey.localeCompare(right.seasonKey) || left.rank - right.rank,
      );
      allMatchups.sort(
        (left, right) =>
          left.seasonKey.localeCompare(right.seasonKey) ||
          left.scoringPeriod - right.scoringPeriod ||
          left.awayTeamId.localeCompare(right.awayTeamId),
      );
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            matchups: allMatchups,
            seasons,
            source: 'fantrax-league-performance',
            standings: allStandings,
          }),
        )
        .digest('hex');

      return {
        fingerprint,
        matchups: allMatchups,
        seasons,
        source: 'fantrax-league-performance' as const,
        standings: allStandings,
        summary: {
          championCount: allStandings.filter((standing) => standing.postseasonResult === 'champion')
            .length,
          matchupCount: allMatchups.length,
          regularSeasonMatchupCount: allMatchups.filter(
            (matchup) => matchup.phase === 'regular-season',
          ).length,
          seasonCount: seasons.length,
          standingCount: allStandings.length,
        },
      };
    },
    catch: (cause) => {
      const reason =
        cause instanceof Error ? cause.message : 'Fantrax league performance is invalid';
      return new FantraxLeaguePerformanceValidationError({
        message: `Fantrax league performance could not be validated: ${reason}`,
        reason,
      });
    },
  });

export const commitFantraxLeaguePerformanceImport = <Error>(
  plan: FantraxLeaguePerformanceImportPlan,
  committer: FantraxLeaguePerformanceCommitter<Error>,
): Effect.Effect<FantraxLeaguePerformanceImportResult, Error> =>
  committer.saveLeaguePerformance(plan);
