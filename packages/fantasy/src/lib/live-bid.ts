import type { AvailabilityTier } from './projections';
import { allocateAuctionValues } from './valuation-lab';

export type LiveBidPriceSignal = 'at-value' | 'over-value' | 'under-value';
export type LiveBidAction = 'caution' | 'keep-bidding' | 'review' | 'stop';
export type LiveBidRosterFit = 'fills-need' | 'neutral' | 'redundant';

export interface LiveBidPlayer {
  readonly availabilityTier: AvailabilityTier;
  readonly fantasyPoints: number;
  readonly fantasyPointsPerGame: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly positions: ReadonlyArray<string>;
  readonly rank: number;
}

export interface LiveBidTarget {
  readonly maxBidCents: number | null;
  readonly stance: 'avoid' | 'target' | 'watch';
}

export interface LiveBidEvaluationInput {
  readonly baseBudgetCents: number;
  readonly calibratedMarket?: {
    readonly expectedPriceCents: number;
    readonly fairHighCents: number;
    readonly fairLowCents: number;
    readonly modelId: string;
    readonly seasonsBacktested: number;
  } | null;
  readonly currentPriceCents: number;
  readonly draftStateVersion: string;
  readonly historicalMarket: {
    readonly expectedPriceCents: number;
    readonly maximumPriceCents: number;
    readonly minimumPriceCents: number;
    readonly seasonsDrafted: number;
  } | null;
  readonly ownedPlayerIds: ReadonlyArray<string>;
  readonly playerId: string;
  readonly players: ReadonlyArray<LiveBidPlayer>;
  readonly remainingBudgetCents: number;
  readonly remainingRosterSpots: number;
  readonly rosterSize: number;
  readonly target: LiveBidTarget | null;
  readonly teamCount: number;
}

export interface LiveBidEvaluation {
  readonly action: LiveBidAction;
  readonly budget: {
    readonly maximumLegalBidCents: number;
    readonly remainingBudgetCents: number;
    readonly remainingRosterSpots: number;
  };
  readonly draftStateVersion: string;
  readonly impact: {
    readonly availabilityTier: AvailabilityTier;
    readonly fantasyPoints: number;
    readonly fantasyPointsPerGame: number;
    readonly marginalPointsPerGame: number;
    readonly positions: ReadonlyArray<string>;
    readonly projectionRank: number;
    readonly replacementPointsPerGame: number;
    readonly rosterFit: LiveBidRosterFit;
  };
  readonly market: {
    readonly calibrationModelId: string | null;
    readonly currentPriceCents: number;
    readonly expectedPriceCents: number;
    readonly fairHighCents: number;
    readonly fairLowCents: number;
    readonly historicalExpectedPriceCents: number | null;
    readonly historicalSeasons: number;
    readonly priceSource: 'calibrated-model' | 'historical-average' | 'projection-value';
    readonly priceSignal: LiveBidPriceSignal;
    readonly projectedValueCents: number;
  };
  readonly methodology: string;
  readonly personal: {
    readonly maxBidCents: number;
    readonly maxBidSource: 'model' | 'saved-target';
    readonly targetStance: LiveBidTarget['stance'] | null;
  };
  readonly player: {
    readonly id: string;
    readonly name: string;
  };
  readonly reasons: ReadonlyArray<string>;
}

const CORE_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

const assertWholeNonNegative = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
};

const roundToDollar = (cents: number): number => Math.max(0, Math.round(cents / 100) * 100);

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const rosterFitFor = (
  player: LiveBidPlayer,
  ownedPlayers: ReadonlyArray<LiveBidPlayer>,
): LiveBidRosterFit => {
  if (ownedPlayers.length === 0) return 'neutral';

  const coveredPositions = new Set(
    ownedPlayers
      .flatMap((ownedPlayer) => ownedPlayer.positions)
      .filter((position) => CORE_POSITIONS.includes(position as (typeof CORE_POSITIONS)[number])),
  );
  const fillsMissingPosition = player.positions.some(
    (position) =>
      CORE_POSITIONS.includes(position as (typeof CORE_POSITIONS)[number]) &&
      !coveredPositions.has(position),
  );
  if (fillsMissingPosition) return 'fills-need';

  const overlappingPlayers = ownedPlayers.filter((ownedPlayer) =>
    ownedPlayer.positions.some((position) => player.positions.includes(position)),
  ).length;
  return overlappingPlayers >= Math.max(2, Math.ceil(ownedPlayers.length / 2))
    ? 'redundant'
    : 'neutral';
};

const personalValueMultiplier = (
  player: LiveBidPlayer,
  rosterFit: LiveBidRosterFit,
  target: LiveBidTarget | null,
): number => {
  const availabilityAdjustment =
    player.availabilityTier === 'durable'
      ? 0.03
      : player.availabilityTier === 'fragile'
        ? -0.1
        : -0.02;
  const rosterAdjustment =
    rosterFit === 'fills-need' ? 0.05 : rosterFit === 'redundant' ? -0.05 : 0;
  const targetAdjustment = target?.stance === 'target' ? 0.05 : 0;
  return 1 + availabilityAdjustment + rosterAdjustment + targetAdjustment;
};

/**
 * Produces the explainable auction guardrails used by both the live UI and Eve.
 * Projection value is allocated from points above the league-wide replacement line;
 * historical prices remain a separate estimate of what this league may pay.
 */
export function evaluateLiveBid(input: LiveBidEvaluationInput): LiveBidEvaluation {
  assertWholeNonNegative(input.baseBudgetCents, 'base budget');
  assertWholeNonNegative(input.currentPriceCents, 'current price');
  assertWholeNonNegative(input.remainingBudgetCents, 'remaining budget');
  assertWholeNonNegative(input.remainingRosterSpots, 'remaining roster spots');
  if (!Number.isSafeInteger(input.rosterSize) || input.rosterSize <= 0) {
    throw new RangeError('roster size must be a positive integer');
  }
  if (!Number.isSafeInteger(input.teamCount) || input.teamCount <= 0) {
    throw new RangeError('team count must be a positive integer');
  }
  if (input.remainingRosterSpots === 0) {
    throw new RangeError('remaining roster spots must be greater than zero');
  }

  const player = input.players.find((candidate) => candidate.playerId === input.playerId);
  if (player === undefined) throw new Error(`Projection unavailable for player ${input.playerId}`);

  const auctionValues = allocateAuctionValues({
    baseBudgetCents: input.baseBudgetCents,
    players: input.players,
    rosterSize: input.rosterSize,
    teamCount: input.teamCount,
  });
  const replacementPointsPerGame = auctionValues.replacementPointsPerGame;
  const marginalPointsPerGame = Math.max(0, player.fantasyPointsPerGame - replacementPointsPerGame);
  const projectedValueCents =
    auctionValues.players.find((candidate) => candidate.playerId === player.playerId)?.valueCents ??
    0;

  const historicalExpectedPriceCents = input.historicalMarket?.expectedPriceCents ?? null;
  const expectedPriceCents =
    input.calibratedMarket?.expectedPriceCents ??
    historicalExpectedPriceCents ??
    projectedValueCents;
  const priceSource =
    input.calibratedMarket != null
      ? 'calibrated-model'
      : historicalExpectedPriceCents === null
        ? 'projection-value'
        : 'historical-average';
  const fairHalfWidthCents = Math.max(300, roundToDollar(expectedPriceCents * 0.15));
  const fairLowCents =
    input.calibratedMarket?.fairLowCents ?? Math.max(0, expectedPriceCents - fairHalfWidthCents);
  const fairHighCents =
    input.calibratedMarket?.fairHighCents ?? expectedPriceCents + fairHalfWidthCents;
  const priceSignal: LiveBidPriceSignal =
    input.currentPriceCents < fairLowCents
      ? 'under-value'
      : input.currentPriceCents > fairHighCents
        ? 'over-value'
        : 'at-value';

  const ownedPlayers = input.ownedPlayerIds.flatMap((playerId) => {
    const ownedPlayer = input.players.find((candidate) => candidate.playerId === playerId);
    return ownedPlayer === undefined ? [] : [ownedPlayer];
  });
  const rosterFit = rosterFitFor(player, ownedPlayers);
  const maximumLegalBidCents = input.remainingBudgetCents;
  const modelMaxBidCents = roundToDollar(
    projectedValueCents * personalValueMultiplier(player, rosterFit, input.target),
  );
  const requestedMaxBidCents = input.target?.maxBidCents ?? modelMaxBidCents;
  const maxBidCents = clamp(requestedMaxBidCents, 0, maximumLegalBidCents);
  const maxBidSource =
    input.target?.maxBidCents === null || input.target === null ? 'model' : 'saved-target';

  let action: LiveBidAction;
  if (input.target?.stance === 'avoid' || input.currentPriceCents > maxBidCents) {
    action = 'stop';
  } else if (maxBidCents === 0) {
    action = 'review';
  } else if (
    input.currentPriceCents >= maxBidCents * 0.9 ||
    priceSignal === 'over-value' ||
    player.availabilityTier === 'fragile'
  ) {
    action = 'caution';
  } else {
    action = 'keep-bidding';
  }

  const reasons = [
    `${player.fantasyPointsPerGame.toFixed(1)} projected points per game, ${marginalPointsPerGame.toFixed(1)} above the ${replacementPointsPerGame.toFixed(1)} replacement line.`,
    input.calibratedMarket != null
      ? `${input.calibratedMarket.modelId} implies an expected league price of $${(expectedPriceCents / 100).toFixed(0)} after ${input.calibratedMarket.seasonsBacktested} walk-forward season(s).`
      : historicalExpectedPriceCents === null
        ? 'No player-specific league price history is available, so the market range uses projection value.'
        : `${input.historicalMarket?.seasonsDrafted ?? 0} historical league draft(s) imply an expected market price of $${(historicalExpectedPriceCents / 100).toFixed(0)}.`,
    input.target?.maxBidCents == null
      ? `The personal cap adjusts projection value for ${player.availabilityTier} availability and ${rosterFit.replace('-', ' ')} roster fit.`
      : 'The saved scenario max bid is the personal cap.',
  ];
  if (input.target?.stance === 'avoid') {
    reasons.push('The active pre-draft scenario marks this player as an avoid.');
  }

  return {
    action,
    budget: {
      maximumLegalBidCents,
      remainingBudgetCents: input.remainingBudgetCents,
      remainingRosterSpots: input.remainingRosterSpots,
    },
    draftStateVersion: input.draftStateVersion,
    impact: {
      availabilityTier: player.availabilityTier,
      fantasyPoints: player.fantasyPoints,
      fantasyPointsPerGame: player.fantasyPointsPerGame,
      marginalPointsPerGame,
      positions: player.positions,
      projectionRank: player.rank,
      replacementPointsPerGame,
      rosterFit,
    },
    market: {
      calibrationModelId: input.calibratedMarket?.modelId ?? null,
      currentPriceCents: input.currentPriceCents,
      expectedPriceCents,
      fairHighCents,
      fairLowCents,
      historicalExpectedPriceCents,
      historicalSeasons:
        input.calibratedMarket?.seasonsBacktested ?? input.historicalMarket?.seasonsDrafted ?? 0,
      priceSource,
      priceSignal,
      projectedValueCents,
    },
    methodology:
      'Projection value reserves minimum bids, then allocates the remaining league auction pool by projected points per game above replacement. Calibrated market price estimates league demand from walk-forward historical tests. The personal cap is deterministic and is never set by an AI judgment.',
    personal: {
      maxBidCents,
      maxBidSource,
      targetStance: input.target?.stance ?? null,
    },
    player: { id: player.playerId, name: player.playerName },
    reasons,
  };
}
