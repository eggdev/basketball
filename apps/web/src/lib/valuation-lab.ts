import {
  buildAuctionValuationArtifact,
  buildAuctionValuationLab,
  type AuctionValuationArtifact,
  type AuctionValuationLab,
} from '@fantasy-basketball/fantasy';
import type {
  AuctionValuationRun,
  HistoricalRankingSnapshot,
  LatestProjectionSnapshot,
  PreDraftWorkspace,
} from '@fantasy-basketball/database/runtime';
import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';

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

export function createAuctionValuationArtifact(input: {
  readonly league: NonNullable<PreDraftWorkspace['league']>;
  readonly projection: LatestProjectionSnapshot;
  readonly rankings: HistoricalRankingSnapshot;
}): AuctionValuationArtifact {
  return buildAuctionValuationArtifact({
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
      players: season.players,
      rosterSize: season.rosterSize,
      seasonKey: season.seasonKey,
      teamCount: season.teamCount,
    })),
    projection: {
      asOf: input.projection.asOf,
      modelVersion: input.projection.modelVersion,
      snapshotId: input.projection.snapshotId,
    },
  });
}

export async function loadPromotedAuctionValuationRun(
  seasonKey: string,
): Promise<AuctionValuationRun | null> {
  const config = await Effect.runPromise(loadDatabaseConfig());
  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.promotedAuctionValuationRun(seasonKey);
    }).pipe(Effect.provide(databaseLayer(config))),
  );
}
