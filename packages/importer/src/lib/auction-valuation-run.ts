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
  readonly leagueFormat: {
    readonly fingerprint: string;
    readonly lineupSlots: ReadonlyArray<{
      readonly code: 'C' | 'F' | 'FLX' | 'G' | 'PF' | 'PG' | 'SF' | 'SG';
      readonly eligiblePositions: ReadonlyArray<'C' | 'PF' | 'PG' | 'SF' | 'SG'>;
      readonly label: string;
      readonly maxActive: number;
      readonly minActive: number;
    }>;
    readonly version: number;
  };
  readonly projection: {
    readonly asOf: string;
    readonly modelVersion: string;
    readonly players: ReadonlyArray<{
      readonly fantasyPoints: number;
      readonly fantasyPointsPerGame: number;
      readonly availability: { readonly rate: number };
      readonly playerId: string;
      readonly playerName: string;
      readonly positions: ReadonlyArray<string>;
      readonly rank: number;
      readonly teamAbbreviation: string;
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
  readonly seasonCalendar: {
    readonly fantraxCapturedAt: string;
    readonly fingerprint: string;
    readonly games: ReadonlyArray<{
      readonly awayTeam: string;
      readonly date: string;
      readonly homeTeam: string;
      readonly postponed: boolean;
      readonly scheduledAt: string;
    }>;
    readonly nbaScheduleSnapshotId: string;
    readonly fantasyPeriods: ReadonlyArray<{
      readonly endAt: string;
      readonly phase: 'playoffs' | 'regular-season';
      readonly playoffRound: 'final' | 'quarterfinal' | 'semifinal' | null;
      readonly scoringPeriod: number;
      readonly startAt: string;
    }>;
    readonly seasonKey: string;
  };
  readonly streamingSlotsPerTeam: number;
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

export const planAuctionValuationRun = (
  input: AuctionValuationInputs,
): AuctionValuationArtifact => {
  if (input.league.seasonKey !== input.projection.seasonKey) {
    throw new Error('League season does not match projection season');
  }
  if (input.seasonCalendar.seasonKey !== input.projection.seasonKey) {
    throw new Error('Season calendar does not match projection season');
  }
  return buildAuctionValuationArtifact({
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
    productionValue: {
      leagueFormat: input.leagueFormat,
      players: input.projection.players.map((player) => ({
        availabilityRate: player.availability.rate,
        fantasyPoints: player.fantasyPoints,
        fantasyPointsPerGame: player.fantasyPointsPerGame,
        playerId: player.playerId,
        playerName: player.playerName,
        positions: player.positions,
        projectionRank: player.rank,
        teamAbbreviation: player.teamAbbreviation,
      })),
      seasonCalendar: {
        asOf: input.seasonCalendar.fantraxCapturedAt,
        fingerprint: input.seasonCalendar.fingerprint,
        games: input.seasonCalendar.games,
        playoffPeriods: input.seasonCalendar.fantasyPeriods.flatMap((period) =>
          period.phase === 'playoffs' && period.playoffRound !== null
            ? [
                {
                  endAt: period.endAt,
                  label:
                    period.playoffRound === 'final'
                      ? 'Championship'
                      : period.playoffRound === 'semifinal'
                        ? 'Semifinal'
                        : 'Quarterfinal',
                  scoringPeriod: period.scoringPeriod,
                  startAt: period.startAt,
                  weight:
                    period.playoffRound === 'final'
                      ? 1.5
                      : period.playoffRound === 'semifinal'
                        ? 1
                        : 0.75,
                },
              ]
            : [],
        ),
        snapshotId: input.seasonCalendar.nbaScheduleSnapshotId,
      },
      streamingSlotsPerTeam: input.streamingSlotsPerTeam,
    },
  });
};

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
