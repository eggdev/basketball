import {
  buildAuctionValuationArtifact,
  buildAuctionValuationLab,
  type AuctionValuationArtifact,
  type AuctionValuationLab,
  type LeagueStructure,
} from '@fantasy-basketball/fantasy';
import type {
  AuctionValuationRun,
  HistoricalRankingSnapshot,
  LatestProjectionSnapshot,
  PreDraftWorkspace,
  SeasonCalendarReadModel,
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
  readonly calendar: SeasonCalendarReadModel;
  readonly league: NonNullable<PreDraftWorkspace['league']>;
  readonly leagueFormat: LeagueStructure;
  readonly projection: LatestProjectionSnapshot;
  readonly rankings: HistoricalRankingSnapshot;
  readonly streamingSlotsPerTeam: number;
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
    productionValue: {
      leagueFormat: {
        fingerprint: input.leagueFormat.fingerprint,
        lineupSlots: input.leagueFormat.lineupSlots,
        version: input.leagueFormat.version,
      },
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
        asOf: input.calendar.fantraxCapturedAt,
        fantasyPeriods: input.calendar.fantasyPeriods.map((period) => ({
          endAt: period.endAt,
          label:
            period.phase === 'regular-season'
              ? `Scoring period ${period.scoringPeriod}`
              : period.playoffRound === 'final'
                ? 'Championship'
                : period.playoffRound === 'semifinal'
                  ? 'Semifinal'
                  : period.playoffRound === 'quarterfinal'
                    ? 'Quarterfinal'
                    : 'Playoffs',
          phase: period.phase,
          scoringPeriod: period.scoringPeriod,
          startAt: period.startAt,
          weight:
            period.phase === 'regular-season'
              ? 1
              : period.playoffRound === 'final'
                ? 1.5
                : period.playoffRound === 'quarterfinal'
                  ? 0.75
                  : 1,
        })),
        fingerprint: input.calendar.fingerprint,
        games: input.calendar.games,
        snapshotId: input.calendar.nbaScheduleSnapshotId,
      },
      streamingSlotsPerTeam: input.streamingSlotsPerTeam,
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
