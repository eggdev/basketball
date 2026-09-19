import { describe, expect, it } from 'vitest';

import { evaluateLiveBidBoard, markJevUnavailable, type LiveBidBoard } from './live-bid-board';

const board: LiveBidBoard = {
  baseBudgetCents: 20_000,
  players: [
    {
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
    },
    {
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
});
