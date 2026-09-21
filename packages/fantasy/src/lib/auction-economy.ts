export const LEAGUE_AUCTION_RULES = {
  bidIncrementCents: 100,
  minimumBidCents: 0,
  version: 'zero-dollar-v1',
  zeroBidAward: 'nominator-if-no-positive-bid',
} as const;

export interface LeagueAuctionPoolAllocation {
  readonly allocationsCents: ReadonlyArray<number>;
  readonly auctionPoolCents: number;
  readonly totalAllocatedCents: number;
  readonly unallocatedCents: number;
}

const positiveInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
};

/**
 * Converts non-negative player weights into the league's complete auction-dollar
 * economy. A roster spot has no mandatory cash reserve: eligible players at the
 * replacement line may clear for $0, while the full budget remains available to
 * players with positive value. Callers own ranking and replacement-level policy.
 */
export function allocateLeagueAuctionPool(input: {
  readonly baseBudgetCents: number;
  readonly eligiblePlayerCount: number;
  readonly teamCount: number;
  readonly weights: ReadonlyArray<number>;
}): LeagueAuctionPoolAllocation {
  positiveInteger(input.baseBudgetCents, 'base budget');
  positiveInteger(input.teamCount, 'team count');
  if (
    !Number.isSafeInteger(input.eligiblePlayerCount) ||
    input.eligiblePlayerCount < 0 ||
    input.eligiblePlayerCount > input.weights.length
  ) {
    throw new RangeError('eligible player count must fit the allocation weights');
  }
  input.weights.forEach((weight) => {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError('allocation weights must be non-negative finite numbers');
    }
  });

  const auctionPoolCents = input.baseBudgetCents * input.teamCount;
  if (!Number.isSafeInteger(auctionPoolCents)) {
    throw new RangeError('auction pool must be safe integer cents');
  }
  if (input.eligiblePlayerCount === 0) {
    return {
      allocationsCents: input.weights.map(() => 0),
      auctionPoolCents,
      totalAllocatedCents: 0,
      unallocatedCents: auctionPoolCents,
    };
  }

  const eligibleWeights = input.weights
    .slice(0, input.eligiblePlayerCount)
    .map((weight) => weight);
  const totalWeight = eligibleWeights.reduce((total, weight) => total + weight, 0);
  const normalizedWeights = input.weights.map((weight, index) =>
    index >= input.eligiblePlayerCount ? 0 : totalWeight === 0 ? 1 : weight,
  );
  const normalizedTotal = normalizedWeights.reduce((total, weight) => total + weight, 0);
  const exactAllocations = normalizedWeights.map((weight) =>
    normalizedTotal === 0 ? 0 : (weight / normalizedTotal) * auctionPoolCents,
  );
  const allocationsCents = exactAllocations.map(Math.floor);
  let remainingCents =
    auctionPoolCents - allocationsCents.reduce((total, cents) => total + cents, 0);
  const remainderOrder = exactAllocations
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .filter(({ index }) => index < input.eligiblePlayerCount)
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const allocation of remainderOrder) {
    if (remainingCents === 0) break;
    allocationsCents[allocation.index] = (allocationsCents[allocation.index] ?? 0) + 1;
    remainingCents -= 1;
  }

  const totalAllocatedCents = allocationsCents.reduce((total, cents) => total + cents, 0);
  return {
    allocationsCents,
    auctionPoolCents,
    totalAllocatedCents,
    unallocatedCents: auctionPoolCents - totalAllocatedCents,
  };
}
