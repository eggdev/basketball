import { describe, expect, it } from 'vitest';

import { evaluateLiveBid, type LiveBidPlayer } from './live-bid';

const players: ReadonlyArray<LiveBidPlayer> = [
  {
    availabilityTier: 'durable',
    fantasyPoints: 2_520,
    fantasyPointsPerGame: 35,
    playerId: 'anchor',
    playerName: 'Anchor Guard',
    positions: ['PG', 'SG'],
    rank: 1,
  },
  {
    availabilityTier: 'managed',
    fantasyPoints: 1_840,
    fantasyPointsPerGame: 23,
    playerId: 'wing',
    playerName: 'Useful Wing',
    positions: ['SF', 'PF'],
    rank: 2,
  },
  {
    availabilityTier: 'fragile',
    fantasyPoints: 1_155,
    fantasyPointsPerGame: 21,
    playerId: 'center',
    playerName: 'Fragile Center',
    positions: ['C'],
    rank: 3,
  },
  {
    availabilityTier: 'durable',
    fantasyPoints: 1_558,
    fantasyPointsPerGame: 19,
    playerId: 'replacement',
    playerName: 'Replacement Player',
    positions: ['SG'],
    rank: 4,
  },
];

const evaluate = (overrides: Partial<Parameters<typeof evaluateLiveBid>[0]> = {}) =>
  evaluateLiveBid({
    baseBudgetCents: 20_000,
    currentPriceCents: 3_000,
    draftStateVersion: 'nomination-7:bid-30',
    historicalMarket: null,
    ownedPlayerIds: [],
    playerId: 'anchor',
    players,
    remainingBudgetCents: 20_000,
    remainingRosterSpots: 13,
    rosterSize: 2,
    target: null,
    teamCount: 2,
    ...overrides,
  });

describe('evaluateLiveBid', () => {
  it('allocates auction value from points above replacement', () => {
    const evaluation = evaluate();

    expect(evaluation.impact.replacementPointsPerGame).toBe(19);
    expect(evaluation.impact.marginalPointsPerGame).toBe(16);
    expect(evaluation.market.projectedValueCents).toBe(28_900);
    expect(evaluation.market.expectedPriceCents).toBe(28_900);
    expect(evaluation.market.priceSignal).toBe('under-value');
    expect(evaluation.action).toBe('keep-bidding');
  });

  it('keeps the legacy personal cap deterministic for empty and partially filled rosters', () => {
    const emptyRoster = evaluate({ remainingBudgetCents: 50_000 });
    const partiallyFilled = evaluate({
      ownedPlayerIds: ['anchor', 'replacement'],
      playerId: 'wing',
      remainingBudgetCents: 50_000,
    });

    expect(emptyRoster.personal).toMatchObject({
      maxBidCents: 29_800,
      maxBidSource: 'model',
    });
    expect(partiallyFilled.impact.rosterFit).toBe('fills-need');
    expect(partiallyFilled.personal.maxBidCents).toBe(7_500);
  });

  it('keeps observed league price separate from projection value', () => {
    const evaluation = evaluate({
      currentPriceCents: 4_000,
      historicalMarket: {
        expectedPriceCents: 5_000,
        maximumPriceCents: 7_000,
        minimumPriceCents: 3_500,
        seasonsDrafted: 4,
      },
    });

    expect(evaluation.market.projectedValueCents).toBe(28_900);
    expect(evaluation.market.expectedPriceCents).toBe(5_000);
    expect(evaluation.market.fairLowCents).toBe(4_200);
    expect(evaluation.market.fairHighCents).toBe(5_800);
    expect(evaluation.market.priceSignal).toBe('under-value');
  });

  it('uses roster-marginal utility for the personal cap without changing market value', () => {
    const evaluation = evaluate({
      remainingBudgetCents: 50_000,
      rosterMarginalValue: {
        candidateStandalonePlayoffWeightedPoints: 200,
        candidateStandaloneRegularSeasonPoints: 2_520,
        concentrationRisk: {
          level: 'high',
          sameTeamPlayerCount: 3,
          sameTeamRosterShare: 0.5,
        },
        capturedPlayoffWeightedPoints: 120,
        congestionLoss: 300,
        daysBenched: 30,
        filledSlotNeeds: ['PG'],
        marginalPlayoffWeightedPoints: 60,
        marginalRegularSeasonPoints: 500,
        modelVersion: 'usable-lineup-v1',
        playoffWeightedGames: 10,
        projectedPoints: 2_520,
        scheduleAsOf: '2026-09-19T00:00:00.000Z',
        usablePoints: 2_220,
        valueCents: 5_000,
      },
    });

    expect(evaluation.market.projectedValueCents).toBe(28_900);
    expect(evaluation.market.usableValueCents).toBe(5_000);
    expect(evaluation.personal).toMatchObject({
      maxBidCents: 5_000,
      valueBasis: 'roster-marginal-usable-lineup-v1',
    });
    expect(evaluation.action).toBe('keep-bidding');
  });

  it('prefers an empirically calibrated market range over the raw historical average', () => {
    const evaluation = evaluate({
      calibratedMarket: {
        expectedPriceCents: 6_200,
        fairHighCents: 7_400,
        fairLowCents: 5_000,
        modelId: 'market-production-75-v1',
        seasonsBacktested: 4,
      },
      historicalMarket: {
        expectedPriceCents: 5_000,
        maximumPriceCents: 7_000,
        minimumPriceCents: 3_500,
        seasonsDrafted: 4,
      },
    });

    expect(evaluation.market).toMatchObject({
      calibrationModelId: 'market-production-75-v1',
      expectedPriceCents: 6_200,
      fairHighCents: 7_400,
      fairLowCents: 5_000,
      historicalExpectedPriceCents: 5_000,
      priceSource: 'calibrated-model',
    });
  });

  it('honors a saved max bid and never exceeds remaining budget', () => {
    const evaluation = evaluate({
      currentPriceCents: 4_600,
      remainingBudgetCents: 4_500,
      target: { maxBidCents: 5_500, stance: 'target' },
    });

    expect(evaluation.personal).toMatchObject({
      maxBidCents: 4_500,
      maxBidSource: 'saved-target',
      targetStance: 'target',
    });
    expect(evaluation.action).toBe('stop');
  });

  it('stops on an avoid even when the bid is below value', () => {
    const evaluation = evaluate({
      currentPriceCents: 100,
      target: { maxBidCents: null, stance: 'avoid' },
    });

    expect(evaluation.market.priceSignal).toBe('under-value');
    expect(evaluation.action).toBe('stop');
    expect(evaluation.reasons.at(-1)).toContain('avoid');
  });

  it('downgrades fragile players to caution before their cap', () => {
    const evaluation = evaluate({
      currentPriceCents: 100,
      playerId: 'center',
    });

    expect(evaluation.personal.maxBidCents).toBeGreaterThan(100);
    expect(evaluation.action).toBe('caution');
  });
});
