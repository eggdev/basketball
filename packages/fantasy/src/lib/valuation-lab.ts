export type AuctionValuationModelId =
  | 'last-price-v1'
  | 'market-production-50-v1'
  | 'market-production-75-v1'
  | 'recency-market-v1';

export type AuctionPriceTier = 'anchor' | 'core' | 'endgame';

export interface AuctionValuationPlayer {
  readonly auctionCostCents: number | null;
  readonly fantasyPoints: number;
  readonly fantasyPointsPerGame: number;
  readonly playerId: string;
  readonly playerName: string;
}

export interface AuctionPriceObservation {
  readonly auctionCostCents: number;
  readonly playerId: string;
  readonly playerName: string;
}

export interface AuctionValuationSeason {
  readonly auctionPrices?: ReadonlyArray<AuctionPriceObservation>;
  readonly baseBudgetCents: number;
  readonly players: ReadonlyArray<AuctionValuationPlayer>;
  readonly rosterSize: number;
  readonly seasonKey: string;
  readonly teamCount: number;
}

export interface CurrentAuctionProjection {
  readonly baseBudgetCents: number;
  readonly players: ReadonlyArray<
    Omit<AuctionValuationPlayer, 'auctionCostCents'> & {
      readonly historicalPlayerId?: string;
      readonly rank: number;
    }
  >;
  readonly rosterSize: number;
  readonly seasonKey: string;
  readonly teamCount: number;
}

export interface AuctionValuePlayer {
  readonly playerId: string;
  readonly valueCents: number;
}

export interface AuctionValueSnapshot {
  readonly auctionPoolCents: number;
  readonly draftablePlayerCount: number;
  readonly players: ReadonlyArray<AuctionValuePlayer>;
  readonly replacementPointsPerGame: number;
}

export interface AuctionValuationPrediction {
  readonly absoluteErrorCents: number;
  readonly actualPriceCents: number;
  readonly fairHighCents: number;
  readonly fairLowCents: number;
  readonly isNewPlayer: boolean;
  readonly playerId: string;
  readonly playerName: string;
  readonly predictedPriceCents: number;
  readonly priceTier: AuctionPriceTier;
  readonly realizedSurplusCents: number | null;
  readonly realizedValueCents: number | null;
  readonly seasonKey: string;
}

export interface AuctionValuationMetrics {
  readonly allPlayerMaeCents: number;
  readonly draftedPlayerCount: number;
  readonly draftedPlayerMaeCents: number | null;
  readonly fairRangeCoverageRate: number | null;
  readonly medianAbsoluteErrorCents: number;
  readonly newPlayerCount: number;
  readonly predictionCount: number;
  readonly withinFiveDollarsRate: number | null;
}

export interface AuctionValuationSeasonResult {
  readonly metrics: AuctionValuationMetrics;
  readonly seasonKey: string;
}

export interface AuctionValuationModelResult {
  readonly description: string;
  readonly errorBandsCents: Readonly<Record<AuctionPriceTier, number>>;
  readonly id: AuctionValuationModelId;
  readonly label: string;
  readonly metrics: AuctionValuationMetrics;
  readonly predictions: ReadonlyArray<AuctionValuationPrediction>;
  readonly seasons: ReadonlyArray<AuctionValuationSeasonResult>;
}

export interface CurrentAuctionEstimate {
  readonly fairHighCents: number;
  readonly fairLowCents: number;
  readonly historicalSeasonCount: number;
  readonly historyPlayerId: string | null;
  readonly isModeled: boolean;
  readonly marketEstimateCents: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly projectedEdgeCents: number;
  readonly projectedValueCents: number;
  readonly projectionRank: number;
}

export interface AuctionValuationLab {
  readonly current: {
    readonly players: ReadonlyArray<CurrentAuctionEstimate>;
    readonly seasonKey: string;
  } | null;
  readonly limitations: ReadonlyArray<string>;
  readonly methodology: string;
  readonly models: ReadonlyArray<AuctionValuationModelResult>;
  readonly selectedModelId: AuctionValuationModelId;
  readonly version: 'walk-forward-v1';
}

interface ModelDefinition {
  readonly description: string;
  readonly id: AuctionValuationModelId;
  readonly label: string;
  readonly marketWeight: number | null;
  readonly strategy: 'last-price' | 'recency-market' | 'weighted-blend';
}

interface RawPrediction {
  readonly actualPriceCents: number;
  readonly isNewPlayer: boolean;
  readonly playerId: string;
  readonly playerName: string;
  readonly predictedPriceCents: number;
  readonly realizedSurplusCents: number | null;
  readonly realizedValueCents: number | null;
  readonly seasonKey: string;
}

const MODEL_DEFINITIONS: ReadonlyArray<ModelDefinition> = [
  {
    description: 'Carries forward the player’s most recent league auction result.',
    id: 'last-price-v1',
    label: 'Last price',
    marketWeight: null,
    strategy: 'last-price',
  },
  {
    description: 'Weights every prior league price toward the most recent season.',
    id: 'recency-market-v1',
    label: 'Recency market',
    marketWeight: null,
    strategy: 'recency-market',
  },
  {
    description: 'Blends prior league prices evenly with lagged production value.',
    id: 'market-production-50-v1',
    label: 'Market + production 50/50',
    marketWeight: 0.5,
    strategy: 'weighted-blend',
  },
  {
    description: 'Leans on prior league prices while reserving 25% for lagged production value.',
    id: 'market-production-75-v1',
    label: 'Market + production 75/25',
    marketWeight: 0.75,
    strategy: 'weighted-blend',
  },
];

const MINIMUM_DRAFT_PRICE_CENTS = 100;
const MINIMUM_ERROR_BAND_CENTS = 300;

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
};

const roundToDollar = (cents: number): number => Math.max(0, Math.round(cents / 100) * 100);

const mean = (values: ReadonlyArray<number>): number =>
  values.length === 0
    ? 0
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

const percentile = (values: ReadonlyArray<number>, quantile: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)] ?? 0;
};

const priceTierFor = (priceCents: number): AuctionPriceTier =>
  priceCents > 4_000 ? 'anchor' : priceCents > 1_000 ? 'core' : 'endgame';

const playerMap = (season: AuctionValuationSeason): ReadonlyMap<string, AuctionValuationPlayer> =>
  new Map(season.players.map((player) => [player.playerId, player]));

const auctionPriceMap = (
  season: AuctionValuationSeason,
): ReadonlyMap<string, AuctionPriceObservation> =>
  new Map((season.auctionPrices ?? []).map((player) => [player.playerId, player]));

const observedPrice = (season: AuctionValuationSeason, playerId: string): number | null => {
  const auction = auctionPriceMap(season).get(playerId);
  if (auction !== undefined) return auction.auctionCostCents;
  const activePlayer = playerMap(season).get(playerId);
  return activePlayer === undefined ? null : (activePlayer.auctionCostCents ?? 0);
};

/**
 * Converts a points-per-game player pool into dollar values above replacement.
 * Every draftable roster spot reserves the league-minimum $1 bid before the
 * remaining auction pool is allocated by marginal production.
 */
export function allocateAuctionValues(input: {
  readonly baseBudgetCents: number;
  readonly players: ReadonlyArray<
    Pick<AuctionValuationPlayer, 'fantasyPoints' | 'fantasyPointsPerGame' | 'playerId'>
  >;
  readonly rosterSize: number;
  readonly teamCount: number;
}): AuctionValueSnapshot {
  assertPositiveInteger(input.baseBudgetCents, 'base budget');
  assertPositiveInteger(input.rosterSize, 'roster size');
  assertPositiveInteger(input.teamCount, 'team count');

  const rankedPlayers = [...input.players].sort(
    (left, right) =>
      right.fantasyPointsPerGame - left.fantasyPointsPerGame ||
      right.fantasyPoints - left.fantasyPoints ||
      left.playerId.localeCompare(right.playerId),
  );
  const draftablePlayerCount = Math.min(input.teamCount * input.rosterSize, rankedPlayers.length);
  const replacementPointsPerGame =
    rankedPlayers[Math.max(0, draftablePlayerCount - 1)]?.fantasyPointsPerGame ?? 0;
  const auctionPoolCents = input.teamCount * input.baseBudgetCents;
  const reservedMinimumsCents = draftablePlayerCount * MINIMUM_DRAFT_PRICE_CENTS;
  if (auctionPoolCents < reservedMinimumsCents) {
    throw new RangeError('auction pool cannot fund the minimum bid for every draftable player');
  }
  const discretionaryPoolCents = auctionPoolCents - reservedMinimumsCents;
  const marginalPoints = rankedPlayers.map((player, index) =>
    index < draftablePlayerCount
      ? Math.max(0, player.fantasyPointsPerGame - replacementPointsPerGame)
      : 0,
  );
  const totalMarginalPoints = marginalPoints.reduce((sum, points) => sum + points, 0);
  const discretionaryDollars = Math.floor(discretionaryPoolCents / 100);
  const allocationWeights = rankedPlayers.map((_player, index) => {
    if (index >= draftablePlayerCount) return 0;
    return totalMarginalPoints === 0 ? 1 : (marginalPoints[index] ?? 0);
  });
  const totalAllocationWeight = allocationWeights.reduce((sum, weight) => sum + weight, 0);
  const exactDollarAllocations = allocationWeights.map((weight) =>
    totalAllocationWeight === 0 ? 0 : (weight / totalAllocationWeight) * discretionaryDollars,
  );
  const wholeDollarAllocations = exactDollarAllocations.map((value) => Math.floor(value));
  let dollarsToDistribute =
    discretionaryDollars - wholeDollarAllocations.reduce((sum, value) => sum + value, 0);
  const remainderOrder = exactDollarAllocations
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .filter(({ index }) => index < draftablePlayerCount)
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const allocation of remainderOrder) {
    if (dollarsToDistribute === 0) break;
    wholeDollarAllocations[allocation.index] = (wholeDollarAllocations[allocation.index] ?? 0) + 1;
    dollarsToDistribute -= 1;
  }

  return {
    auctionPoolCents,
    draftablePlayerCount,
    players: rankedPlayers.map((player, index) => ({
      playerId: player.playerId,
      valueCents:
        index >= draftablePlayerCount
          ? 0
          : MINIMUM_DRAFT_PRICE_CENTS + (wholeDollarAllocations[index] ?? 0) * 100,
    })),
    replacementPointsPerGame,
  };
}

const recencyMarketPrice = (
  playerId: string,
  priorSeasons: ReadonlyArray<AuctionValuationSeason>,
): { readonly priceCents: number | null; readonly seasonCount: number } => {
  const appearances = priorSeasons.flatMap((season) => {
    const priceCents = observedPrice(season, playerId);
    return priceCents === null ? [] : [priceCents];
  });
  if (appearances.length === 0) return { priceCents: null, seasonCount: 0 };

  let weightedTotal = 0;
  let weightTotal = 0;
  appearances.forEach((priceCents, index) => {
    const weight = index + 1;
    weightedTotal += priceCents * weight;
    weightTotal += weight;
  });
  return {
    priceCents: roundToDollar(weightedTotal / weightTotal),
    seasonCount: appearances.length,
  };
};

const lastPrice = (
  playerId: string,
  priorSeasons: ReadonlyArray<AuctionValuationSeason>,
): number | null => {
  for (let index = priorSeasons.length - 1; index >= 0; index -= 1) {
    const season = priorSeasons[index];
    if (season === undefined) continue;
    const priceCents = observedPrice(season, playerId);
    if (priceCents !== null) return priceCents;
  }
  return null;
};

const predictedPriceFor = (input: {
  readonly definition: ModelDefinition;
  readonly laggedProductionValueCents: number | null;
  readonly playerId: string;
  readonly priorSeasons: ReadonlyArray<AuctionValuationSeason>;
}): number => {
  const recentPrice = recencyMarketPrice(input.playerId, input.priorSeasons).priceCents;
  if (input.definition.strategy === 'last-price') {
    return lastPrice(input.playerId, input.priorSeasons) ?? 0;
  }
  if (input.definition.strategy === 'recency-market') return recentPrice ?? 0;

  if (recentPrice === null) return input.laggedProductionValueCents ?? 0;
  if (input.laggedProductionValueCents === null) return recentPrice;
  const marketWeight = input.definition.marketWeight ?? 0;
  return roundToDollar(
    recentPrice * marketWeight + input.laggedProductionValueCents * (1 - marketWeight),
  );
};

const rawPredictionsFor = (
  definition: ModelDefinition,
  seasons: ReadonlyArray<AuctionValuationSeason>,
): ReadonlyArray<RawPrediction> => {
  const predictions: RawPrediction[] = [];
  seasons.slice(1).forEach((targetSeason, targetIndex) => {
    const priorSeasons = seasons.slice(0, targetIndex + 1);
    const laggedSeason = priorSeasons.at(-1);
    if (laggedSeason === undefined) return;

    const laggedValues = new Map(
      allocateAuctionValues({
        baseBudgetCents: targetSeason.baseBudgetCents,
        players: laggedSeason.players,
        rosterSize: targetSeason.rosterSize,
        teamCount: targetSeason.teamCount,
      }).players.map((player) => [player.playerId, player.valueCents]),
    );
    const realizedValues = new Map(
      allocateAuctionValues({
        baseBudgetCents: targetSeason.baseBudgetCents,
        players: targetSeason.players,
        rosterSize: targetSeason.rosterSize,
        teamCount: targetSeason.teamCount,
      }).players.map((player) => [player.playerId, player.valueCents]),
    );

    const targetPlayers = new Map(
      targetSeason.players.map((player) => [
        player.playerId,
        { playerId: player.playerId, playerName: player.playerName },
      ]),
    );
    targetSeason.auctionPrices?.forEach((player) => {
      if (!targetPlayers.has(player.playerId)) {
        targetPlayers.set(player.playerId, {
          playerId: player.playerId,
          playerName: player.playerName,
        });
      }
    });
    targetPlayers.forEach((player) => {
      const actualPriceCents = observedPrice(targetSeason, player.playerId) ?? 0;
      const realizedValueCents = realizedValues.get(player.playerId) ?? null;
      predictions.push({
        actualPriceCents,
        isNewPlayer: !priorSeasons.some(
          (season) => observedPrice(season, player.playerId) !== null,
        ),
        playerId: player.playerId,
        playerName: player.playerName,
        predictedPriceCents: predictedPriceFor({
          definition,
          laggedProductionValueCents: laggedValues.get(player.playerId) ?? null,
          playerId: player.playerId,
          priorSeasons,
        }),
        realizedSurplusCents:
          realizedValueCents === null ? null : realizedValueCents - actualPriceCents,
        realizedValueCents,
        seasonKey: targetSeason.seasonKey,
      });
    });
  });
  return predictions;
};

const errorBandsFor = (
  predictions: ReadonlyArray<RawPrediction>,
): Readonly<Record<AuctionPriceTier, number>> => {
  const drafted = predictions.filter((prediction) => prediction.actualPriceCents > 0);
  const globalBand = Math.max(
    MINIMUM_ERROR_BAND_CENTS,
    roundToDollar(
      percentile(
        drafted.map((prediction) =>
          Math.abs(prediction.predictedPriceCents - prediction.actualPriceCents),
        ),
        0.8,
      ),
    ),
  );
  return Object.fromEntries(
    (['endgame', 'core', 'anchor'] as const).map((tier) => {
      const errors = drafted
        .filter((prediction) => priceTierFor(prediction.predictedPriceCents) === tier)
        .map((prediction) =>
          Math.abs(prediction.predictedPriceCents - prediction.actualPriceCents),
        );
      return [
        tier,
        errors.length < 3
          ? globalBand
          : Math.max(MINIMUM_ERROR_BAND_CENTS, roundToDollar(percentile(errors, 0.8))),
      ];
    }),
  ) as Readonly<Record<AuctionPriceTier, number>>;
};

const enrichPrediction = (
  prediction: RawPrediction,
  errorBandsCents: Readonly<Record<AuctionPriceTier, number>>,
): AuctionValuationPrediction => {
  const priceTier = priceTierFor(prediction.predictedPriceCents);
  const errorBandCents = errorBandsCents[priceTier];
  return {
    ...prediction,
    absoluteErrorCents: Math.abs(prediction.predictedPriceCents - prediction.actualPriceCents),
    fairHighCents: prediction.predictedPriceCents + errorBandCents,
    fairLowCents: Math.max(0, prediction.predictedPriceCents - errorBandCents),
    priceTier,
  };
};

const metricsFor = (
  predictions: ReadonlyArray<AuctionValuationPrediction>,
): AuctionValuationMetrics => {
  const drafted = predictions.filter((prediction) => prediction.actualPriceCents > 0);
  return {
    allPlayerMaeCents: mean(predictions.map((prediction) => prediction.absoluteErrorCents)),
    draftedPlayerCount: drafted.length,
    draftedPlayerMaeCents:
      drafted.length === 0
        ? null
        : mean(drafted.map((prediction) => prediction.absoluteErrorCents)),
    fairRangeCoverageRate:
      drafted.length === 0
        ? null
        : drafted.filter(
            (prediction) =>
              prediction.actualPriceCents >= prediction.fairLowCents &&
              prediction.actualPriceCents <= prediction.fairHighCents,
          ).length / drafted.length,
    medianAbsoluteErrorCents: percentile(
      predictions.map((prediction) => prediction.absoluteErrorCents),
      0.5,
    ),
    newPlayerCount: predictions.filter((prediction) => prediction.isNewPlayer).length,
    predictionCount: predictions.length,
    withinFiveDollarsRate:
      drafted.length === 0
        ? null
        : drafted.filter((prediction) => prediction.absoluteErrorCents <= 500).length /
          drafted.length,
  };
};

const validateSeason = (season: AuctionValuationSeason): void => {
  if (season.seasonKey.trim() === '') throw new Error('season key cannot be empty');
  assertPositiveInteger(season.baseBudgetCents, `${season.seasonKey} base budget`);
  assertPositiveInteger(season.rosterSize, `${season.seasonKey} roster size`);
  assertPositiveInteger(season.teamCount, `${season.seasonKey} team count`);
  const playerIds = new Set<string>();
  season.players.forEach((player) => {
    if (playerIds.has(player.playerId)) {
      throw new Error(`Duplicate player ${player.playerId} in ${season.seasonKey}`);
    }
    playerIds.add(player.playerId);
  });
};

/**
 * Backtests fixed auction-price models one season at a time. A target season's
 * realized production and auction prices are used only for evaluation; every
 * price prediction is made from seasons that occurred earlier.
 */
export function buildAuctionValuationLab(input: {
  readonly current?: CurrentAuctionProjection | null;
  readonly historicalSeasons: ReadonlyArray<AuctionValuationSeason>;
}): AuctionValuationLab {
  const historicalSeasons = [...input.historicalSeasons].sort((left, right) =>
    left.seasonKey.localeCompare(right.seasonKey),
  );
  historicalSeasons.forEach(validateSeason);
  const uniqueSeasonCount = new Set(historicalSeasons.map((season) => season.seasonKey)).size;
  if (uniqueSeasonCount !== historicalSeasons.length) throw new Error('Season keys must be unique');

  const models = MODEL_DEFINITIONS.map((definition): AuctionValuationModelResult => {
    const rawPredictions = rawPredictionsFor(definition, historicalSeasons);
    const errorBandsCents = errorBandsFor(rawPredictions);
    const predictions = rawPredictions.map((prediction) =>
      enrichPrediction(prediction, errorBandsCents),
    );
    return {
      description: definition.description,
      errorBandsCents,
      id: definition.id,
      label: definition.label,
      metrics: metricsFor(predictions),
      predictions,
      seasons: historicalSeasons.slice(1).map((season) => ({
        metrics: metricsFor(
          predictions.filter((prediction) => prediction.seasonKey === season.seasonKey),
        ),
        seasonKey: season.seasonKey,
      })),
    };
  });
  const selectedModel =
    [...models].sort((left, right) => {
      const leftError = left.metrics.draftedPlayerMaeCents ?? Number.POSITIVE_INFINITY;
      const rightError = right.metrics.draftedPlayerMaeCents ?? Number.POSITIVE_INFINITY;
      return leftError - rightError || left.id.localeCompare(right.id);
    })[0] ?? models[1];
  if (selectedModel === undefined) throw new Error('No auction valuation models are configured');

  let current: AuctionValuationLab['current'] = null;
  if (input.current != null) {
    assertPositiveInteger(input.current.baseBudgetCents, 'current base budget');
    assertPositiveInteger(input.current.rosterSize, 'current roster size');
    assertPositiveInteger(input.current.teamCount, 'current team count');
    const definition = MODEL_DEFINITIONS.find((candidate) => candidate.id === selectedModel.id);
    if (definition === undefined) throw new Error(`Unknown model ${selectedModel.id}`);
    const latestHistoricalSeason = historicalSeasons.at(-1);
    const laggedValues =
      latestHistoricalSeason === undefined
        ? new Map<string, number>()
        : new Map(
            allocateAuctionValues({
              baseBudgetCents: input.current.baseBudgetCents,
              players: latestHistoricalSeason.players,
              rosterSize: input.current.rosterSize,
              teamCount: input.current.teamCount,
            }).players.map((player) => [player.playerId, player.valueCents]),
          );
    const projectedValues = new Map(
      allocateAuctionValues({
        baseBudgetCents: input.current.baseBudgetCents,
        players: input.current.players,
        rosterSize: input.current.rosterSize,
        teamCount: input.current.teamCount,
      }).players.map((player) => [player.playerId, player.valueCents]),
    );
    const players = input.current.players
      .map((player): CurrentAuctionEstimate => {
        const historyPlayerId = player.historicalPlayerId ?? player.playerId;
        const marketHistory = recencyMarketPrice(historyPlayerId, historicalSeasons);
        const marketEstimateCents = predictedPriceFor({
          definition,
          laggedProductionValueCents: laggedValues.get(historyPlayerId) ?? null,
          playerId: historyPlayerId,
          priorSeasons: historicalSeasons,
        });
        const isModeled = marketHistory.seasonCount > 0 || laggedValues.has(historyPlayerId);
        const errorBandCents = selectedModel.errorBandsCents[priceTierFor(marketEstimateCents)];
        const projectedValueCents = projectedValues.get(player.playerId) ?? 0;
        return {
          fairHighCents: marketEstimateCents + errorBandCents,
          fairLowCents: Math.max(0, marketEstimateCents - errorBandCents),
          historicalSeasonCount: marketHistory.seasonCount,
          historyPlayerId: marketHistory.seasonCount === 0 ? null : historyPlayerId,
          isModeled,
          marketEstimateCents,
          playerId: player.playerId,
          playerName: player.playerName,
          projectedEdgeCents: projectedValueCents - marketEstimateCents,
          projectedValueCents,
          projectionRank: player.rank,
        };
      })
      .sort(
        (left, right) =>
          Number(right.isModeled) - Number(left.isModeled) ||
          right.projectedEdgeCents - left.projectedEdgeCents ||
          left.projectionRank - right.projectionRank,
      );
    current = { players, seasonKey: input.current.seasonKey };
  }

  return {
    current,
    limitations: [
      'Historical preseason projections and ADP are not yet archived, so production signals use only the immediately preceding season’s actual output.',
      'League budget trades and earned auction dollars are not yet represented; production value uses each season’s base auction pool.',
      'Rookies and players without prior league or NBA history remain unmodeled until a rookie prior is added; live evaluation falls back to projection value.',
    ],
    methodology:
      'Each completed season is predicted from earlier seasons only. Models are compared on drafted-player mean absolute error; current projected value is shown separately from the selected model’s expected league price.',
    models,
    selectedModelId: selectedModel.id,
    version: 'walk-forward-v1',
  };
}
