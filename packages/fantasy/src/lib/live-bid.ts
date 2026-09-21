import type { AvailabilityTier } from './projections';
import { LEAGUE_AUCTION_RULES } from './auction-economy';
import { allocateAuctionValues } from './valuation-lab';

export type LiveBidPriceSignal = 'at-value' | 'over-value' | 'under-value';
export type LiveBidAction = 'caution' | 'keep-bidding' | 'review' | 'stop';
export type LiveBidRosterFit = 'fills-need' | 'neutral' | 'redundant';

export const GLOBAL_FPPG_MODEL_VERSION = 'global-fppg-v2' as const;

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

export interface LiveBidRosterMarginalValue {
  readonly candidateStandalonePlayoffWeightedPoints: number;
  readonly candidateStandaloneRegularSeasonPoints: number;
  readonly concentrationRisk: {
    readonly level: 'high' | 'low' | 'moderate';
    readonly sameTeamPlayerCount: number;
    readonly sameTeamRosterShare: number;
  };
  readonly capturedPlayoffWeightedPoints: number;
  readonly congestionLoss: number;
  readonly daysBenched: number;
  readonly filledSlotNeeds: ReadonlyArray<string>;
  readonly marginalPlayoffWeightedPoints: number;
  readonly marginalRegularSeasonPoints: number;
  readonly modelVersion: string;
  readonly playoffWeightedGames: number;
  readonly projectedPoints: number;
  readonly scheduleAsOf: string;
  readonly usablePoints: number;
  readonly valueCents: number;
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
  readonly rosterMarginalValue?: LiveBidRosterMarginalValue | null;
  readonly rosterSize: number;
  readonly target: LiveBidTarget | null;
  readonly teamCount: number;
}

export interface LiveBidEvaluation {
  readonly action: LiveBidAction;
  readonly budget: {
    readonly bidIncrementCents: number;
    readonly legalBidFloorCents: number;
    readonly maximumLegalBidCents: number;
    readonly positiveBidLeverage: boolean;
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
    readonly rosterMarginalValue: LiveBidRosterMarginalValue | null;
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
    readonly usableValueCents: number | null;
  };
  readonly methodology: string;
  readonly personal: {
    readonly maxBidCents: number;
    readonly maxBidSource: 'model' | 'saved-target';
    readonly targetStance: LiveBidTarget['stance'] | null;
    readonly valueBasis: typeof GLOBAL_FPPG_MODEL_VERSION | `roster-marginal-${string}`;
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
  if (
    input.rosterMarginalValue != null &&
    (!Number.isSafeInteger(input.rosterMarginalValue.valueCents) ||
      input.rosterMarginalValue.valueCents < 0)
  ) {
    throw new RangeError('roster-marginal value must be non-negative integer cents');
  }
  const personalValueCents = input.rosterMarginalValue?.valueCents ?? projectedValueCents;
  const personalMultiplier =
    input.rosterMarginalValue == null
      ? personalValueMultiplier(player, rosterFit, input.target)
      : input.target?.stance === 'target'
        ? 1.05
        : 1;
  const modelMaxBidCents = roundToDollar(personalValueCents * personalMultiplier);
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
      ? input.rosterMarginalValue === null || input.rosterMarginalValue === undefined
        ? `The personal cap adjusts projection value for ${player.availabilityTier} availability and ${rosterFit.replace('-', ' ')} roster fit.`
        : `The personal cap uses ${input.rosterMarginalValue.marginalRegularSeasonPoints.toFixed(1)} roster-marginal points from ${input.rosterMarginalValue.modelVersion}.`
      : 'The saved scenario max bid is the personal cap.',
    'A $0 nomination can still win if every other manager passes; no budget reserve is legally required for open roster spots.',
  ];
  if (input.target?.stance === 'avoid') {
    reasons.push('The active pre-draft scenario marks this player as an avoid.');
  }

  return {
    action,
    budget: {
      bidIncrementCents: LEAGUE_AUCTION_RULES.bidIncrementCents,
      legalBidFloorCents: LEAGUE_AUCTION_RULES.minimumBidCents,
      maximumLegalBidCents,
      positiveBidLeverage:
        input.remainingBudgetCents >= LEAGUE_AUCTION_RULES.bidIncrementCents,
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
      rosterMarginalValue: input.rosterMarginalValue ?? null,
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
      usableValueCents: input.rosterMarginalValue?.valueCents ?? null,
    },
    methodology:
      'Projection value and calibrated league price remain separate market signals. The legal bid floor is $0, with no mandatory cash reserve for open roster spots; retaining cash is optional leverage for beating other zero-dollar bidders. When usable-lineup context is present, the personal cap uses roster-marginal production; otherwise it uses the global points-per-game basis. The personal cap is deterministic and is never set by an AI judgment.',
    personal: {
      maxBidCents,
      maxBidSource,
      targetStance: input.target?.stance ?? null,
      valueBasis:
        input.rosterMarginalValue == null
          ? GLOBAL_FPPG_MODEL_VERSION
          : `roster-marginal-${input.rosterMarginalValue.modelVersion}`,
    },
    player: { id: player.playerId, name: player.playerName },
    reasons,
  };
}
