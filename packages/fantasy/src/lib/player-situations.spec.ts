import { describe, expect, it } from 'vitest';

import { buildPlayerSituationBoard, type PlayerSituationProjection } from './player-situations';

const projection = (
  overrides: Partial<PlayerSituationProjection> & Pick<PlayerSituationProjection, 'playerId'>,
): PlayerSituationProjection => ({
  availability: { expectedGames: 72 },
  fantasyPointsPerGame: 30,
  playerName: overrides.playerId,
  positions: ['PG'],
  statsPerGame: {
    assists: 7,
    fieldGoalsAttempted: 16,
    freeThrowsAttempted: 4,
    turnovers: 3,
  },
  teamAbbreviation: 'NYK',
  ...overrides,
});

describe('player situation board', () => {
  it('separates reviewed movement type from an inferred team change', () => {
    const board = buildPlayerSituationBoard({
      asOf: '2026-09-21T00:00:00.000Z',
      contexts: [
        {
          injury: null,
          movement: {
            effectiveDate: '2026-07-06',
            fromTeamAbbreviation: 'BOS',
            note: 'Acquired during the offseason.',
            sourceUrl: 'https://example.com/transaction',
            toTeamAbbreviation: 'NYK',
            type: 'trade',
          },
          playerId: 'traded',
          role: null,
        },
      ],
      productionHistory: [
        {
          gamesPlayed: 70,
          playerId: 'traded',
          seasonKey: '2025-26',
          stats: { ast: 350, fga: 840, fta: 210, turnover: 140 },
          teamStints: [{ gamesPlayed: 70, teamAbbreviation: 'BOS' }],
        },
        {
          gamesPlayed: 70,
          playerId: 'unverified',
          seasonKey: '2025-26',
          stats: { ast: 350, fga: 840, fta: 210, turnover: 140 },
          teamStints: [{ gamesPlayed: 70, teamAbbreviation: 'MIA' }],
        },
      ],
      projections: [projection({ playerId: 'traded' }), projection({ playerId: 'unverified' })],
      seasonKey: '2026-27',
    });

    expect(board.players[0]!.movement).toMatchObject({ isNewTeam: true, type: 'trade' });
    expect(board.players[1]!.movement).toMatchObject({ isNewTeam: true, type: 'unknown' });
    expect(board.players[1]!.signals[0]!.detail).toContain('transaction type is unverified');
  });

  it('compares against the team where the player finished the prior season', () => {
    const board = buildPlayerSituationBoard({
      asOf: '2026-09-21T00:00:00.000Z',
      productionHistory: [
        {
          gamesPlayed: 70,
          playerId: 'midseason-trade',
          seasonKey: '2025-26',
          stats: { ast: 350, fga: 840, fta: 210, turnover: 140 },
          teamStints: [
            { gamesPlayed: 50, lastGameDate: '2026-01-15', teamAbbreviation: 'BOS' },
            { gamesPlayed: 20, lastGameDate: '2026-04-12', teamAbbreviation: 'NYK' },
          ],
        },
      ],
      projections: [projection({ playerId: 'midseason-trade' })],
      seasonKey: '2026-27',
    });

    expect(board.players[0]!.previousTeamAbbreviation).toBe('NYK');
    expect(board.players[0]!.movement).toMatchObject({ isNewTeam: false, type: 'returning' });
  });

  it('uses a reviewed current-team movement when prior production is unavailable', () => {
    const board = buildPlayerSituationBoard({
      asOf: '2026-09-21T00:00:00.000Z',
      contexts: [
        {
          injury: null,
          movement: {
            effectiveDate: '2026-07-01',
            fromTeamAbbreviation: 'DAL',
            note: 'Signed during the offseason.',
            sourceUrl: 'https://example.com/signing',
            toTeamAbbreviation: 'NYK',
            type: 'free-agent-signing',
          },
          playerId: 'new-signing',
          role: null,
        },
      ],
      productionHistory: [],
      projections: [projection({ playerId: 'new-signing' })],
      seasonKey: '2026-27',
    });

    expect(board.players[0]!.movement).toMatchObject({
      isNewTeam: true,
      sourceUrl: 'https://example.com/signing',
      type: 'free-agent-signing',
    });
  });

  it('does not call a limited season an injury without sourced evidence', () => {
    const board = buildPlayerSituationBoard({
      asOf: '2026-09-21T00:00:00.000Z',
      productionHistory: [
        {
          gamesPlayed: 32,
          playerId: 'limited',
          seasonKey: '2025-26',
          stats: { ast: 128, fga: 384, fta: 96, turnover: 64 },
          teamStints: [{ gamesPlayed: 32, teamAbbreviation: 'NYK' }],
        },
      ],
      projections: [projection({ playerId: 'limited' })],
      seasonKey: '2026-27',
    });

    expect(board.players[0]!.injury).toBeNull();
    expect(board.players[0]!.signals).toContainEqual(
      expect.objectContaining({
        detail: 'Played 32 games; the cause is not attributed without injury evidence.',
        kind: 'availability',
      }),
    );
  });

  it('uses reviewed opportunity direction and identifies projected competition', () => {
    const board = buildPlayerSituationBoard({
      asOf: '2026-09-21T00:00:00.000Z',
      contexts: [
        {
          injury: null,
          movement: null,
          playerId: 'lead',
          role: {
            depthRole: 'starter',
            note: 'Expected to take over the primary creation role.',
            opportunityDirection: 'up',
            sourceUrl: 'https://example.com/depth',
          },
        },
      ],
      productionHistory: [],
      projections: [
        projection({ playerId: 'lead', playerName: 'Lead Guard' }),
        projection({
          fantasyPointsPerGame: 25,
          playerId: 'backup',
          playerName: 'Backup Guard',
          positions: ['PG', 'SG'],
        }),
        projection({
          playerId: 'center',
          playerName: 'Center',
          positions: ['C'],
        }),
      ],
      seasonKey: '2026-27',
    });

    expect(board.players[0]!.opportunity).toMatchObject({ direction: 'up', source: 'curated' });
    expect(board.players[0]!.competition.map((player) => player.playerName)).toEqual([
      'Backup Guard',
    ]);
  });

  it('normalizes usage, dribbles, touches, and hockey assists from advanced metrics', () => {
    const board = buildPlayerSituationBoard({
      advancedHistory: [
        {
          metrics: {
            'general.advanced.usg_pct': 0.281,
            'tracking.passing.potential_ast': 11.4,
            'tracking.passing.secondary_ast': 0.8,
            'tracking.possessions.avg_drib_per_touch': 3.7,
            'tracking.possessions.time_of_poss': 5.2,
            'tracking.possessions.touches': 78.4,
          },
          playerId: 'advanced',
          seasonKey: '2025-26',
        },
      ],
      asOf: '2026-09-21T00:00:00.000Z',
      productionHistory: [],
      projections: [projection({ playerId: 'advanced' })],
      seasonKey: '2026-27',
    });

    expect(board.players[0]!.advanced).toEqual({
      dribblesPerTouch: 3.7,
      potentialAssistsPerGame: 11.4,
      secondaryAssistsPerGame: 0.8,
      timeOfPossessionMinutes: 5.2,
      touchesPerGame: 78.4,
      usagePercentage: 0.281,
    });
  });

  it('keeps opportunity uncertain when a projection omits the required box-score inputs', () => {
    const board = buildPlayerSituationBoard({
      asOf: '2026-09-21T00:00:00.000Z',
      productionHistory: [
        {
          gamesPlayed: 70,
          playerId: 'missing-projection-stats',
          seasonKey: '2025-26',
          stats: { ast: 350, fga: 840, fta: 210, turnover: 140 },
          teamStints: [{ gamesPlayed: 70, teamAbbreviation: 'NYK' }],
        },
      ],
      projections: [projection({ playerId: 'missing-projection-stats', statsPerGame: {} })],
      seasonKey: '2026-27',
    });

    expect(board.players[0]!.opportunity).toMatchObject({
      currentBoxScoreProxy: null,
      deltaPercent: null,
      direction: 'uncertain',
      source: 'insufficient-data',
    });
  });
});
