import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { planFantraxLeaguePerformanceImport } from './fantrax-league-performance';

const team = (teamId: string, teamName: string, score: number) => ({
  gamesPlayed: 40,
  score,
  teamId,
  teamName,
});

describe('Fantrax league performance import', () => {
  it('normalizes standings, weekly scores, and a playoff champion', async () => {
    const plan = await Effect.runPromise(
      planFantraxLeaguePerformanceImport([
        {
          leagueId: 'league-1',
          leagueInfo: {
            leagueHistoryId: 'history-1',
            playoffs: {
              firstPlayoffPeriod: 2,
              lastRegularSeasonPeriod: 1,
              numPlayoffTeams: 2,
              used: true,
            },
            scoringPeriods: [
              {
                endDate: '2026-01-08T00:00:00.000Z',
                number: 1,
                startDate: '2026-01-01T00:00:00.000Z',
              },
              {
                endDate: '2026-01-15T00:00:00.000Z',
                number: 2,
                startDate: '2026-01-08T00:00:01.000Z',
              },
            ],
            scoringSystem: { type: 'HEAD_TO_HEAD_POINTS_BASED' },
            teamInfo: {
              away: { id: 'away', name: 'Away Team' },
              home: { id: 'home', name: 'Home Team' },
            },
          },
          matchupScores: [
            {
              matchups: [
                {
                  away: team('away', 'Away Team', 610),
                  categories: [],
                  home: team('home', 'Home Team', 590),
                },
              ],
              period: 1,
            },
            {
              matchups: [
                {
                  away: team('away', 'Away Team', 625),
                  categories: [],
                  home: team('home', 'Home Team', 640),
                },
              ],
              period: 2,
            },
          ],
          seasonKey: '2025-26',
          standings: [
            {
              gamesBack: 0,
              points: '1-0-0',
              rank: 1,
              teamId: 'away',
              teamName: 'Away Team',
              totalPointsFor: 610,
              winPercentage: 1,
            },
            {
              gamesBack: 1,
              points: '0-1-0',
              rank: 2,
              teamId: 'home',
              teamName: 'Home Team',
              totalPointsFor: 590,
              winPercentage: 0,
            },
          ],
        },
      ]),
    );

    expect(plan.summary).toEqual({
      championCount: 1,
      matchupCount: 2,
      regularSeasonMatchupCount: 1,
      seasonCount: 1,
      standingCount: 2,
    });
    expect(plan.standings.find((standing) => standing.sourceTeamId === 'home')).toMatchObject({
      postseasonFinish: 1,
      postseasonResult: 'champion',
    });
    expect(plan.standings.find((standing) => standing.sourceTeamId === 'away')).toMatchObject({
      postseasonFinish: 2,
      postseasonResult: 'runner-up',
    });
    expect(plan.matchups[0]).toMatchObject({
      phase: 'regular-season',
      playoffRound: null,
      winnerTeamId: 'away',
    });
    expect(plan.matchups[1]).toMatchObject({
      phase: 'playoffs',
      playoffRound: 'final',
      winnerTeamId: 'home',
    });
  });

  it('rejects incomplete regular-season matchup periods', async () => {
    const result = await Effect.runPromiseExit(
      planFantraxLeaguePerformanceImport([
        {
          leagueId: 'league-1',
          leagueInfo: {
            leagueHistoryId: 'history-1',
            playoffs: {
              firstPlayoffPeriod: 2,
              lastRegularSeasonPeriod: 1,
              numPlayoffTeams: 2,
              used: true,
            },
            scoringPeriods: [
              {
                endDate: '2026-01-08T00:00:00.000Z',
                number: 1,
                startDate: '2026-01-01T00:00:00.000Z',
              },
              {
                endDate: '2026-01-15T00:00:00.000Z',
                number: 2,
                startDate: '2026-01-08T00:00:01.000Z',
              },
            ],
            scoringSystem: { type: 'HEAD_TO_HEAD_POINTS_BASED' },
            teamInfo: {
              away: { id: 'away', name: 'Away Team' },
              extra: { id: 'extra', name: 'Extra Team' },
              home: { id: 'home', name: 'Home Team' },
              fourth: { id: 'fourth', name: 'Fourth Team' },
            },
          },
          matchupScores: [
            {
              matchups: [
                {
                  away: team('away', 'Away Team', 610),
                  categories: [],
                  home: team('home', 'Home Team', 590),
                },
              ],
              period: 1,
            },
            { matchups: [], period: 2 },
          ],
          seasonKey: '2025-26',
          standings: [],
        },
      ]),
    );

    expect(result._tag).toBe('Failure');
  });
});
