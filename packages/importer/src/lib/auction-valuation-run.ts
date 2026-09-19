import type {
  AuctionValuationArtifactInput,
  PromoteAuctionValuationRunResult,
  SaveAuctionValuationRunResult,
} from '@fantasy-basketball/database';
import {
  buildAuctionValuationArtifact,
  type AuctionValuationArtifact,
} from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';

export interface AuctionValuationInputs {
  readonly league: {
    readonly baseBudgetCents: number;
    readonly rosterSize: number;
    readonly seasonKey: string;
    readonly teamCount: number;
  };
  readonly projection: {
    readonly asOf: string;
    readonly modelVersion: string;
    readonly players: ReadonlyArray<{
      readonly fantasyPoints: number;
      readonly fantasyPointsPerGame: number;
      readonly playerId: string;
      readonly playerName: string;
      readonly rank: number;
    }>;
    readonly seasonKey: string;
    readonly snapshotId: string;
  };
  readonly rankings: {
    readonly seasons: ReadonlyArray<{
      readonly auctionPlayers: ReadonlyArray<{
        readonly auctionCostCents: number;
        readonly playerId: string;
        readonly playerName: string;
      }>;
      readonly baseBudgetCents: number;
      readonly players: ReadonlyArray<{
        readonly auctionCostCents: number | null;
        readonly fantasyPoints: number;
        readonly fantasyPointsPerGame: number;
        readonly playerId: string;
        readonly playerName: string;
      }>;
      readonly rosterSize: number;
      readonly seasonKey: string;
      readonly teamCount: number;
    }>;
  };
}

export interface AuctionValuationCommitter<Error> {
  readonly promoteAuctionValuationRun: (
    runId: string,
    actorId: string,
  ) => Effect.Effect<PromoteAuctionValuationRunResult, Error>;
  readonly saveAuctionValuationRun: (
    artifact: AuctionValuationArtifactInput,
  ) => Effect.Effect<SaveAuctionValuationRunResult, Error>;
}

export const planAuctionValuationRun = (input: AuctionValuationInputs): AuctionValuationArtifact =>
  buildAuctionValuationArtifact({
    current: {
      baseBudgetCents: input.league.baseBudgetCents,
      players: input.projection.players,
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

export const commitAuctionValuationRun = <Error>(
  artifact: AuctionValuationArtifact,
  committer: Pick<AuctionValuationCommitter<Error>, 'saveAuctionValuationRun'>,
) => committer.saveAuctionValuationRun(artifact);

export const promoteAuctionValuationRun = <Error>(
  runId: string,
  actorId: string,
  committer: Pick<AuctionValuationCommitter<Error>, 'promoteAuctionValuationRun'>,
) => {
  if (runId.trim() === '') return Effect.die(new Error('Promotion requires a run ID'));
  if (actorId.trim() === '') return Effect.die(new Error('Promotion requires an actor ID'));
  return committer.promoteAuctionValuationRun(runId.trim(), actorId.trim());
};
