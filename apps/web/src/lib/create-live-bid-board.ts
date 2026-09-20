import type {
  HistoricalAuctionMarket,
  AuctionValuationRun,
  LatestProjectionSnapshot,
  PreDraftWorkspace,
} from '@fantasy-basketball/database/runtime';

import type { LiveBidBoard } from './live-bid-board';

export function createLiveBidBoard(input: {
  readonly league: NonNullable<PreDraftWorkspace['league']>;
  readonly market: HistoricalAuctionMarket | null;
  readonly plan: PreDraftWorkspace['activePlan'];
  readonly projection: LatestProjectionSnapshot;
  readonly valuation: AuctionValuationRun | null;
}): LiveBidBoard {
  const valuationRun =
    input.valuation?.seasonKey === input.projection.seasonKey &&
    input.valuation.projection.snapshotId === input.projection.snapshotId
      ? input.valuation
      : null;
  const calibratedPlayers = new Map(
    valuationRun?.current.players.map((player) => [player.playerId, player]) ?? [],
  );
  const historicalPlayers = new Map(
    input.market?.players.map((player) => [player.playerId, player]) ?? [],
  );
  const targets = new Map(input.plan?.targets.map((target) => [target.playerId, target]) ?? []);
  const usableContext =
    valuationRun?.productionValue == null
      ? null
      : {
          lineupSlots: valuationRun.productionValue.leagueFormat.lineupSlots.map((slot) => ({
            ...slot,
            code: slot.code as 'C' | 'F' | 'FLX' | 'G' | 'PF' | 'PG' | 'SF' | 'SG',
            eligiblePositions: slot.eligiblePositions as ReadonlyArray<
              'C' | 'PF' | 'PG' | 'SF' | 'SG'
            >,
          })),
          modelVersion: valuationRun.productionValue.modelVersion,
          scheduleAsOf: valuationRun.productionValue.schedule.asOf,
          seasonCalendar: valuationRun.productionValue.seasonCalendar,
        };

  return {
    baseBudgetCents: input.league.baseBudgetCents,
    players: input.projection.players.map((player) => {
      const calibrated = calibratedPlayers.get(player.playerId);
      const historical = historicalPlayers.get(player.playerId);
      const target = targets.get(player.playerId);
      return {
        availabilityRate: player.availability.rate,
        availabilityTier: player.availability.tier,
        calibratedMarket:
          calibrated === undefined || !calibrated.isModeled || valuationRun === null
            ? null
            : {
                expectedPriceCents: calibrated.marketEstimateCents,
                fairHighCents: calibrated.fairHighCents,
                fairLowCents: calibrated.fairLowCents,
                modelId: valuationRun.selectedModelId,
                seasonsBacktested: valuationRun.historicalInputs.seasonKeys.length,
              },
        fantasyPoints: player.fantasyPoints,
        fantasyPointsPerGame: player.fantasyPointsPerGame,
        historicalMarket:
          historical === undefined
            ? null
            : {
                expectedPriceCents: historical.expectedPriceCents,
                maximumPriceCents: historical.maximumPriceCents,
                minimumPriceCents: historical.minimumPriceCents,
                seasonsDrafted: historical.seasonsDrafted,
              },
        playerId: player.playerId,
        playerName: player.playerName,
        positions: player.positions,
        rank: player.rank,
        target:
          target === undefined ? null : { maxBidCents: target.maxBidCents, stance: target.stance },
        teamAbbreviation: player.teamAbbreviation,
        usableValue:
          calibrated?.usableDiagnostics == null ||
          calibrated.usableValueCents == null ||
          valuationRun?.productionValue == null
            ? null
            : {
                diagnostics: {
                  capturedPlayoffWeightedPoints:
                    calibrated.usableDiagnostics.capturedPlayoffWeightedPoints,
                  congestionLoss: calibrated.usableDiagnostics.congestionLoss,
                  estimatedCapturedRegularSeasonPoints:
                    calibrated.usableDiagnostics.estimatedCapturedRegularSeasonPoints,
                  expectedScheduledPoints: calibrated.usableDiagnostics.expectedScheduledPoints,
                  playoffWeightedGames: calibrated.usableDiagnostics.playoffWeightedGames,
                  usablePoints: calibrated.usableDiagnostics.usablePoints,
                },
                modelVersion: valuationRun.productionValue.modelVersion,
                scheduleAsOf: valuationRun.productionValue.schedule.asOf,
                valueCents: calibrated.usableValueCents,
              },
      };
    }),
    projection: {
      asOf: input.projection.asOf,
      modelVersion: input.projection.modelVersion,
      seasonKey: input.projection.seasonKey,
      source: input.projection.source,
    },
    rosterSize: input.league.rosterSize,
    teamCount: input.league.teamCount,
    usableContext,
  };
}
