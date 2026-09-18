import { buildAuctionValuationLab, type AuctionValuationLab } from '@fantasy-basketball/fantasy';
import type {
  HistoricalRankingSnapshot,
  LatestProjectionSnapshot,
  PreDraftWorkspace,
} from '@fantasy-basketball/database/runtime';

export function createAuctionValuationLab(input: {
  readonly league: NonNullable<PreDraftWorkspace['league']>;
  readonly projection: LatestProjectionSnapshot;
  readonly rankings: HistoricalRankingSnapshot;
}): AuctionValuationLab {
  return buildAuctionValuationLab({
    current: {
      baseBudgetCents: input.league.baseBudgetCents,
      players: input.projection.players.map((player) => ({
        fantasyPoints: player.fantasyPoints,
        fantasyPointsPerGame: player.fantasyPointsPerGame,
        playerId: player.playerId,
        playerName: player.playerName,
        rank: player.rank,
      })),
      rosterSize: input.league.rosterSize,
      seasonKey: input.projection.seasonKey,
      teamCount: input.league.teamCount,
    },
    historicalSeasons: input.rankings.seasons.map((season) => ({
      auctionPrices: season.auctionPlayers,
      baseBudgetCents: season.baseBudgetCents,
      players: season.players.map((player) => ({
        auctionCostCents: player.auctionCostCents,
        fantasyPoints: player.fantasyPoints,
        fantasyPointsPerGame: player.fantasyPointsPerGame,
        playerId: player.playerId,
        playerName: player.playerName,
      })),
      rosterSize: season.rosterSize,
      seasonKey: season.seasonKey,
      teamCount: season.teamCount,
    })),
  });
}
