import { describe, expect, it } from 'vitest';

import { currentLeagueScoring } from './scoring';
import { buildProjectionRun, type PlayerStatProjection } from './projections';

const jokic = (overrides: Partial<PlayerStatProjection> = {}): PlayerStatProjection => ({
  expectedGames: 72,
  playerId: 'jokic',
  playerName: 'Nikola Jokic',
  positions: ['C'],
  schedule: {
    fantasyPlayoffWeeks: [
      { label: 'Semifinal', scheduledGames: 3, weight: 1, weekKey: 'semifinal' },
      { label: 'Championship', scheduledGames: 4, weight: 1.5, weekKey: 'championship' },
    ],
    regularSeasonScheduledGames: 82,
  },
  statsPerGame: {
    assists: 10.4,
    blocks: 0.7,
    fieldGoalsAttempted: 18.3,
    fieldGoalsMade: 10.5,
    freeThrowsAttempted: 6.8,
    freeThrowsMade: 5.6,
    points: 28.4,
    rebounds: 12.7,
    steals: 1.6,
    threePointersMade: 1.8,
    turnovers: 3.5,
  },
  teamAbbreviation: 'DEN',
  ...overrides,
});

describe('buildProjectionRun', () => {
  it('projects stacked bonuses from recency-weighted historical rates', () => {
    const run = buildProjectionRun({
      history: [
        {
          doubleDoubles: 50,
          gamesPlayed: 70,
          playerId: 'jokic',
          seasonKey: '2024-25',
          tripleDoubles: 30,
        },
        {
          doubleDoubles: 60,
          gamesPlayed: 75,
          playerId: 'jokic',
          seasonKey: '2025-26',
          tripleDoubles: 35,
        },
      ],
      players: [jokic()],
      rules: currentLeagueScoring,
      settings: {
        doubleDoublePriorGames: 0,
        recencyDecay: 0.5,
        tripleDoublePriorGames: 0,
      },
    });

    const projection = run.players[0]!;
    expect(projection.bonuses.doubleDoubleRate).toBeCloseTo(85 / 110, 4);
    expect(projection.bonuses.tripleDoubleRate).toBeCloseTo(50 / 110, 4);
    expect(projection.bonuses.expectedDoubleDoubles).toBeCloseTo(55.636, 3);
    expect(projection.bonuses.expectedTripleDoubles).toBeCloseTo(32.727, 3);
    expect(projection.scoringComponents.doubleDoubles).toBeCloseTo(111.273, 3);
    expect(projection.scoringComponents.tripleDoubles).toBeCloseTo(163.636, 3);
  });

  it('uses explicit projected bonus rates instead of historical estimates', () => {
    const run = buildProjectionRun({
      history: [
        {
          doubleDoubles: 1,
          gamesPlayed: 70,
          playerId: 'jokic',
          seasonKey: '2025-26',
          tripleDoubles: 0,
        },
      ],
      players: [
        jokic({
          projectedBonusRates: {
            doubleDoubleRate: 0.8,
            tripleDoubleRate: 0.5,
          },
        }),
      ],
      rules: currentLeagueScoring,
    });

    const projection = run.players[0]!;
    expect(projection.bonuses).toEqual({
      doubleDoubleRate: 0.8,
      expectedDoubleDoubles: 57.6,
      expectedTripleDoubles: 36,
      tripleDoubleRate: 0.5,
    });
    expect(projection.scoringComponents.doubleDoubles).toBe(115.2);
    expect(projection.scoringComponents.tripleDoubles).toBe(180);
  });

  it('makes availability and championship-week schedule value explicit', () => {
    const run = buildProjectionRun({
      history: [],
      players: [jokic()],
      rules: currentLeagueScoring,
    });

    const projection = run.players[0]!;
    expect(projection.availability).toEqual({
      expectedGames: 72,
      expectedGamesMissed: 10,
      rate: 0.878,
      scheduledGames: 82,
      tier: 'managed',
    });
    expect(projection.schedule?.fantasyPlayoffWeeks).toMatchObject([
      { expectedActiveGames: 2.634, scheduledGames: 3, weekKey: 'semifinal' },
      { expectedActiveGames: 3.512, scheduledGames: 4, weekKey: 'championship' },
    ]);
    expect(projection.schedule?.weightedExpectedGames).toBeCloseTo(7.902, 3);
  });

  it('shrinks rare bonus rates toward the population prior', () => {
    const run = buildProjectionRun({
      history: [
        {
          doubleDoubles: 10,
          gamesPlayed: 100,
          playerId: 'veteran',
          seasonKey: '2025-26',
          tripleDoubles: 1,
        },
      ],
      players: [jokic({ playerId: 'rookie', playerName: 'Rookie Center' })],
      rules: currentLeagueScoring,
    });

    expect(run.bonusPriors).toEqual({ doubleDoubleRate: 0.1, tripleDoubleRate: 0.01 });
    expect(run.players[0]?.bonuses.doubleDoubleRate).toBe(0.1);
    expect(run.players[0]?.bonuses.tripleDoubleRate).toBe(0.01);
  });

  it('rejects impossible games-played projections', () => {
    expect(() =>
      buildProjectionRun({
        history: [],
        players: [jokic({ expectedGames: 83 })],
        rules: currentLeagueScoring,
      }),
    ).toThrow('expected games exceeds scheduled games');
  });
});
