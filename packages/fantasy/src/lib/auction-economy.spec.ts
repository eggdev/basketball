import { describe, expect, it } from 'vitest';

import { allocateLeagueAuctionPool, LEAGUE_AUCTION_RULES } from './auction-economy';

describe('league auction economy', () => {
  it('records the zero-dollar floor and uncontested award rule', () => {
    expect(LEAGUE_AUCTION_RULES).toEqual({
      bidIncrementCents: 100,
      minimumBidCents: 0,
      version: 'zero-dollar-v1',
      zeroBidAward: 'nominator-if-no-positive-bid',
    });
  });

  it('allocates the complete budget without reserving money for roster spots', () => {
    const result = allocateLeagueAuctionPool({
      baseBudgetCents: 10_000,
      eligiblePlayerCount: 3,
      teamCount: 2,
      weights: [3, 1, 0, 100],
    });

    expect(result).toEqual({
      allocationsCents: [15_000, 5_000, 0, 0],
      auctionPoolCents: 20_000,
      totalAllocatedCents: 20_000,
      unallocatedCents: 0,
    });
  });

  it('conserves odd-cent pools with deterministic largest remainders', () => {
    const result = allocateLeagueAuctionPool({
      baseBudgetCents: 20_001,
      eligiblePlayerCount: 3,
      teamCount: 1,
      weights: [1, 1, 1],
    });

    expect(result.allocationsCents).toEqual([6_667, 6_667, 6_667]);
    expect(result.totalAllocatedCents).toBe(20_001);
  });

  it('splits the pool evenly when every eligible player is at replacement value', () => {
    const result = allocateLeagueAuctionPool({
      baseBudgetCents: 200,
      eligiblePlayerCount: 2,
      teamCount: 1,
      weights: [0, 0, 5],
    });

    expect(result.allocationsCents).toEqual([100, 100, 0]);
  });
});
