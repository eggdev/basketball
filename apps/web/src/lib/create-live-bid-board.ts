import type {
  HistoricalAuctionMarket,
  HistoricalRankingSnapshot,
  LatestProjectionSnapshot,
  PreDraftWorkspace,
} from '@fantasy-basketball/database/runtime';

import { createAuctionValuationLab } from './valuation-lab';
import type { LiveBidBoard } from './live-bid-board';

export function createLiveBidBoard(input: {
  readonly league: NonNullable<PreDraftWorkspace['league']>;
  readonly market: HistoricalAuctionMarket | null;
  readonly plan: PreDraftWorkspace['plan'];
  readonly projection: LatestProjectionSnapshot;
  readonly rankings: HistoricalRankingSnapshot | null;
}): LiveBidBoard {
  const valuationLab =
    input.rankings === null
      ? null
      : createAuctionValuationLab({
          league: input.league,
          projection: input.projection,
          rankings: input.rankings,
        });
  const calibratedPlayers = new Map(
    valuationLab?.current?.players.map((player) => [player.playerId, player]) ?? [],
  );
  const historicalPlayers = new Map(
    input.market?.players.map((player) => [player.playerId, player]) ?? [],
  );
  const targets = new Map(input.plan?.targets.map((target) => [target.playerId, target]) ?? []);
  const selectedModel = valuationLab?.models.find(
    (model) => model.id === valuationLab.selectedModelId,
  );

  return {
    baseBudgetCents: input.league.baseBudgetCents,
    players: input.projection.players.map((player) => {
      const calibrated = calibratedPlayers.get(player.playerId);
      const historical = historicalPlayers.get(player.playerId);
      const target = targets.get(player.playerId);
      return {
        availabilityTier: player.availability.tier,
        calibratedMarket:
          calibrated === undefined || !calibrated.isModeled || valuationLab === null
            ? null
            : {
                expectedPriceCents: calibrated.marketEstimateCents,
                fairHighCents: calibrated.fairHighCents,
                fairLowCents: calibrated.fairLowCents,
                modelId: valuationLab.selectedModelId,
                seasonsBacktested: selectedModel?.seasons.length ?? 0,
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
  };
}
