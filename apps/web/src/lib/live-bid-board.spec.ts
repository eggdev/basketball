import { describe, expect, it } from 'vitest';

import { evaluateLiveBidBoard, markJevUnavailable, type LiveBidBoard } from './live-bid-board';

const board: LiveBidBoard = {
  baseBudgetCents: 20_000,
  players: [
    {
      availabilityRate: 0.9,
      availabilityTier: 'durable',
      calibratedMarket: {
        expectedPriceCents: 6_000,
        fairHighCents: 7_000,
        fairLowCents: 5_000,
        modelId: 'market-production-50-v1',
        seasonsBacktested: 4,
      },
      fantasyPoints: 2_520,
      fantasyPointsPerGame: 35,
      historicalMarket: null,
      playerId: 'anchor',
      playerName: 'Anchor Guard',
      positions: ['PG'],
      rank: 1,
      target: null,
      teamAbbreviation: 'AAA',
      usableValue: null,
    },
    {
      availabilityRate: 0.8,
      availabilityTier: 'managed',
      calibratedMarket: null,
      fantasyPoints: 1_440,
      fantasyPointsPerGame: 20,
      historicalMarket: null,
      playerId: 'replacement',
      playerName: 'Replacement Guard',
      positions: ['SG'],
      rank: 2,
      target: null,
      teamAbbreviation: 'BBB',
      usableValue: null,
    },
  ],
  projection: {
    asOf: '2026-09-18T00:00:00.000Z',
    modelVersion: 'projection-v1',
    seasonKey: '2026-27',
    source: 'hashtag',
  },
  rosterSize: 1,
  teamCount: 2,
  usableContext: null,
};

describe('evaluateLiveBidBoard', () => {
  it('returns deterministic guardrails synchronously while Jev remains pending', () => {
    const result = evaluateLiveBidBoard(board, {
      currentPriceCents: 4_000,
      draftStateVersion: 'nomination-1',
      ownedPlayerIds: [],
      playerId: 'anchor',
      remainingBudgetCents: 20_000,
      remainingRosterSpots: 13,
    });

    expect(result.market).toMatchObject({
      expectedPriceCents: 6_000,
      fairHighCents: 7_000,
      fairLowCents: 5_000,
    });
    expect(result.action).toBe('keep-bidding');
    expect(result.judgment).toMatchObject({
      action: 'keep-bidding',
      source: 'pending',
    });
    expect(result.projection.modelVersion).toBe('projection-v1');
  });

  it('preserves the deterministic action when Jev is unavailable', () => {
    const pending = evaluateLiveBidBoard(board, {
      currentPriceCents: 4_000,
      draftStateVersion: 'nomination-1',
      ownedPlayerIds: [],
      playerId: 'anchor',
      remainingBudgetCents: 20_000,
      remainingRosterSpots: 13,
    });

    expect(markJevUnavailable(pending)).toMatchObject({
      action: 'keep-bidding',
      judgment: { action: 'keep-bidding', source: 'deterministic-fallback' },
    });
  });

  it('uses prepared roster-marginal utility without changing the market projection value', () => {
    const usableBoard: LiveBidBoard = {
      ...board,
      players: board.players.map((player) =>
        player.playerId === 'anchor'
          ? {
              ...player,
              usableValue: {
                diagnostics: {
                  capturedPlayoffWeightedPoints: 0,
                  congestionLoss: 0,
                  estimatedCapturedRegularSeasonPoints: 31.5,
                  expectedScheduledPoints: 31.5,
                  playoffWeightedGames: 0,
                  usablePoints: 31.5,
                },
                modelVersion: 'usable-lineup-v1',
                scheduleAsOf: '2026-09-19T00:00:00.000Z',
                valueCents: 10_000,
              },
            }
          : { ...player, positions: ['PG'] },
      ),
      usableContext: {
        lineupSlots: [
          {
            code: 'PG',
            eligiblePositions: ['PG'],
            label: 'Point Guard',
            maxActive: 1,
            minActive: 0,
          },
        ],
        modelVersion: 'usable-lineup-v1',
        scheduleAsOf: '2026-09-19T00:00:00.000Z',
        seasonCalendar: {
          asOf: '2026-09-19T00:00:00.000Z',
          fantasyPeriods: [
            {
              endAt: '2026-10-31T23:59:59.999Z',
              label: 'Regular season',
              phase: 'regular-season',
              scoringPeriod: 1,
              startAt: '2026-10-01T00:00:00.000Z',
              weight: 1,
            },
          ],
          fingerprint: 'calendar-1',
          games: [
            {
              awayTeam: 'BBB',
              date: '2026-10-20',
              homeTeam: 'AAA',
              postponed: false,
              scheduledAt: '2026-10-20T23:00:00.000Z',
            },
          ],
          snapshotId: 'snapshot-1',
        },
      },
    };

    const result = evaluateLiveBidBoard(usableBoard, {
      currentPriceCents: 4_000,
      draftStateVersion: 'nomination-1',
      ownedPlayerIds: ['replacement'],
      playerId: 'anchor',
      remainingBudgetCents: 20_000,
      remainingRosterSpots: 12,
    });

    expect(result.market.projectedValueCents).toBe(40_000);
    expect(result.market.usableValueCents).toBe(4_921);
    expect(result.personal).toMatchObject({
      maxBidCents: 4_900,
      valueBasis: 'roster-marginal-usable-lineup-v1',
    });
    expect(result.impact.rosterMarginalValue).toMatchObject({
      marginalRegularSeasonPoints: 15.5,
      modelVersion: 'usable-lineup-v1',
    });
  });

  it('keeps prepared-board evaluation below the 300 ms p95 target', () => {
    const calendar = {
      asOf: '2026-09-19T00:00:00.000Z',
      fantasyPeriods: [
        {
          endAt: '2027-01-31T23:59:59.999Z',
          label: 'Regular season',
          phase: 'regular-season' as const,
          scoringPeriod: 1,
          startAt: '2026-10-01T00:00:00.000Z',
          weight: 1,
        },
      ],
      fingerprint: 'calendar-benchmark',
      games: Array.from({ length: 82 }, (_, index) => {
        const scheduledAt = new Date(Date.UTC(2026, 9, 20 + index, 23));
        return {
          awayTeam: 'BBB',
          date: scheduledAt.toISOString().slice(0, 10),
          homeTeam: 'AAA',
          postponed: false,
          scheduledAt: scheduledAt.toISOString(),
        };
      }),
      snapshotId: 'snapshot-benchmark',
    };
    const benchmarkBoard: LiveBidBoard = {
      ...board,
      players: board.players.map((player) => ({
        ...player,
        positions: ['PG'],
        usableValue: {
          diagnostics: {
            capturedPlayoffWeightedPoints: 0,
            congestionLoss: 0,
            estimatedCapturedRegularSeasonPoints: player.fantasyPoints,
            expectedScheduledPoints: player.fantasyPoints,
            playoffWeightedGames: 0,
            usablePoints: player.fantasyPoints,
          },
          modelVersion: 'usable-lineup-v1',
          scheduleAsOf: calendar.asOf,
          valueCents: player.playerId === 'anchor' ? 10_000 : 100,
        },
      })),
      usableContext: {
        lineupSlots: [
          {
            code: 'PG',
            eligiblePositions: ['PG'],
            label: 'Point Guard',
            maxActive: 1,
            minActive: 0,
          },
        ],
        modelVersion: 'usable-lineup-v1',
        scheduleAsOf: calendar.asOf,
        seasonCalendar: calendar,
      },
    };
    const durations = Array.from({ length: 50 }, () => {
      const startedAt = performance.now();
      evaluateLiveBidBoard(benchmarkBoard, {
        currentPriceCents: 4_000,
        draftStateVersion: 'nomination-benchmark',
        ownedPlayerIds: ['replacement'],
        playerId: 'anchor',
        remainingBudgetCents: 20_000,
        remainingRosterSpots: 12,
      });
      return performance.now() - startedAt;
    }).sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1]!;

    expect(p95).toBeLessThan(300);
  });
});
