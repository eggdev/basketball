import { randomUUID } from 'node:crypto';

import { PgClient } from '@effect/sql-pg';
import { attachDatabasePool } from '@vercel/functions';
import { Context, Data, Effect, Layer, Redacted } from 'effect';
import { Pool } from 'pg';

import {
  makePlayerIdentityMergePreview,
  planPlayerIdentityMergeCommit,
  PLAYER_IDENTITY_MERGE_REFERENCE_TABLES,
  resolvePlayerIdentityMergePlayers,
  validatePlayerIdentityMergeInput,
  type PlayerIdentityMergeInput,
  type PlayerIdentityMergePreview,
} from './player-identity-reconciliation';

export type {
  PlayerIdentityMergeConflict,
  PlayerIdentityMergeInput,
  PlayerIdentityMergePreview,
} from './player-identity-reconciliation';

export interface DatabaseConfig {
  readonly applicationUrl: Redacted.Redacted<string>;
  readonly migrationUrl: Redacted.Redacted<string>;
}

export class DatabaseConfigurationError extends Data.TaggedError('DatabaseConfigurationError')<{
  readonly message: string;
  readonly variable: 'DATABASE_URL' | 'DATABASE_URL_UNPOOLED';
  readonly reason: string;
}> {}

export class DatabaseUnavailable extends Data.TaggedError('DatabaseUnavailable')<{
  readonly message: string;
  readonly operation:
    | 'canonical_player_identities'
    | 'canonical_players'
    | 'health'
    | 'historical_auction_market'
    | 'historical_rankings'
    | 'latest_adp_snapshot'
    | 'latest_season_calendar'
    | 'latest_projection_snapshot'
    | 'auction_valuation_run'
    | 'promoted_auction_valuation_run'
    | 'league_performance_history'
    | 'league_roster_activity'
    | 'league_roster_snapshot'
    | 'pre_draft_workspace'
    | 'preview_player_identity_merge'
    | 'reconcile_league_team_identity'
    | 'league_team_history'
    | 'replace_historical_auctions'
    | 'player_production_history'
    | 'replace_historical_scoring'
    | 'replace_player_production'
    | 'merge_player_identities'
    | 'save_fantrax_adp_snapshot'
    | 'save_league_performance'
    | 'save_league_roster_history'
    | 'save_pre_draft_plan'
    | 'save_pre_draft_target'
    | 'save_projection_snapshot'
    | 'save_season_calendar'
    | 'save_auction_valuation_run'
    | 'promote_auction_valuation_run';
  readonly reason?: string;
}> {}

export interface DatabaseHealth {
  readonly status: 'ready';
  readonly databaseTime: string;
}

export interface HistoricalAuctionBatch {
  readonly auctions: ReadonlyArray<{
    readonly amountCents: number;
    readonly draftedAtMs: number;
    readonly fantraxPick: number;
    readonly fantraxPlayerId: string;
    readonly leagueId: string;
    readonly managerLabel: string | null;
    readonly rosterSlot: number | null;
    readonly seasonKey: string;
    readonly sourcePayload: Readonly<Record<string, string>>;
    readonly teamId: string;
    readonly teamName: string;
  }>;
  readonly fingerprint: string;
  readonly leagueMembers: ReadonlyArray<{
    readonly canonicalKey: string;
    readonly displayName: string;
    readonly leagueHistoryId: string;
  }>;
  readonly leagueTeams: ReadonlyArray<{
    readonly division: string | null;
    readonly identityConfidence: number;
    readonly identityResolution: string;
    readonly leagueHistoryId: string;
    readonly leagueId: string;
    readonly managerLabel: string | null;
    readonly memberKey: string | null;
    readonly seasonKey: string;
    readonly sourceTeamId: string;
    readonly teamName: string;
  }>;
  readonly players: ReadonlyArray<{
    readonly canonicalName: string;
    readonly fantraxId: string;
    readonly normalizedName: string;
  }>;
  readonly seasons: ReadonlyArray<{
    readonly baseBudgetCents: number;
    readonly leagueHistoryId: string;
    readonly leagueId: string;
    readonly rosterSize: number;
    readonly seasonKey: string;
    readonly status: string;
    readonly teamCount: number;
  }>;
  readonly warningCount: number;
}

export interface HistoricalAuctionImportResult {
  readonly auctionCount: number;
  readonly canonicalMemberCount: number;
  readonly ingestionRunId: string;
  readonly leagueTeamSeasonCount: number;
  readonly playerCount: number;
  readonly seasonCount: number;
  readonly unresolvedTeamSeasonCount: number;
}

export interface HistoricalAuctionMarketPlayer {
  readonly averagePriceCents: number;
  readonly expectedPriceCents: number;
  readonly fantraxId: string;
  readonly latestPriceCents: number;
  readonly latestSeason: string;
  readonly maximumPriceCents: number;
  readonly minimumPriceCents: number;
  readonly name: string;
  readonly playerId: string;
  readonly previousPriceCents: number | null;
  readonly seasonsDrafted: number;
  readonly trendCents: number | null;
}

export interface HistoricalAuctionMarket {
  readonly players: ReadonlyArray<HistoricalAuctionMarketPlayer>;
  readonly summary: {
    readonly latestSeason: string | null;
    readonly playerCount: number;
    readonly purchaseCount: number;
    readonly seasonCount: number;
    readonly totalSpendCents: number;
  };
}

export interface HistoricalRankingPlayer {
  readonly auctionCostCents: number | null;
  readonly components: Readonly<Record<string, number>>;
  readonly fantasyPoints: number;
  readonly fantasyPointsPerGame: number;
  readonly gamesPlayed: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly rank: number;
}

export interface HistoricalRankingAuctionPlayer {
  readonly auctionCostCents: number;
  readonly playerId: string;
  readonly playerName: string;
}

export interface HistoricalRankingSeason {
  readonly auctionPlayers: ReadonlyArray<HistoricalRankingAuctionPlayer>;
  readonly baseBudgetCents: number;
  readonly modelVersion: string;
  readonly players: ReadonlyArray<HistoricalRankingPlayer>;
  readonly rosterSize: number;
  readonly ruleSetName: string;
  readonly ruleSetVersion: number;
  readonly seasonKey: string;
  readonly teamCount: number;
}

export interface HistoricalRankingSnapshot {
  readonly seasons: ReadonlyArray<HistoricalRankingSeason>;
  readonly summary: {
    readonly latestSeason: string | null;
    readonly playerSeasonCount: number;
    readonly seasonCount: number;
  };
}

export interface PlayerProjectionReadModel {
  readonly availability: {
    readonly expectedGames: number;
    readonly expectedGamesMissed: number;
    readonly rate: number;
    readonly scheduledGames: number;
    readonly tier: 'durable' | 'managed' | 'fragile';
  };
  readonly bonuses: {
    readonly doubleDoubleRate: number;
    readonly expectedDoubleDoubles: number;
    readonly expectedTripleDoubles: number;
    readonly tripleDoubleRate: number;
  };
  readonly fantasyPoints: number;
  readonly fantasyPointsPerGame: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly positions: ReadonlyArray<string>;
  readonly rank: number;
  readonly schedule: {
    readonly fantasyPlayoffWeeks: ReadonlyArray<{
      readonly expectedActiveGames: number;
      readonly expectedFantasyPoints: number;
      readonly endAt?: string;
      readonly label: string;
      readonly playoffRound?: 'final' | 'quarterfinal' | 'semifinal';
      readonly scheduledGames: number;
      readonly scoringPeriod?: number;
      readonly startAt?: string;
      readonly weight: number;
      readonly weekKey: string;
    }>;
    readonly weightedExpectedGames: number;
    readonly weightedExpectedPoints: number;
  } | null;
  readonly teamAbbreviation: string;
}

export interface LatestProjectionSnapshot {
  readonly asOf: string;
  readonly calendar?: {
    readonly asOf: string;
    readonly fingerprint: string;
    readonly playoffPeriods: ReadonlyArray<{
      readonly endAt: string;
      readonly label: string;
      readonly scoringPeriod: number;
      readonly startAt: string;
    }>;
    readonly snapshotId: string;
    readonly status: 'current' | 'stale';
  } | null;
  readonly createdAt: string;
  readonly modelVersion: string;
  readonly players: ReadonlyArray<PlayerProjectionReadModel>;
  readonly seasonKey: string;
  readonly snapshotId: string;
  readonly source: string;
  readonly summary: {
    readonly durablePlayerCount: number;
    readonly fragilePlayerCount: number;
    readonly playerCount: number;
  };
}

export interface LeagueTeamHistoryFavoritePlayer {
  readonly averagePriceCents: number;
  readonly draftCount: number;
  readonly latestSeason: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly totalSpendCents: number;
}

export interface LeagueTeamHistorySeason {
  readonly averagePriceCents: number;
  readonly identityConfidence: number;
  readonly identityResolution: string;
  readonly purchaseCount: number;
  readonly seasonKey: string;
  readonly sourceTeamId: string;
  readonly teamName: string;
  readonly totalSpendCents: number;
}

export interface LeagueTeamHistoryMember {
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly favoritePlayers: ReadonlyArray<LeagueTeamHistoryFavoritePlayer>;
  readonly memberId: string;
  readonly purchaseCount: number;
  readonly seasons: ReadonlyArray<LeagueTeamHistorySeason>;
  readonly teamNames: ReadonlyArray<string>;
  readonly totalSpendCents: number;
}

export interface LeagueTeamHistory {
  readonly members: ReadonlyArray<LeagueTeamHistoryMember>;
  readonly summary: {
    readonly canonicalMemberCount: number;
    readonly latestSeason: string | null;
    readonly resolvedTeamSeasonCount: number;
    readonly seasonCount: number;
    readonly teamSeasonCount: number;
    readonly unresolvedTeamSeasonCount: number;
  };
  readonly unresolvedTeams: ReadonlyArray<{
    readonly seasonKey: string;
    readonly sourceTeamId: string;
    readonly teamSeasonId: string;
    readonly teamName: string;
  }>;
}

export type LeaguePostseasonResult =
  | 'champion'
  | 'missed-playoffs'
  | 'playoff-qualifier'
  | 'quarterfinalist'
  | 'runner-up'
  | 'semifinalist';

export interface LeaguePerformanceWeeklyScore {
  readonly gamesPlayed: number;
  readonly opponentName: string;
  readonly opponentScore: number;
  readonly phase: 'playoffs' | 'regular-season';
  readonly playoffRound: 'final' | 'quarterfinal' | 'semifinal' | null;
  readonly result: 'loss' | 'tie' | 'win';
  readonly score: number;
  readonly scoringPeriod: number;
}

export interface LeaguePerformanceTeam {
  readonly allPlayWinPercentage: number;
  readonly averageActiveGames: number;
  readonly averageOpponentScore: number;
  readonly averageWeeklyScore: number;
  readonly expectedWins: number;
  readonly gamesBack: number;
  readonly highScore: number;
  readonly leagueMemberId: string | null;
  readonly lowScore: number;
  readonly luckWins: number;
  readonly managerName: string | null;
  readonly madePlayoffs: boolean;
  readonly pointsFor: number;
  readonly pointsPerActiveGame: number;
  readonly postseasonFinish: number | null;
  readonly postseasonResult: LeaguePostseasonResult;
  readonly rank: number;
  readonly record: string;
  readonly scoreStandardDeviation: number;
  readonly sourceTeamId: string;
  readonly teamName: string;
  readonly teamSeasonId: string;
  readonly weeklyScores: ReadonlyArray<LeaguePerformanceWeeklyScore>;
  readonly winPercentage: number;
}

export interface LeaguePerformanceSeason {
  readonly champion: {
    readonly managerName: string | null;
    readonly teamName: string;
  } | null;
  readonly firstPlayoffPeriod: number | null;
  readonly lastRegularSeasonPeriod: number;
  readonly playoffTeamCount: number;
  readonly scoringType: string;
  readonly seasonKey: string;
  readonly teams: ReadonlyArray<LeaguePerformanceTeam>;
}

export interface LeaguePerformanceHistory {
  readonly seasons: ReadonlyArray<LeaguePerformanceSeason>;
  readonly summary: {
    readonly latestSeason: string | null;
    readonly matchupCount: number;
    readonly seasonCount: number;
    readonly teamSeasonCount: number;
  };
}

export interface LeaguePerformanceBatch {
  readonly fingerprint: string;
  readonly matchups: ReadonlyArray<{
    readonly awayCategoryTotals: Readonly<Record<string, unknown>>;
    readonly awayGamesPlayed: number;
    readonly awayScore: number;
    readonly awayTeamId: string;
    readonly awayTeamName: string;
    readonly homeCategoryTotals: Readonly<Record<string, unknown>>;
    readonly homeGamesPlayed: number;
    readonly homeScore: number;
    readonly homeTeamId: string;
    readonly homeTeamName: string;
    readonly isTie: boolean;
    readonly leagueId: string;
    readonly periodEndAt: string;
    readonly periodStartAt: string;
    readonly phase: 'playoffs' | 'regular-season';
    readonly playoffRound: 'final' | 'quarterfinal' | 'semifinal' | null;
    readonly scoringPeriod: number;
    readonly seasonKey: string;
    readonly sourcePayload: Readonly<Record<string, unknown>>;
    readonly winnerTeamId: string | null;
  }>;
  readonly seasons: ReadonlyArray<{
    readonly finalScoringPeriod: number;
    readonly firstPlayoffPeriod: number | null;
    readonly lastRegularSeasonPeriod: number;
    readonly leagueHistoryId: string;
    readonly leagueId: string;
    readonly playoffTeamCount: number;
    readonly scoringType: string;
    readonly seasonKey: string;
  }>;
  readonly source: 'fantrax-league-performance';
  readonly standings: ReadonlyArray<{
    readonly gamesBack: number;
    readonly leagueId: string;
    readonly losses: number;
    readonly madePlayoffs: boolean;
    readonly playoffSeed: number | null;
    readonly pointsFor: number;
    readonly postseasonFinish: number | null;
    readonly postseasonResult: LeaguePostseasonResult;
    readonly rank: number;
    readonly record: string;
    readonly seasonKey: string;
    readonly sourcePayload: Readonly<Record<string, unknown>>;
    readonly sourceTeamId: string;
    readonly teamName: string;
    readonly ties: number;
    readonly winPercentage: number;
    readonly wins: number;
  }>;
}

export interface LeaguePerformanceImportResult {
  readonly alreadyImported: boolean;
  readonly ingestionRunId: string;
  readonly matchupCount: number;
  readonly seasonCount: number;
  readonly standingCount: number;
}

export type InferredRosterChangeType = 'add' | 'drop' | 'team-change';

export interface LeagueRosterHistoryBatch {
  readonly changes: ReadonlyArray<{
    readonly changeType: InferredRosterChangeType;
    readonly fantraxId: string;
    readonly fromPosition: string | null;
    readonly fromStatus: string | null;
    readonly fromTeamId: string | null;
    readonly leagueId: string;
    readonly observedAt: string;
    readonly previousRosterPeriod: number;
    readonly rosterPeriod: number;
    readonly seasonKey: string;
    readonly toPosition: string | null;
    readonly toStatus: string | null;
    readonly toTeamId: string | null;
  }>;
  readonly fingerprint: string;
  readonly players: ReadonlyArray<{
    readonly canonicalName: string;
    readonly fantraxId: string;
    readonly normalizedName: string;
    readonly sourceName: string;
  }>;
  readonly seasons: ReadonlyArray<{
    readonly baselineRosterPeriod: number;
    readonly leagueHistoryId: string;
    readonly leagueId: string;
    readonly seasonKey: string;
  }>;
  readonly snapshots: ReadonlyArray<{
    readonly entries: ReadonlyArray<{
      readonly fantraxId: string;
      readonly position: string;
      readonly sourceTeamId: string;
      readonly status: string;
    }>;
    readonly leagueId: string;
    readonly periodEndAt: string;
    readonly periodStartAt: string;
    readonly rosterPeriod: number;
    readonly seasonKey: string;
    readonly sourcePayload: Readonly<Record<string, unknown>>;
  }>;
  readonly source: 'fantrax-roster-history';
}

export interface LeagueRosterHistoryImportResult {
  readonly alreadyImported: boolean;
  readonly changeCount: number;
  readonly ingestionRunId: string;
  readonly newPlayerCount: number;
  readonly playerCount: number;
  readonly seasonCount: number;
  readonly snapshotCount: number;
  readonly snapshotEntryCount: number;
}

export interface LeagueRosterActivityChange {
  readonly changeType: InferredRosterChangeType;
  readonly fromTeam: {
    readonly managerName: string | null;
    readonly teamName: string;
    readonly teamSeasonId: string;
  } | null;
  readonly observedAt: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly previousRosterPeriod: number;
  readonly rosterPeriod: number;
  readonly toTeam: {
    readonly managerName: string | null;
    readonly teamName: string;
    readonly teamSeasonId: string;
  } | null;
}

export interface LeagueRosterActivityTeam {
  readonly addCount: number;
  readonly departureCount: number;
  readonly dropCount: number;
  readonly leagueMemberId: string | null;
  readonly managerName: string | null;
  readonly outcome: {
    readonly madePlayoffs: boolean;
    readonly postseasonResult: LeaguePostseasonResult;
    readonly rank: number;
  } | null;
  readonly teamName: string;
  readonly teamSeasonId: string;
  readonly totalAcquisitionCount: number;
  readonly transferInCount: number;
  readonly transferOutCount: number;
}

export interface LeagueRosterActivitySeason {
  readonly baselineRosterPeriod: number;
  readonly changeCount: number;
  readonly changes: ReadonlyArray<LeagueRosterActivityChange>;
  readonly entryCount: number;
  readonly seasonKey: string;
  readonly snapshotCount: number;
  readonly teams: ReadonlyArray<LeagueRosterActivityTeam>;
}

export interface LeagueRosterActivityHistory {
  readonly seasons: ReadonlyArray<LeagueRosterActivitySeason>;
  readonly summary: {
    readonly changeCount: number;
    readonly latestSeason: string | null;
    readonly seasonCount: number;
    readonly snapshotCount: number;
  };
}

export interface LeagueRosterPlayer {
  readonly auctionCostCents: number;
  readonly nominationOrder: number | null;
  readonly playerId: string;
  readonly playerName: string;
  readonly rosterSlot: number | null;
}

export interface LeagueRosterTeam {
  readonly baseBudgetBalanceCents: number;
  readonly division: string | null;
  readonly owner: {
    readonly displayName: string;
    readonly memberId: string;
  } | null;
  readonly roster: ReadonlyArray<LeagueRosterPlayer>;
  readonly rosterCount: number;
  readonly sourceTeamId: string;
  readonly spendCents: number;
  readonly teamName: string;
  readonly teamSeasonId: string;
}

export interface LeagueRosterSeason {
  readonly baseBudgetCents: number;
  readonly draftedPlayerCount: number;
  readonly name: string;
  readonly rosterSize: number;
  readonly rosterStatus: 'complete' | 'empty' | 'partial';
  readonly seasonKey: string;
  readonly teamCount: number;
  readonly teams: ReadonlyArray<LeagueRosterTeam>;
  readonly totalSpendCents: number;
}

export interface LeagueRosterSnapshot {
  readonly seasons: ReadonlyArray<LeagueRosterSeason>;
  readonly summary: {
    readonly latestPopulatedSeason: string | null;
    readonly latestSeason: string | null;
    readonly seasonCount: number;
  };
}

export type LeagueTeamReconciliationTarget =
  | {
      readonly displayName?: string;
      readonly kind: 'existing';
      readonly memberId: string;
    }
  | {
      readonly displayName: string;
      readonly kind: 'new';
    };

export interface LeagueTeamReconciliationInput {
  readonly resolvedByUserId: string;
  readonly target: LeagueTeamReconciliationTarget;
  readonly teamSeasonIds: ReadonlyArray<string>;
}

export interface LeagueTeamReconciliationResult {
  readonly displayName: string;
  readonly memberId: string;
  readonly resolvedTeamSeasonCount: number;
}

export interface CanonicalPlayerIdentity {
  readonly canonicalName: string;
  readonly fantraxId: string;
  readonly normalizedName: string;
  readonly playerId: string;
}

export interface CanonicalPlayer {
  readonly canonicalName: string;
  readonly normalizedName: string;
  readonly playerId: string;
}

export interface PlayerIdentityMergeResult {
  readonly auditId: string;
  readonly movedReferenceCounts: Readonly<Record<string, number>>;
}

export interface PlayerProductionBatch {
  readonly fingerprint: string;
  readonly gameStatCount: number;
  readonly identities: ReadonlyArray<{
    readonly fantraxId: string;
    readonly providerPlayerId: string;
    readonly providerPlayerName: string;
  }>;
  readonly records: ReadonlyArray<{
    readonly fantraxId: string;
    readonly gamesPlayed: number;
    readonly period: 'regular-season';
    readonly providerPlayerId: string;
    readonly providerPlayerName: string;
    readonly seasonKey: string;
    readonly sourcePayload: Readonly<Record<string, unknown>>;
    readonly stats: Readonly<Record<string, number | null>>;
  }>;
  readonly seasons: ReadonlyArray<string>;
}

export interface PlayerProductionImportResult {
  readonly ingestionRunId: string;
  readonly playerCount: number;
  readonly playerSeasonCount: number;
  readonly seasonCount: number;
}

export interface PlayerProductionHistoryRecord {
  readonly gamesPlayed: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly seasonKey: string;
  readonly stats: Readonly<Record<string, number | null>>;
}

export interface SeasonCalendarBatch {
  readonly fantraxCapturedAt: string;
  readonly fantasyPeriods: ReadonlyArray<{
    readonly endAt: string;
    readonly phase: 'playoffs' | 'regular-season';
    readonly playoffRound: 'final' | 'quarterfinal' | 'semifinal' | null;
    readonly scoringPeriod: number;
    readonly startAt: string;
  }>;
  readonly fingerprint: string;
  readonly games: ReadonlyArray<{
    readonly awayTeam: string;
    readonly date: string;
    readonly homeTeam: string;
    readonly postponed: boolean;
    readonly providerGameId: string;
    readonly scheduledAt: string;
    readonly seasonStartYear: number;
    readonly seasonType: 'regular';
    readonly sourcePayload: Readonly<Record<string, unknown>>;
    readonly status: string;
  }>;
  readonly leagueId: string;
  readonly nbaSourceId: string;
  readonly seasonKey: string;
}

export interface SeasonCalendarImportResult {
  readonly alreadyImported: boolean;
  readonly gameCount: number;
  readonly ingestionRunId: string;
  readonly periodCount: number;
  readonly snapshotId: string;
}

export interface SeasonCalendarReadModel {
  readonly fantraxCapturedAt: string;
  readonly fantasyPeriods: SeasonCalendarBatch['fantasyPeriods'];
  readonly fingerprint: string;
  readonly games: ReadonlyArray<Omit<SeasonCalendarBatch['games'][number], 'sourcePayload'>>;
  readonly leagueId: string;
  readonly nbaScheduleSnapshotId: string;
  readonly schedulesByTeam: Readonly<
    Record<
      string,
      {
        readonly fantasyPlayoffWeeks: ReadonlyArray<{
          readonly endAt: string;
          readonly label: string;
          readonly playoffRound: 'final' | 'quarterfinal' | 'semifinal';
          readonly scheduledGames: number;
          readonly scoringPeriod: number;
          readonly startAt: string;
          readonly weight: number;
          readonly weekKey: string;
        }>;
        readonly regularSeasonScheduledGames: number;
      }
    >
  >;
  readonly seasonKey: string;
}

const playoffPeriodLabel = (
  round: NonNullable<SeasonCalendarBatch['fantasyPeriods'][number]['playoffRound']>,
) => (round === 'final' ? 'Championship' : round === 'semifinal' ? 'Semifinal' : 'Quarterfinal');

const playoffPeriodWeight = (
  round: NonNullable<SeasonCalendarBatch['fantasyPeriods'][number]['playoffRound']>,
) => (round === 'final' ? 1.5 : round === 'semifinal' ? 1 : 0.75);

export const validateSeasonCalendarBatch = (batch: SeasonCalendarBatch): void => {
  if (!/^[a-f0-9]{64}$/.test(batch.fingerprint)) {
    throw new Error('season calendar fingerprint must be SHA-256');
  }
  if (!/^\d{4}-\d{2}$/.test(batch.seasonKey)) throw new Error('invalid season calendar season');
  if (batch.games.length === 0) throw new Error('season calendar requires games');
  if (batch.fantasyPeriods.length === 0)
    throw new Error('season calendar requires scoring periods');
  if (new Set(batch.games.map((game) => game.providerGameId)).size !== batch.games.length) {
    throw new Error('season calendar game IDs must be unique');
  }
  if (
    new Set(batch.fantasyPeriods.map((period) => period.scoringPeriod)).size !==
    batch.fantasyPeriods.length
  ) {
    throw new Error('season calendar scoring periods must be unique');
  }
};

export const buildSeasonCalendarReadModel = (input: {
  readonly fantraxCapturedAt: string;
  readonly fantasyPeriods: SeasonCalendarBatch['fantasyPeriods'];
  readonly fingerprint: string;
  readonly games: SeasonCalendarReadModel['games'];
  readonly leagueId: string;
  readonly nbaScheduleSnapshotId: string;
  readonly seasonKey: string;
}): SeasonCalendarReadModel => {
  const teams = new Set(input.games.flatMap((game) => [game.homeTeam, game.awayTeam]));
  const schedulesByTeam = Object.fromEntries(
    [...teams].sort().map((team) => {
      const games = input.games.filter((game) => game.homeTeam === team || game.awayTeam === team);
      return [
        team,
        {
          fantasyPlayoffWeeks: input.fantasyPeriods.flatMap((period) => {
            if (period.phase !== 'playoffs' || period.playoffRound === null) return [];
            return [
              {
                endAt: period.endAt,
                label: playoffPeriodLabel(period.playoffRound),
                playoffRound: period.playoffRound,
                scheduledGames: games.filter((game) => {
                  const scheduledAt = Date.parse(game.scheduledAt);
                  return (
                    scheduledAt >= Date.parse(period.startAt) &&
                    scheduledAt <= Date.parse(period.endAt)
                  );
                }).length,
                scoringPeriod: period.scoringPeriod,
                startAt: period.startAt,
                weight: playoffPeriodWeight(period.playoffRound),
                weekKey: `period-${period.scoringPeriod}`,
              },
            ];
          }),
          regularSeasonScheduledGames: games.length,
        },
      ] as const;
    }),
  );
  return { ...input, schedulesByTeam };
};

export interface HistoricalScoringBatch {
  readonly fingerprint: string;
  readonly name: string;
  readonly rankings: ReadonlyArray<{
    readonly components: Readonly<Record<string, number>>;
    readonly fantasyPoints: number;
    readonly fantasyPointsPerGame: number;
    readonly gamesPlayed: number;
    readonly playerId: string;
    readonly playerName: string;
    readonly rank: number;
    readonly seasonKey: string;
  }>;
  readonly rules: ReadonlyArray<{
    readonly label: string;
    readonly points: number;
    readonly statKey: string;
  }>;
  readonly seasons: ReadonlyArray<string>;
  readonly stackTripleDoubleBonuses: boolean;
  readonly version: number;
}

export interface HistoricalScoringImportResult {
  readonly ingestionRunId: string;
  readonly rankingCount: number;
  readonly ruleSetCount: number;
  readonly seasonCount: number;
}

export interface ProjectionSnapshotBatch {
  readonly asOf: string;
  readonly calendar: {
    readonly fingerprint: string;
    readonly snapshotId: string;
  } | null;
  readonly fingerprint: string;
  readonly limitations: ReadonlyArray<string>;
  readonly modelVersion: string;
  readonly records: ReadonlyArray<{
    readonly canonicalName: string;
    readonly existingPlayerId: string | null;
    readonly normalizedName: string;
    readonly projection: {
      readonly availability: {
        readonly expectedGames: number;
        readonly expectedGamesMissed: number;
        readonly rate: number;
        readonly scheduledGames: number;
        readonly tier: 'durable' | 'managed' | 'fragile';
      };
      readonly bonuses: {
        readonly doubleDoubleRate: number;
        readonly expectedDoubleDoubles: number;
        readonly expectedTripleDoubles: number;
        readonly tripleDoubleRate: number;
      };
      readonly fantasyPoints: number;
      readonly fantasyPointsPerGame: number;
      readonly positions: ReadonlyArray<string>;
      readonly schedule: {
        readonly fantasyPlayoffWeeks: ReadonlyArray<{
          readonly expectedActiveGames: number;
          readonly expectedFantasyPoints: number;
          readonly label: string;
          readonly scheduledGames: number;
          readonly weight: number;
          readonly weekKey: string;
        }>;
        readonly weightedExpectedGames: number;
        readonly weightedExpectedPoints: number;
      } | null;
      readonly scoringComponents: Readonly<Record<string, number>>;
      readonly statsPerGame: {
        readonly assists: number;
        readonly blocks: number;
        readonly fieldGoalsAttempted: number;
        readonly fieldGoalsMade: number;
        readonly freeThrowsAttempted: number;
        readonly freeThrowsMade: number;
        readonly points: number;
        readonly rebounds: number;
        readonly steals: number;
        readonly threePointersMade: number;
        readonly turnovers: number;
      };
      readonly teamAbbreviation: string;
    };
    readonly sourceExternalId: string;
    readonly sourceName: string;
    readonly sourcePayload: Readonly<Record<string, string>>;
  }>;
  readonly seasonKey: string;
  readonly source: 'hashtag';
}

export interface ProjectionSnapshotImportResult {
  readonly ingestionRunId: string;
  readonly newPlayerCount: number;
  readonly playerProjectionCount: number;
  readonly snapshotId: string;
}

export interface FantraxAdpSnapshotBatch {
  readonly capturedAt: string;
  readonly fingerprint: string;
  readonly records: ReadonlyArray<{
    readonly adp: number;
    readonly canonicalName: string;
    readonly existingPlayerId: string | null;
    readonly fantraxId: string;
    readonly normalizedName: string;
    readonly position: string;
    readonly sourceName: string;
    readonly sourcePayload: Readonly<Record<string, unknown>>;
  }>;
  readonly seasonKey: string;
  readonly source: 'fantrax-adp';
  readonly sport: 'NBA';
}

export interface FantraxAdpSnapshotImportResult {
  readonly alreadyImported: boolean;
  readonly ingestionRunId: string;
  readonly newPlayerCount: number;
  readonly playerAdpCount: number;
  readonly snapshotId: string;
}

export interface AdpMarketPlayer {
  readonly adp: number;
  readonly fantraxId: string;
  /** Positive values mean the player moved earlier in public drafts. */
  readonly movement: number | null;
  readonly playerId: string;
  readonly playerName: string;
  readonly position: string;
  readonly previousAdp: number | null;
  readonly rank: number;
}

export interface LatestAdpSnapshot {
  readonly capturedAt: string;
  readonly players: ReadonlyArray<AdpMarketPlayer>;
  readonly previousCapturedAt: string | null;
  readonly seasonKey: string;
  readonly snapshotId: string;
  readonly source: string;
  readonly summary: {
    readonly fallerCount: number;
    readonly playerCount: number;
    readonly riserCount: number;
  };
}

export type PreDraftGoal = 'make-playoffs' | 'win-championship';
export type PreDraftRiskTolerance = 'conservative' | 'balanced' | 'aggressive';
export type PreDraftTargetStance = 'avoid' | 'target' | 'watch';

export interface PreDraftPlan {
  readonly anchorBudgetCents: number;
  readonly coreBudgetCents: number;
  readonly endgameBudgetCents: number;
  readonly id: string;
  readonly name: string;
  readonly notes: string;
  readonly primaryGoal: PreDraftGoal;
  readonly riskTolerance: PreDraftRiskTolerance;
  readonly status: string;
  readonly strategyAngle: string;
  readonly streamingSlots: number;
  readonly targets: ReadonlyArray<{
    readonly maxBidCents: number | null;
    readonly playerId: string;
    readonly playerName: string;
    readonly priority: number;
    readonly rationale: string;
    readonly stance: PreDraftTargetStance;
    readonly targetId: string;
  }>;
  readonly updatedAt: string;
}

export interface PreDraftWorkspace {
  readonly league: {
    readonly baseBudgetCents: number;
    readonly rosterSize: number;
    readonly seasonKey: string;
    readonly teamCount: number;
  } | null;
  readonly owner: {
    readonly canonicalKey: string;
    readonly displayName: string;
    readonly memberId: string;
    readonly teamName: string | null;
  } | null;
  readonly plan: PreDraftPlan | null;
}

export interface SavePreDraftPlanInput {
  readonly anchorBudgetCents: number;
  readonly coreBudgetCents: number;
  readonly endgameBudgetCents: number;
  readonly name: string;
  readonly notes: string;
  readonly ownerCanonicalKey: string;
  readonly primaryGoal: PreDraftGoal;
  readonly riskTolerance: PreDraftRiskTolerance;
  readonly seasonKey: string;
  readonly strategyAngle: string;
  readonly streamingSlots: number;
}

export interface SavePreDraftTargetInput {
  readonly maxBidCents: number | null;
  readonly planId: string;
  readonly playerId: string;
  readonly priority: number;
  readonly rationale: string;
  readonly stance: PreDraftTargetStance;
}

export interface AuctionValuationArtifactInput {
  readonly artifactVersion: string;
  readonly candidateResults: ReadonlyArray<unknown>;
  readonly current: {
    readonly players: ReadonlyArray<{
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
    }>;
    readonly seasonKey: string;
  };
  readonly fingerprint: string;
  readonly historicalInputs: {
    readonly fingerprint: string;
    readonly seasonKeys: ReadonlyArray<string>;
  };
  readonly leagueSettings: {
    readonly baseBudgetCents: number;
    readonly rosterSize: number;
    readonly teamCount: number;
  };
  readonly limitations: ReadonlyArray<string>;
  readonly methodology: string;
  readonly modelVersion: string;
  readonly projection: {
    readonly asOf: string;
    readonly modelVersion: string;
    readonly snapshotId: string;
  };
  readonly seasonKey: string;
  readonly selectedModelId: string;
  readonly selectionRule: string;
}

export interface AuctionValuationRun extends AuctionValuationArtifactInput {
  readonly createdAt: string;
  readonly promotedAt: string | null;
  readonly promotedByUserId: string | null;
  readonly runId: string;
  readonly status: 'candidate' | 'promoted' | 'superseded';
}

export interface SaveAuctionValuationRunResult {
  readonly alreadySaved: boolean;
  readonly runId: string;
}

export interface PromoteAuctionValuationRunResult {
  readonly displacedRunId: string | null;
  readonly runId: string;
}

const moneyFields = [
  'fairHighCents',
  'fairLowCents',
  'marketEstimateCents',
  'projectedEdgeCents',
  'projectedValueCents',
] as const;

/** Validates the invariants shared by the SQL adapter and its pure tests. */
export const validateAuctionValuationArtifact = (artifact: AuctionValuationArtifactInput): void => {
  if (!/^[a-f0-9]{64}$/.test(artifact.fingerprint))
    throw new Error('valuation fingerprint must be SHA-256');
  if (!/^[a-f0-9]{64}$/.test(artifact.historicalInputs.fingerprint))
    throw new Error('historical input fingerprint must be SHA-256');
  if (artifact.current.seasonKey !== artifact.seasonKey)
    throw new Error('valuation current season does not match artifact season');
  if (artifact.current.players.length === 0) throw new Error('valuation run is incomplete');
  if (artifact.candidateResults.length === 0)
    throw new Error('valuation run requires candidate results');
  const candidateIds = artifact.candidateResults.map((candidate) => {
    if (candidate === null || typeof candidate !== 'object' || !('id' in candidate))
      throw new Error('valuation candidate requires an ID');
    const id = candidate.id;
    if (typeof id !== 'string' || id.trim() === '')
      throw new Error('valuation candidate requires an ID');
    return id;
  });
  if (!candidateIds.includes(artifact.selectedModelId))
    throw new Error('selected valuation model is absent from candidate results');
  if (new Set(candidateIds).size !== candidateIds.length)
    throw new Error('valuation candidate IDs must be unique');
  const players = new Set<string>();
  const ranks = new Set<number>();
  artifact.current.players.forEach((player) => {
    if (players.has(player.playerId))
      throw new Error(`duplicate valuation player ${player.playerId}`);
    if (ranks.has(player.projectionRank))
      throw new Error(`duplicate valuation rank ${player.projectionRank}`);
    players.add(player.playerId);
    ranks.add(player.projectionRank);
    moneyFields.forEach((field) => {
      if (!Number.isSafeInteger(player[field])) throw new Error(`${field} must be integer cents`);
    });
  });
};

/** Produces JSON text for explicit `::jsonb` casts, including top-level arrays. */
export const serializeAuctionValuationJson = (value: unknown): string => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('auction valuation JSON could not be serialized');
  return serialized;
};

/** Confirms that a candidate contains the complete, exact projection snapshot input. */
export const validateAuctionValuationProjectionLink = (
  artifact: AuctionValuationArtifactInput,
  projection: {
    readonly asOf: string;
    readonly modelVersion: string;
    readonly playerIds: ReadonlyArray<string>;
    readonly seasonKey: string;
  },
): void => {
  if (projection.seasonKey !== artifact.seasonKey)
    throw new Error('Valuation season does not match projection snapshot');
  if (projection.modelVersion !== artifact.projection.modelVersion)
    throw new Error('Valuation projection model does not match projection snapshot');
  const artifactAsOf = Date.parse(artifact.projection.asOf);
  const projectionAsOf = Date.parse(projection.asOf);
  if (
    !Number.isFinite(artifactAsOf) ||
    !Number.isFinite(projectionAsOf) ||
    artifactAsOf !== projectionAsOf
  ) {
    throw new Error('Valuation projection timestamp does not match projection snapshot');
  }
  const artifactPlayers = new Set(artifact.current.players.map((player) => player.playerId));
  const projectionPlayers = new Set(projection.playerIds);
  if (
    artifactPlayers.size !== projectionPlayers.size ||
    [...artifactPlayers].some((playerId) => !projectionPlayers.has(playerId))
  ) {
    throw new Error('Valuation players do not exactly match projection snapshot');
  }
};

export const planAuctionValuationPromotion = (input: {
  readonly actorId: string;
  readonly currentPromotedRunId: string | null;
  readonly playerCount: number;
  readonly projectionSeasonKey: string;
  readonly runId: string;
  readonly seasonKey: string;
  readonly status: AuctionValuationRun['status'];
}): PromoteAuctionValuationRunResult => {
  if (input.actorId.trim() === '') throw new Error('Promotion requires an actor ID');
  if (input.playerCount === 0) throw new Error('Incomplete valuation run');
  if (input.seasonKey !== input.projectionSeasonKey)
    throw new Error('Valuation season does not match projection snapshot');
  return {
    displacedRunId:
      input.status === 'promoted' || input.currentPromotedRunId === input.runId
        ? null
        : input.currentPromotedRunId,
    runId: input.runId,
  };
};

export interface DatabaseService {
  readonly auctionValuationRun: (
    runId: string,
  ) => Effect.Effect<AuctionValuationRun | null, DatabaseUnavailable>;
  readonly canonicalPlayers: Effect.Effect<ReadonlyArray<CanonicalPlayer>, DatabaseUnavailable>;
  readonly canonicalPlayerIdentities: Effect.Effect<
    ReadonlyArray<CanonicalPlayerIdentity>,
    DatabaseUnavailable
  >;
  readonly health: Effect.Effect<DatabaseHealth, DatabaseUnavailable>;
  readonly historicalAuctionMarket: Effect.Effect<HistoricalAuctionMarket, DatabaseUnavailable>;
  readonly historicalRankings: Effect.Effect<HistoricalRankingSnapshot, DatabaseUnavailable>;
  readonly latestAdpSnapshot: Effect.Effect<LatestAdpSnapshot | null, DatabaseUnavailable>;
  readonly latestSeasonCalendar: (
    seasonKey: string,
  ) => Effect.Effect<SeasonCalendarReadModel | null, DatabaseUnavailable>;
  readonly latestProjectionSnapshot: Effect.Effect<
    LatestProjectionSnapshot | null,
    DatabaseUnavailable
  >;
  readonly leaguePerformanceHistory: Effect.Effect<LeaguePerformanceHistory, DatabaseUnavailable>;
  readonly leagueRosterActivity: Effect.Effect<LeagueRosterActivityHistory, DatabaseUnavailable>;
  readonly leagueRosterSnapshot: Effect.Effect<LeagueRosterSnapshot, DatabaseUnavailable>;
  readonly leagueTeamHistory: Effect.Effect<LeagueTeamHistory, DatabaseUnavailable>;
  readonly preDraftWorkspace: (
    ownerCanonicalKey: string,
    seasonKey?: string,
  ) => Effect.Effect<PreDraftWorkspace, DatabaseUnavailable>;
  readonly promotedAuctionValuationRun: (
    seasonKey: string,
  ) => Effect.Effect<AuctionValuationRun | null, DatabaseUnavailable>;
  readonly promoteAuctionValuationRun: (
    runId: string,
    promotedByUserId: string,
  ) => Effect.Effect<PromoteAuctionValuationRunResult, DatabaseUnavailable>;
  readonly previewPlayerIdentityMerge: (
    input: PlayerIdentityMergeInput,
  ) => Effect.Effect<PlayerIdentityMergePreview, DatabaseUnavailable>;
  readonly mergePlayerIdentities: (
    input: PlayerIdentityMergeInput,
    expectedFingerprint: string,
  ) => Effect.Effect<PlayerIdentityMergeResult, DatabaseUnavailable>;
  readonly reconcileLeagueTeamIdentity: (
    input: LeagueTeamReconciliationInput,
  ) => Effect.Effect<LeagueTeamReconciliationResult, DatabaseUnavailable>;
  readonly playerProductionHistory: Effect.Effect<
    ReadonlyArray<PlayerProductionHistoryRecord>,
    DatabaseUnavailable
  >;
  readonly replaceHistoricalAuctions: (
    batch: HistoricalAuctionBatch,
  ) => Effect.Effect<HistoricalAuctionImportResult, DatabaseUnavailable>;
  readonly replaceHistoricalScoring: (
    batch: HistoricalScoringBatch,
  ) => Effect.Effect<HistoricalScoringImportResult, DatabaseUnavailable>;
  readonly replacePlayerProduction: (
    batch: PlayerProductionBatch,
  ) => Effect.Effect<PlayerProductionImportResult, DatabaseUnavailable>;
  readonly saveProjectionSnapshot: (
    batch: ProjectionSnapshotBatch,
  ) => Effect.Effect<ProjectionSnapshotImportResult, DatabaseUnavailable>;
  readonly saveSeasonCalendar: (
    batch: SeasonCalendarBatch,
  ) => Effect.Effect<SeasonCalendarImportResult, DatabaseUnavailable>;
  readonly saveAuctionValuationRun: (
    artifact: AuctionValuationArtifactInput,
  ) => Effect.Effect<SaveAuctionValuationRunResult, DatabaseUnavailable>;
  readonly saveFantraxAdpSnapshot: (
    batch: FantraxAdpSnapshotBatch,
  ) => Effect.Effect<FantraxAdpSnapshotImportResult, DatabaseUnavailable>;
  readonly saveLeaguePerformance: (
    batch: LeaguePerformanceBatch,
  ) => Effect.Effect<LeaguePerformanceImportResult, DatabaseUnavailable>;
  readonly saveLeagueRosterHistory: (
    batch: LeagueRosterHistoryBatch,
  ) => Effect.Effect<LeagueRosterHistoryImportResult, DatabaseUnavailable>;
  readonly savePreDraftPlan: (
    input: SavePreDraftPlanInput,
  ) => Effect.Effect<PreDraftPlan, DatabaseUnavailable>;
  readonly savePreDraftTarget: (
    input: SavePreDraftTargetInput,
  ) => Effect.Effect<void, DatabaseUnavailable>;
}

export class Database extends Context.Tag('@fantasy-basketball/database/Database')<
  Database,
  DatabaseService
>() {}

type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

const parsePostgresUrl = (
  environment: DatabaseEnvironment,
  variable: DatabaseConfigurationError['variable'],
) =>
  Effect.try({
    try: () => {
      const value = environment[variable];
      if (value === undefined || value.trim() === '') {
        throw new Error('is missing');
      }

      const url = new URL(value);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new Error('must be a PostgreSQL connection URL');
      }
      if (url.hostname === '' || url.pathname === '' || url.pathname === '/') {
        throw new Error('must include a host and database name');
      }

      return { url, value };
    },
    catch: (cause) =>
      new DatabaseConfigurationError({
        message: `${variable} ${cause instanceof Error ? cause.message : 'is invalid'}`,
        variable,
        reason: cause instanceof Error ? cause.message : 'is invalid',
      }),
  });

/**
 * Loads both database roles without exposing either credential as a plain
 * value on the returned object.
 */
export const loadDatabaseConfig = (
  environment: DatabaseEnvironment = process.env,
): Effect.Effect<DatabaseConfig, DatabaseConfigurationError> =>
  Effect.gen(function* () {
    const application = yield* parsePostgresUrl(environment, 'DATABASE_URL');
    const migration = yield* parsePostgresUrl(environment, 'DATABASE_URL_UNPOOLED');

    const isNeonMigration = migration.url.hostname.endsWith('.neon.tech');
    if (isNeonMigration && migration.url.hostname.includes('-pooler.')) {
      return yield* new DatabaseConfigurationError({
        message: 'DATABASE_URL_UNPOOLED must use the direct Neon host, not the pooled host',
        variable: 'DATABASE_URL_UNPOOLED',
        reason: 'must use the direct Neon host, not the pooled host',
      });
    }

    if (application.value === migration.value) {
      return yield* new DatabaseConfigurationError({
        message: 'DATABASE_URL_UNPOOLED must be distinct from the application connection',
        variable: 'DATABASE_URL_UNPOOLED',
        reason: 'must be distinct from the application connection',
      });
    }

    return {
      applicationUrl: Redacted.make(application.value),
      migrationUrl: Redacted.make(migration.value),
    };
  });

const makePool = (config: DatabaseConfig) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const connectionUrl = new URL(Redacted.value(config.applicationUrl));
      if (
        connectionUrl.hostname.endsWith('.neon.tech') &&
        connectionUrl.searchParams.get('sslmode') === 'require'
      ) {
        connectionUrl.searchParams.set('sslmode', 'verify-full');
      }
      const pool = new Pool({
        connectionString: connectionUrl.toString(),
        max: 5,
      });
      attachDatabasePool(pool);
      return pool;
    }),
    (pool) => Effect.promise(() => pool.end()).pipe(Effect.orDie),
  );

const databaseFailureReason = (cause: unknown): string => {
  const messages: string[] = [];
  let current: unknown = cause;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (current instanceof Error && current.message.trim() !== '') messages.push(current.message);
    if (typeof current === 'object') {
      const details = current as Readonly<Record<string, unknown>>;
      for (const key of ['detail', 'where', 'column'] as const) {
        const value = details[key];
        if (typeof value === 'string' && value.trim() !== '') {
          messages.push(value);
        }
      }
    }
    if (typeof current !== 'object' || !('cause' in current)) break;
    current = current.cause;
  }
  return messages.length > 0 ? [...new Set(messages)].join(': ') : String(cause);
};

const databaseUnavailable = (
  operation: DatabaseUnavailable['operation'],
  message: string,
  cause?: unknown,
) =>
  new DatabaseUnavailable({
    message,
    operation,
    ...(cause === undefined ? {} : { reason: databaseFailureReason(cause) }),
  });

const normalizeLeagueMemberKey = (value: string): string =>
  value
    .normalize('NFKD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');

const leagueTeamIdentityKey = (historyId: string, seasonKey: string, sourceTeamId: string) =>
  `${historyId}:${seasonKey}:${sourceTeamId}`;

const databaseServiceLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;

    const canonicalPlayerIdentities = sql<{
      canonical_name: string;
      fantrax_id: string;
      normalized_name: string;
      player_id: string;
    }>`
      select
        p.id as player_id,
        p.canonical_name,
        p.normalized_name,
        pi.external_id as fantrax_id
      from fantasy.players p
      join fantasy.player_identities pi
        on pi.player_id = p.id
        and pi.source = 'fantrax'
      order by p.canonical_name, pi.external_id
    `.pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          canonicalName: row.canonical_name,
          fantraxId: row.fantrax_id,
          normalizedName: row.normalized_name,
          playerId: row.player_id,
        })),
      ),
      Effect.mapError(() =>
        databaseUnavailable(
          'canonical_player_identities',
          'The canonical player identities could not be loaded',
        ),
      ),
    );

    const canonicalPlayers = sql<{
      canonical_name: string;
      normalized_name: string;
      player_id: string;
    }>`
      select
        id as player_id,
        canonical_name,
        normalized_name
      from fantasy.players
      order by canonical_name, id
    `.pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          canonicalName: row.canonical_name,
          normalizedName: row.normalized_name,
          playerId: row.player_id,
        })),
      ),
      Effect.mapError(() =>
        databaseUnavailable('canonical_players', 'The canonical players could not be loaded'),
      ),
    );

    const playerProductionHistory = sql<{
      games_played: number;
      player_id: string;
      player_name: string;
      season_key: string;
      stats: Record<string, number | null>;
    }>`
      select
        pss.games_played,
        pss.player_id,
        p.canonical_name as player_name,
        pss.season_key,
        pss.stats
      from fantasy.player_season_stats pss
      join fantasy.players p on p.id = pss.player_id
      where
        pss.source = 'balldontlie'
        and pss.period = 'regular-season'
        and pss.games_played > 0
      order by pss.season_key, p.canonical_name, pss.player_id
    `.pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          gamesPlayed: row.games_played,
          playerId: row.player_id,
          playerName: row.player_name,
          seasonKey: row.season_key,
          stats: row.stats,
        })),
      ),
      Effect.mapError(() =>
        databaseUnavailable(
          'player_production_history',
          'The player production history could not be loaded',
        ),
      ),
    );

    const historicalRankings = Effect.gen(function* () {
      const rows = yield* sql<{
        auction_cost_cents: number | null;
        base_budget_cents: number;
        components: Record<string, number>;
        fantasy_points: number;
        fantasy_points_per_game: number;
        games_played: number;
        model_version: string;
        player_id: string;
        player_name: string;
        rank: number;
        roster_size: number;
        rule_set_name: string;
        rule_set_version: number;
        season_key: string;
        team_count: number;
      }>`
        with selected_runs as (
          select
            rr.id,
            rr.model_version,
            rr.season_key,
            srs.league_season_id,
            srs.name as rule_set_name,
            srs.version as rule_set_version,
            row_number() over (
              partition by rr.season_key
              order by srs.version desc, rr.created_at desc
            )::integer as run_order
          from fantasy.ranking_runs rr
          join fantasy.scoring_rule_sets srs on srs.id = rr.scoring_rule_set_id
          where rr.model = 'historical-actual'
        )
        select
          sr.season_key,
          sr.model_version,
          sr.rule_set_name,
          sr.rule_set_version,
          ls.team_count,
          ls.roster_size,
          ls.base_budget_cents,
          pr.player_id,
          p.canonical_name as player_name,
          pr.rank,
          pr.projected_points::double precision as fantasy_points,
          pr.projected_points_per_game::double precision as fantasy_points_per_game,
          coalesce((pr.explanation ->> 'gamesPlayed')::integer, 0) as games_played,
          coalesce(pr.explanation -> 'components', '{}'::jsonb) as components,
          ar.amount_cents as auction_cost_cents
        from selected_runs sr
        join fantasy.league_seasons ls on ls.id = sr.league_season_id
        join fantasy.player_rankings pr on pr.ranking_run_id = sr.id
        join fantasy.players p on p.id = pr.player_id
        left join fantasy.auction_results ar
          on ar.league_season_id = sr.league_season_id
          and ar.player_id = pr.player_id
        where sr.run_order = 1
        order by sr.season_key desc, pr.rank, p.canonical_name
      `;
      const auctionRows = yield* sql<{
        auction_cost_cents: number;
        player_id: string;
        player_name: string;
        season_key: string;
      }>`
        select
          ls.season_key,
          ar.player_id,
          p.canonical_name as player_name,
          ar.amount_cents as auction_cost_cents
        from fantasy.auction_results ar
        join fantasy.league_seasons ls on ls.id = ar.league_season_id
        join fantasy.players p on p.id = ar.player_id
        order by ls.season_key desc, ar.amount_cents desc, p.canonical_name
      `;

      const seasonsByKey = new Map<string, HistoricalRankingSeason>();
      for (const row of rows) {
        const player = {
          auctionCostCents: row.auction_cost_cents,
          components: row.components,
          fantasyPoints: row.fantasy_points,
          fantasyPointsPerGame: row.fantasy_points_per_game,
          gamesPlayed: row.games_played,
          playerId: row.player_id,
          playerName: row.player_name,
          rank: row.rank,
        } satisfies HistoricalRankingPlayer;
        const season = seasonsByKey.get(row.season_key);
        if (season === undefined) {
          seasonsByKey.set(row.season_key, {
            auctionPlayers: [],
            baseBudgetCents: row.base_budget_cents,
            modelVersion: row.model_version,
            players: [player],
            rosterSize: row.roster_size,
            ruleSetName: row.rule_set_name,
            ruleSetVersion: row.rule_set_version,
            seasonKey: row.season_key,
            teamCount: row.team_count,
          });
        } else {
          seasonsByKey.set(row.season_key, {
            ...season,
            players: [...season.players, player],
          });
        }
      }
      for (const row of auctionRows) {
        const season = seasonsByKey.get(row.season_key);
        if (season === undefined) continue;
        seasonsByKey.set(row.season_key, {
          ...season,
          auctionPlayers: [
            ...season.auctionPlayers,
            {
              auctionCostCents: row.auction_cost_cents,
              playerId: row.player_id,
              playerName: row.player_name,
            },
          ],
        });
      }

      const seasons = [...seasonsByKey.values()].sort((left, right) =>
        right.seasonKey.localeCompare(left.seasonKey),
      );
      return {
        seasons,
        summary: {
          latestSeason: seasons[0]?.seasonKey ?? null,
          playerSeasonCount: seasons.reduce((total, season) => total + season.players.length, 0),
          seasonCount: seasons.length,
        },
      } satisfies HistoricalRankingSnapshot;
    }).pipe(
      Effect.mapError(() =>
        databaseUnavailable(
          'historical_rankings',
          'The historical fantasy rankings could not be loaded',
        ),
      ),
    );

    const latestSeasonCalendar = (seasonKey: string) =>
      Effect.gen(function* () {
        const [snapshot] = yield* sql<{
          as_of: string;
          fingerprint: string;
          id: string;
          league_id: string;
          season_key: string;
        }>`
          select
            nss.id,
            nss.season_key,
            nss.as_of::text,
            nss.fingerprint,
            ls.source_league_id as league_id
          from fantasy.nba_schedule_snapshots nss
          join fantasy.league_seasons ls on ls.id = nss.league_season_id
          where nss.season_key = ${seasonKey}
          order by nss.as_of desc, nss.created_at desc
          limit 1
        `;
        if (snapshot === undefined) return null;

        const games = yield* sql<{
          away_team: string;
          game_date: string;
          home_team: string;
          postponed: boolean;
          provider_game_id: string;
          scheduled_at: string;
          season_type: 'regular';
          status: string;
        }>`
          select
            provider_game_id,
            game_date,
            scheduled_at::text,
            home_team,
            away_team,
            season_type,
            status,
            postponed
          from fantasy.nba_schedule_games
          where snapshot_id = ${snapshot.id}
          order by scheduled_at, provider_game_id
        `;
        const periods = yield* sql<{
          end_at: string;
          phase: 'playoffs' | 'regular-season';
          playoff_round: 'final' | 'quarterfinal' | 'semifinal' | null;
          scoring_period: number;
          start_at: string;
        }>`
          select
            scoring_period,
            start_at::text,
            end_at::text,
            phase,
            playoff_round
          from fantasy.league_scoring_periods
          where snapshot_id = ${snapshot.id}
          order by scoring_period
        `;
        const startYear = Number(snapshot.season_key.slice(0, 4));
        return buildSeasonCalendarReadModel({
          fantraxCapturedAt: snapshot.as_of,
          fantasyPeriods: periods.map((period) => ({
            endAt: new Date(period.end_at).toISOString(),
            phase: period.phase,
            playoffRound: period.playoff_round,
            scoringPeriod: period.scoring_period,
            startAt: new Date(period.start_at).toISOString(),
          })),
          fingerprint: snapshot.fingerprint,
          games: games.map((game) => ({
            awayTeam: game.away_team,
            date: game.game_date,
            homeTeam: game.home_team,
            postponed: game.postponed,
            providerGameId: game.provider_game_id,
            scheduledAt: new Date(game.scheduled_at).toISOString(),
            seasonStartYear: startYear,
            seasonType: game.season_type,
            status: game.status,
          })),
          leagueId: snapshot.league_id,
          nbaScheduleSnapshotId: snapshot.id,
          seasonKey: snapshot.season_key,
        });
      }).pipe(
        Effect.mapError((cause) =>
          databaseUnavailable(
            'latest_season_calendar',
            'The latest season calendar could not be loaded',
            cause,
          ),
        ),
      );

    const latestProjectionSnapshot = Effect.gen(function* () {
      const [snapshot] = yield* sql<{
        as_of: string;
        created_at: string;
        id: string;
        model_version: string;
        parameters: Record<string, unknown>;
        season_key: string;
        source: string;
      }>`
        select
          id,
          source,
          season_key,
          as_of::text,
          model_version,
          parameters,
          created_at::text
        from fantasy.projection_snapshots
        order by season_key desc, as_of desc, created_at desc
        limit 1
      `;
      if (snapshot === undefined) return null;

      const rows = yield* sql<{
        availability: PlayerProjectionReadModel['availability'];
        bonuses: PlayerProjectionReadModel['bonuses'];
        expected_fantasy_points: number;
        expected_fantasy_points_per_game: number;
        player_id: string;
        player_name: string;
        positions: ReadonlyArray<string>;
        rank: number;
        schedule: PlayerProjectionReadModel['schedule'];
        team_abbreviation: string;
      }>`
        select
          pp.player_id,
          p.canonical_name as player_name,
          pp.team_abbreviation,
          pp.positions,
          pp.expected_fantasy_points::double precision,
          pp.expected_fantasy_points_per_game::double precision,
          pp.bonuses,
          pp.availability,
          pp.schedule,
          row_number() over (
            order by
              pp.expected_fantasy_points desc,
              pp.expected_fantasy_points_per_game desc,
              p.canonical_name
          )::integer as rank
        from fantasy.player_projections pp
        join fantasy.players p on p.id = pp.player_id
        where pp.snapshot_id = ${snapshot.id}
        order by rank
      `;
      const players = rows.map(
        (row): PlayerProjectionReadModel => ({
          availability: row.availability,
          bonuses: row.bonuses,
          fantasyPoints: row.expected_fantasy_points,
          fantasyPointsPerGame: row.expected_fantasy_points_per_game,
          playerId: row.player_id,
          playerName: row.player_name,
          positions: row.positions,
          rank: row.rank,
          schedule: row.schedule,
          teamAbbreviation: row.team_abbreviation,
        }),
      );

      const calendarSnapshotId = snapshot.parameters['calendarSnapshotId'];
      let calendar: LatestProjectionSnapshot['calendar'] = null;
      if (typeof calendarSnapshotId === 'string' && calendarSnapshotId !== '') {
        const [referencedCalendar] = yield* sql<{
          as_of: string;
          fingerprint: string;
          id: string;
          is_latest: boolean;
          season_key: string;
        }>`
          select
            nss.id,
            nss.season_key,
            nss.as_of::text,
            nss.fingerprint,
            nss.id = (
              select latest.id
              from fantasy.nba_schedule_snapshots latest
              where latest.season_key = ${snapshot.season_key}
              order by latest.as_of desc, latest.created_at desc
              limit 1
            ) as is_latest
          from fantasy.nba_schedule_snapshots nss
          where nss.id = ${calendarSnapshotId}
        `;
        if (referencedCalendar !== undefined) {
          const playoffPeriods = yield* sql<{
            end_at: string;
            playoff_round: 'final' | 'quarterfinal' | 'semifinal';
            scoring_period: number;
            start_at: string;
          }>`
            select scoring_period, start_at::text, end_at::text, playoff_round
            from fantasy.league_scoring_periods
            where snapshot_id = ${referencedCalendar.id} and phase = 'playoffs'
            order by scoring_period
          `;
          calendar = {
            asOf: referencedCalendar.as_of,
            fingerprint: referencedCalendar.fingerprint,
            playoffPeriods: playoffPeriods.map((period) => ({
              endAt: new Date(period.end_at).toISOString(),
              label: playoffPeriodLabel(period.playoff_round),
              scoringPeriod: period.scoring_period,
              startAt: new Date(period.start_at).toISOString(),
            })),
            snapshotId: referencedCalendar.id,
            status:
              referencedCalendar.season_key === snapshot.season_key && referencedCalendar.is_latest
                ? 'current'
                : 'stale',
          };
        }
      }

      return {
        asOf: snapshot.as_of,
        calendar,
        createdAt: snapshot.created_at,
        modelVersion: snapshot.model_version,
        players,
        seasonKey: snapshot.season_key,
        snapshotId: snapshot.id,
        source: snapshot.source,
        summary: {
          durablePlayerCount: players.filter((player) => player.availability.tier === 'durable')
            .length,
          fragilePlayerCount: players.filter((player) => player.availability.tier === 'fragile')
            .length,
          playerCount: players.length,
        },
      } satisfies LatestProjectionSnapshot;
    }).pipe(
      Effect.mapError(() =>
        databaseUnavailable(
          'latest_projection_snapshot',
          'The latest projection snapshot could not be loaded',
        ),
      ),
    );

    type AuctionValuationRunRow = {
      artifact_version: string;
      candidate_results: ReadonlyArray<unknown>;
      created_at: string;
      fingerprint: string;
      historical_input_fingerprint: string;
      historical_season_keys: ReadonlyArray<string>;
      id: string;
      league_settings: AuctionValuationArtifactInput['leagueSettings'];
      limitations: ReadonlyArray<string>;
      methodology: string;
      model_version: string;
      projected_as_of: string;
      projection_model_version: string;
      projection_snapshot_id: string;
      promoted_at: string | null;
      promoted_by_user_id: string | null;
      season_key: string;
      selected_model_id: string;
      selection_rule: string;
      status: AuctionValuationRun['status'];
    };

    const hydrateAuctionValuationRun = (
      row: AuctionValuationRunRow,
    ): Effect.Effect<AuctionValuationRun, unknown> =>
      sql<{
        fair_high_cents: number;
        fair_low_cents: number;
        historical_season_count: number;
        history_player_id: string | null;
        is_modeled: boolean;
        market_estimate_cents: number;
        player_id: string;
        player_name: string;
        projected_edge_cents: number;
        projected_value_cents: number;
        projection_rank: number;
      }>`
        select *
        from fantasy.auction_valuation_players
        where run_id = ${row.id}
        order by projection_rank, player_id
      `.pipe(
        Effect.map((players) => ({
          artifactVersion: row.artifact_version,
          candidateResults: row.candidate_results,
          createdAt: row.created_at,
          current: {
            players: players.map((player) => ({
              fairHighCents: player.fair_high_cents,
              fairLowCents: player.fair_low_cents,
              historicalSeasonCount: player.historical_season_count,
              historyPlayerId: player.history_player_id,
              isModeled: player.is_modeled,
              marketEstimateCents: player.market_estimate_cents,
              playerId: player.player_id,
              playerName: player.player_name,
              projectedEdgeCents: player.projected_edge_cents,
              projectedValueCents: player.projected_value_cents,
              projectionRank: player.projection_rank,
            })),
            seasonKey: row.season_key,
          },
          fingerprint: row.fingerprint,
          historicalInputs: {
            fingerprint: row.historical_input_fingerprint,
            seasonKeys: row.historical_season_keys,
          },
          leagueSettings: row.league_settings,
          limitations: row.limitations,
          methodology: row.methodology,
          modelVersion: row.model_version,
          projection: {
            asOf: row.projected_as_of,
            modelVersion: row.projection_model_version,
            snapshotId: row.projection_snapshot_id,
          },
          promotedAt: row.promoted_at,
          promotedByUserId: row.promoted_by_user_id,
          runId: row.id,
          seasonKey: row.season_key,
          selectedModelId: row.selected_model_id,
          selectionRule: row.selection_rule,
          status: row.status,
        })),
      );

    const valuationRunSelect = (filter: 'id' | 'promoted', value: string) =>
      Effect.gen(function* () {
        const rows =
          filter === 'id'
            ? yield* sql<AuctionValuationRunRow>`
                select
                  avr.*,
                  avr.projection_as_of::text as projected_as_of,
                  avr.created_at::text as created_at,
                  avr.promoted_at::text as promoted_at
                from fantasy.auction_valuation_runs avr
                where avr.id = ${value}
                limit 1
              `
            : yield* sql<AuctionValuationRunRow>`
                select
                  avr.*,
                  avr.projection_as_of::text as projected_as_of,
                  avr.created_at::text as created_at,
                  avr.promoted_at::text as promoted_at
                from fantasy.auction_valuation_runs avr
                where avr.season_key = ${value} and avr.status = 'promoted'
                limit 1
              `;
        return rows[0] === undefined ? null : yield* hydrateAuctionValuationRun(rows[0]);
      });

    const auctionValuationRun = (runId: string) =>
      valuationRunSelect('id', runId).pipe(
        Effect.mapError((cause) =>
          databaseUnavailable(
            'auction_valuation_run',
            'The valuation run could not be loaded',
            cause,
          ),
        ),
      );

    const promotedAuctionValuationRun = (seasonKey: string) =>
      valuationRunSelect('promoted', seasonKey).pipe(
        Effect.mapError((cause) =>
          databaseUnavailable(
            'promoted_auction_valuation_run',
            'The promoted valuation run could not be loaded',
            cause,
          ),
        ),
      );

    const latestAdpSnapshot = Effect.gen(function* () {
      const snapshots = yield* sql<{
        captured_at: string;
        id: string;
        season_key: string;
        source: string;
      }>`
        select id, source, season_key, captured_at::text
        from fantasy.adp_snapshots
        order by captured_at desc, created_at desc
        limit 2
      `;
      const snapshot = snapshots[0];
      if (snapshot === undefined) return null;
      const candidatePrevious = snapshots[1];
      const previous =
        candidatePrevious?.source === snapshot.source &&
        candidatePrevious.season_key === snapshot.season_key
          ? candidatePrevious
          : undefined;

      const rows = yield* sql<{
        adp: number;
        fantrax_id: string;
        movement: number | null;
        player_id: string;
        player_name: string;
        position: string;
        previous_adp: number | null;
        rank: number;
      }>`
        select
          current_adp.player_id,
          p.canonical_name as player_name,
          pi.external_id as fantrax_id,
          current_adp.position,
          current_adp.adp::double precision as adp,
          previous_adp.adp::double precision as previous_adp,
          case
            when previous_adp.adp is null then null
            else (previous_adp.adp - current_adp.adp)::double precision
          end as movement,
          row_number() over (
            order by current_adp.adp, p.canonical_name
          )::integer as rank
        from fantasy.player_adp current_adp
        join fantasy.players p on p.id = current_adp.player_id
        join fantasy.player_identities pi
          on pi.player_id = current_adp.player_id
          and pi.source = 'fantrax'
        left join fantasy.player_adp previous_adp
          on previous_adp.snapshot_id = ${previous?.id ?? null}
          and previous_adp.player_id = current_adp.player_id
        where current_adp.snapshot_id = ${snapshot.id}
        order by rank
      `;
      const players = rows.map(
        (row): AdpMarketPlayer => ({
          adp: row.adp,
          fantraxId: row.fantrax_id,
          movement: row.movement,
          playerId: row.player_id,
          playerName: row.player_name,
          position: row.position,
          previousAdp: row.previous_adp,
          rank: row.rank,
        }),
      );

      return {
        capturedAt: snapshot.captured_at,
        players,
        previousCapturedAt: previous?.captured_at ?? null,
        seasonKey: snapshot.season_key,
        snapshotId: snapshot.id,
        source: snapshot.source,
        summary: {
          fallerCount: players.filter((player) => (player.movement ?? 0) < -0.01).length,
          playerCount: players.length,
          riserCount: players.filter((player) => (player.movement ?? 0) > 0.01).length,
        },
      } satisfies LatestAdpSnapshot;
    }).pipe(
      Effect.mapError(() =>
        databaseUnavailable('latest_adp_snapshot', 'The latest ADP snapshot could not be loaded'),
      ),
    );

    const historicalAuctionMarket = Effect.gen(function* () {
      const [summary] = yield* sql<{
        latest_season: string | null;
        player_count: number;
        purchase_count: number;
        season_count: number;
        total_spend_cents: number;
      }>`
        select
          max(ls.season_key) as latest_season,
          count(distinct ar.player_id)::integer as player_count,
          count(ar.id)::integer as purchase_count,
          count(distinct ar.league_season_id)::integer as season_count,
          coalesce(sum(ar.amount_cents), 0)::integer as total_spend_cents
        from fantasy.auction_results ar
        join fantasy.league_seasons ls on ls.id = ar.league_season_id
        where ls.source = 'fantrax'
      `;

      if (summary === undefined) {
        return yield* Effect.fail(
          databaseUnavailable(
            'historical_auction_market',
            'The historical auction market summary could not be loaded',
          ),
        );
      }

      const rows = yield* sql<{
        average_price_cents: number;
        expected_price_cents: number;
        fantrax_id: string;
        latest_price_cents: number;
        latest_season: string;
        maximum_price_cents: number;
        minimum_price_cents: number;
        name: string;
        player_id: string;
        previous_price_cents: number | null;
        seasons_drafted: number;
      }>`
        with ordered_seasons as (
          select
            ls.id,
            dense_rank() over (order by ls.season_key)::integer as season_weight
          from fantasy.league_seasons ls
          where
            ls.source = 'fantrax'
            and exists (
              select 1
              from fantasy.auction_results ar
              where ar.league_season_id = ls.id
            )
        ),
        season_weights as (
          select
            id,
            season_weight,
            max(season_weight) over ()::integer as maximum_season_weight
          from ordered_seasons
        ),
        history as (
          select
            ar.amount_cents,
            ar.player_id,
            ls.season_key,
            p.canonical_name as name,
            pi.external_id as fantrax_id,
            sw.season_weight,
            sw.maximum_season_weight,
            row_number() over (
              partition by ar.player_id
              order by ls.season_key desc
            )::integer as recency_order
          from fantasy.auction_results ar
          join fantasy.league_seasons ls on ls.id = ar.league_season_id
          join season_weights sw on sw.id = ls.id
          join fantasy.players p on p.id = ar.player_id
          join fantasy.player_identities pi
            on pi.player_id = p.id
            and pi.source = 'fantrax'
          where ls.source = 'fantrax'
        )
        select
          player_id,
          max(fantrax_id) as fantrax_id,
          max(name) as name,
          count(*)::integer as seasons_drafted,
          max(season_key) as latest_season,
          max(amount_cents) filter (where recency_order = 1)::integer as latest_price_cents,
          max(amount_cents) filter (where recency_order = 2)::integer as previous_price_cents,
          round(avg(amount_cents))::integer as average_price_cents,
          round(
            sum(amount_cents::numeric * season_weight)
            / nullif(
              (
                max(maximum_season_weight)::numeric * (max(maximum_season_weight) + 1)
                - (min(season_weight) - 1)::numeric * min(season_weight)
              ) / 2,
              0
            )
          )::integer as expected_price_cents,
          min(amount_cents)::integer as minimum_price_cents,
          max(amount_cents)::integer as maximum_price_cents
        from history
        group by player_id
        order by expected_price_cents desc, latest_price_cents desc, name
      `;

      return {
        players: rows.map((row) => ({
          averagePriceCents: row.average_price_cents,
          expectedPriceCents: row.expected_price_cents,
          fantraxId: row.fantrax_id,
          latestPriceCents: row.latest_price_cents,
          latestSeason: row.latest_season,
          maximumPriceCents: row.maximum_price_cents,
          minimumPriceCents: row.minimum_price_cents,
          name: row.name,
          playerId: row.player_id,
          previousPriceCents: row.previous_price_cents,
          seasonsDrafted: row.seasons_drafted,
          trendCents:
            row.previous_price_cents === null
              ? null
              : row.latest_price_cents - row.previous_price_cents,
        })),
        summary: {
          latestSeason: summary.latest_season,
          playerCount: summary.player_count,
          purchaseCount: summary.purchase_count,
          seasonCount: summary.season_count,
          totalSpendCents: summary.total_spend_cents,
        },
      } satisfies HistoricalAuctionMarket;
    }).pipe(
      Effect.mapError(() =>
        databaseUnavailable(
          'historical_auction_market',
          'The historical auction market could not be loaded',
        ),
      ),
    );

    const leagueTeamHistory = Effect.gen(function* () {
      const teamRows = yield* sql<{
        average_price_cents: number;
        canonical_key: string | null;
        display_name: string | null;
        identity_confidence: number;
        identity_resolution: string;
        member_id: string | null;
        purchase_count: number;
        season_key: string;
        source_team_id: string;
        team_season_id: string;
        team_name: string;
        total_spend_cents: number;
      }>`
        select
          lm.id as member_id,
          lm.canonical_key,
          lm.display_name,
          lts.id as team_season_id,
          ls.season_key,
          lts.source_team_id,
          lts.team_name,
          lts.identity_resolution,
          lts.identity_confidence,
          count(ar.id)::integer as purchase_count,
          coalesce(sum(ar.amount_cents), 0)::integer as total_spend_cents,
          coalesce(round(avg(ar.amount_cents)), 0)::integer as average_price_cents
        from fantasy.league_team_seasons lts
        join fantasy.league_seasons ls on ls.id = lts.league_season_id
        left join fantasy.league_members lm on lm.id = lts.league_member_id
        left join fantasy.auction_results ar on ar.league_team_season_id = lts.id
        where
          ls.source = 'fantrax'
          and ls.source_league_history_id is not null
        group by
          lm.id,
          lm.canonical_key,
          lm.display_name,
          lts.id,
          ls.season_key,
          lts.source_team_id,
          lts.team_name,
          lts.identity_resolution,
          lts.identity_confidence
        order by ls.season_key, lts.team_name, lts.source_team_id
      `;

      const favoriteRows = yield* sql<{
        average_price_cents: number;
        draft_count: number;
        latest_season: string;
        member_id: string;
        player_id: string;
        player_name: string;
        preference_rank: number;
        total_spend_cents: number;
      }>`
        with preferences as (
          select
            lm.id as member_id,
            p.id as player_id,
            p.canonical_name as player_name,
            count(*)::integer as draft_count,
            coalesce(sum(ar.amount_cents), 0)::integer as total_spend_cents,
            coalesce(round(avg(ar.amount_cents)), 0)::integer as average_price_cents,
            max(ls.season_key) as latest_season
          from fantasy.auction_results ar
          join fantasy.league_team_seasons lts on lts.id = ar.league_team_season_id
          join fantasy.league_members lm on lm.id = lts.league_member_id
          join fantasy.league_seasons ls on ls.id = ar.league_season_id
          join fantasy.players p on p.id = ar.player_id
          group by lm.id, p.id, p.canonical_name
        ),
        ranked as (
          select
            *,
            row_number() over (
              partition by member_id
              order by draft_count desc, total_spend_cents desc, player_name
            )::integer as preference_rank
          from preferences
        )
        select *
        from ranked
        where preference_rank <= 5
        order by member_id, preference_rank
      `;

      const favoritesByMember = new Map<string, LeagueTeamHistoryFavoritePlayer[]>();
      for (const row of favoriteRows) {
        const favorites = favoritesByMember.get(row.member_id) ?? [];
        favorites.push({
          averagePriceCents: row.average_price_cents,
          draftCount: row.draft_count,
          latestSeason: row.latest_season,
          playerId: row.player_id,
          playerName: row.player_name,
          totalSpendCents: row.total_spend_cents,
        });
        favoritesByMember.set(row.member_id, favorites);
      }

      const membersById = new Map<string, LeagueTeamHistoryMember>();
      for (const row of teamRows) {
        if (row.member_id === null || row.canonical_key === null || row.display_name === null) {
          continue;
        }
        const existing = membersById.get(row.member_id);
        const season: LeagueTeamHistorySeason = {
          averagePriceCents: row.average_price_cents,
          identityConfidence: row.identity_confidence,
          identityResolution: row.identity_resolution,
          purchaseCount: row.purchase_count,
          seasonKey: row.season_key,
          sourceTeamId: row.source_team_id,
          teamName: row.team_name,
          totalSpendCents: row.total_spend_cents,
        };
        if (existing === undefined) {
          membersById.set(row.member_id, {
            canonicalKey: row.canonical_key,
            displayName: row.display_name,
            favoritePlayers: favoritesByMember.get(row.member_id) ?? [],
            memberId: row.member_id,
            purchaseCount: row.purchase_count,
            seasons: [season],
            teamNames: [row.team_name],
            totalSpendCents: row.total_spend_cents,
          });
        } else {
          membersById.set(row.member_id, {
            ...existing,
            purchaseCount: existing.purchaseCount + row.purchase_count,
            seasons: [...existing.seasons, season],
            teamNames: existing.teamNames.includes(row.team_name)
              ? existing.teamNames
              : [...existing.teamNames, row.team_name],
            totalSpendCents: existing.totalSpendCents + row.total_spend_cents,
          });
        }
      }

      const seasonKeys = new Set(teamRows.map((row) => row.season_key));
      const unresolvedTeams = teamRows
        .filter((row) => row.member_id === null)
        .map((row) => ({
          seasonKey: row.season_key,
          sourceTeamId: row.source_team_id,
          teamSeasonId: row.team_season_id,
          teamName: row.team_name,
        }));
      const members = [...membersById.values()].sort(
        (left, right) =>
          right.seasons.length - left.seasons.length ||
          left.displayName.localeCompare(right.displayName),
      );

      return {
        members,
        summary: {
          canonicalMemberCount: members.length,
          latestSeason: [...seasonKeys].sort().at(-1) ?? null,
          resolvedTeamSeasonCount: teamRows.length - unresolvedTeams.length,
          seasonCount: seasonKeys.size,
          teamSeasonCount: teamRows.length,
          unresolvedTeamSeasonCount: unresolvedTeams.length,
        },
        unresolvedTeams,
      } satisfies LeagueTeamHistory;
    }).pipe(
      Effect.mapError(() =>
        databaseUnavailable(
          'league_team_history',
          'The canonical league team history could not be loaded',
        ),
      ),
    );

    const leaguePerformanceHistory = Effect.gen(function* () {
      const standingRows = yield* sql<{
        first_playoff_period: number | null;
        games_back: number;
        last_regular_season_period: number;
        league_member_id: string | null;
        made_playoffs: boolean;
        manager_name: string | null;
        playoff_team_count: number;
        points_for: number;
        postseason_finish: number | null;
        postseason_result: LeaguePostseasonResult;
        rank: number;
        record: string;
        scoring_type: string;
        season_key: string;
        source_team_id: string;
        team_name: string;
        team_season_id: string;
        ties: number;
        win_percentage: number;
        wins: number;
      }>`
        select
          ls.season_key,
          lsp.scoring_type,
          lsp.last_regular_season_period,
          lsp.first_playoff_period,
          lsp.playoff_team_count,
          lts.id as team_season_id,
          lts.source_team_id,
          lts.team_name,
          lm.id as league_member_id,
          lm.display_name as manager_name,
          standings.rank,
          standings.record,
          standings.wins,
          standings.ties,
          standings.win_percentage::double precision as win_percentage,
          standings.games_back::double precision as games_back,
          standings.points_for::double precision as points_for,
          standings.made_playoffs,
          standings.postseason_result,
          standings.postseason_finish
        from fantasy.league_team_standings standings
        join fantasy.league_team_seasons lts
          on lts.id = standings.league_team_season_id
        join fantasy.league_seasons ls on ls.id = lts.league_season_id
        join fantasy.league_season_performance lsp on lsp.league_season_id = ls.id
        left join fantasy.league_members lm on lm.id = lts.league_member_id
        order by ls.season_key desc, standings.rank, lts.team_name
      `;

      const matchupRows = yield* sql<{
        away_games_played: number;
        away_score: number;
        away_team_name: string;
        away_team_season_id: string;
        home_games_played: number;
        home_score: number;
        home_team_name: string;
        home_team_season_id: string;
        phase: 'playoffs' | 'regular-season';
        playoff_round: 'final' | 'quarterfinal' | 'semifinal' | null;
        scoring_period: number;
        season_key: string;
      }>`
        select
          ls.season_key,
          matchups.scoring_period,
          matchups.phase,
          matchups.playoff_round,
          matchups.away_team_season_id,
          away.team_name as away_team_name,
          matchups.away_score::double precision as away_score,
          matchups.away_games_played,
          matchups.home_team_season_id,
          home.team_name as home_team_name,
          matchups.home_score::double precision as home_score,
          matchups.home_games_played
        from fantasy.league_matchups matchups
        join fantasy.league_seasons ls on ls.id = matchups.league_season_id
        join fantasy.league_team_seasons away on away.id = matchups.away_team_season_id
        join fantasy.league_team_seasons home on home.id = matchups.home_team_season_id
        order by ls.season_key desc, matchups.scoring_period, away.team_name
      `;

      const weeklyScoresByTeam = new Map<string, LeaguePerformanceWeeklyScore[]>();
      const regularScoresBySeasonPeriod = new Map<string, Map<string, number>>();
      const addWeeklyScore = (teamSeasonId: string, score: LeaguePerformanceWeeklyScore): void => {
        const scores = weeklyScoresByTeam.get(teamSeasonId) ?? [];
        scores.push(score);
        weeklyScoresByTeam.set(teamSeasonId, scores);
      };
      for (const row of matchupRows) {
        const awayResult =
          row.away_score === row.home_score
            ? ('tie' as const)
            : row.away_score > row.home_score
              ? ('win' as const)
              : ('loss' as const);
        const homeResult =
          awayResult === 'tie'
            ? ('tie' as const)
            : awayResult === 'win'
              ? ('loss' as const)
              : 'win';
        addWeeklyScore(row.away_team_season_id, {
          gamesPlayed: row.away_games_played,
          opponentName: row.home_team_name,
          opponentScore: row.home_score,
          phase: row.phase,
          playoffRound: row.playoff_round,
          result: awayResult,
          score: row.away_score,
          scoringPeriod: row.scoring_period,
        });
        addWeeklyScore(row.home_team_season_id, {
          gamesPlayed: row.home_games_played,
          opponentName: row.away_team_name,
          opponentScore: row.away_score,
          phase: row.phase,
          playoffRound: row.playoff_round,
          result: homeResult,
          score: row.home_score,
          scoringPeriod: row.scoring_period,
        });
        if (row.phase === 'regular-season') {
          const key = `${row.season_key}:${row.scoring_period}`;
          const scores = regularScoresBySeasonPeriod.get(key) ?? new Map<string, number>();
          scores.set(row.away_team_season_id, row.away_score);
          scores.set(row.home_team_season_id, row.home_score);
          regularScoresBySeasonPeriod.set(key, scores);
        }
      }

      const roundMetric = (value: number): number => Math.round(value * 1000) / 1000;
      const average = (values: ReadonlyArray<number>): number =>
        values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
      const allPlayWinPercentage = (
        seasonKey: string,
        teamSeasonId: string,
        scores: ReadonlyArray<LeaguePerformanceWeeklyScore>,
      ): number => {
        let points = 0;
        let comparisons = 0;
        for (const score of scores.filter((candidate) => candidate.phase === 'regular-season')) {
          const periodScores = regularScoresBySeasonPeriod.get(
            `${seasonKey}:${score.scoringPeriod}`,
          );
          if (periodScores === undefined) continue;
          for (const [otherTeamSeasonId, otherScore] of periodScores) {
            if (otherTeamSeasonId === teamSeasonId) continue;
            comparisons += 1;
            points += score.score === otherScore ? 0.5 : score.score > otherScore ? 1 : 0;
          }
        }
        return comparisons === 0 ? 0 : points / comparisons;
      };

      const seasonsByKey = new Map<string, LeaguePerformanceSeason>();
      for (const row of standingRows) {
        const weeklyScores = weeklyScoresByTeam.get(row.team_season_id) ?? [];
        const regularScores = weeklyScores.filter((score) => score.phase === 'regular-season');
        const scoreValues = regularScores.map((score) => score.score);
        const opponentValues = regularScores.map((score) => score.opponentScore);
        const activeGames = regularScores.map((score) => score.gamesPlayed);
        const scoreAverage = average(scoreValues);
        const scoreVariance = average(
          scoreValues.map((score) => (score - scoreAverage) * (score - scoreAverage)),
        );
        const allPlay = allPlayWinPercentage(row.season_key, row.team_season_id, regularScores);
        const expectedWins = allPlay * regularScores.length;
        const totalActiveGames = activeGames.reduce((total, games) => total + games, 0);
        const team = {
          allPlayWinPercentage: roundMetric(allPlay),
          averageActiveGames: roundMetric(average(activeGames)),
          averageOpponentScore: roundMetric(average(opponentValues)),
          averageWeeklyScore: roundMetric(scoreAverage),
          expectedWins: roundMetric(expectedWins),
          gamesBack: row.games_back,
          highScore: scoreValues.length === 0 ? 0 : Math.max(...scoreValues),
          leagueMemberId: row.league_member_id,
          lowScore: scoreValues.length === 0 ? 0 : Math.min(...scoreValues),
          luckWins: roundMetric(row.wins + row.ties * 0.5 - expectedWins),
          madePlayoffs: row.made_playoffs,
          managerName: row.manager_name,
          pointsFor: row.points_for,
          pointsPerActiveGame:
            totalActiveGames === 0
              ? 0
              : roundMetric(
                  scoreValues.reduce((total, score) => total + score, 0) / totalActiveGames,
                ),
          postseasonFinish: row.postseason_finish,
          postseasonResult: row.postseason_result,
          rank: row.rank,
          record: row.record,
          scoreStandardDeviation: roundMetric(Math.sqrt(scoreVariance)),
          sourceTeamId: row.source_team_id,
          teamName: row.team_name,
          teamSeasonId: row.team_season_id,
          weeklyScores,
          winPercentage: row.win_percentage,
        } satisfies LeaguePerformanceTeam;
        const season = seasonsByKey.get(row.season_key);
        if (season === undefined) {
          seasonsByKey.set(row.season_key, {
            champion:
              team.postseasonResult === 'champion'
                ? { managerName: team.managerName, teamName: team.teamName }
                : null,
            firstPlayoffPeriod: row.first_playoff_period,
            lastRegularSeasonPeriod: row.last_regular_season_period,
            playoffTeamCount: row.playoff_team_count,
            scoringType: row.scoring_type,
            seasonKey: row.season_key,
            teams: [team],
          });
        } else {
          seasonsByKey.set(row.season_key, {
            ...season,
            champion:
              team.postseasonResult === 'champion'
                ? { managerName: team.managerName, teamName: team.teamName }
                : season.champion,
            teams: [...season.teams, team],
          });
        }
      }

      const seasons = [...seasonsByKey.values()].sort((left, right) =>
        right.seasonKey.localeCompare(left.seasonKey),
      );
      return {
        seasons,
        summary: {
          latestSeason: seasons[0]?.seasonKey ?? null,
          matchupCount: matchupRows.length,
          seasonCount: seasons.length,
          teamSeasonCount: standingRows.length,
        },
      } satisfies LeaguePerformanceHistory;
    }).pipe(
      Effect.mapError(() =>
        databaseUnavailable(
          'league_performance_history',
          'The league performance history could not be loaded',
        ),
      ),
    );

    const leagueRosterActivity = Effect.gen(function* () {
      const seasonRows = yield* sql<{
        baseline_roster_period: number;
        change_count: number;
        entry_count: number;
        season_key: string;
        snapshot_count: number;
      }>`
        with snapshot_summary as (
          select
            snapshots.league_season_id,
            min(snapshots.roster_period) filter (where snapshots.is_baseline)::integer
              as baseline_roster_period,
            count(*)::integer as snapshot_count
          from fantasy.roster_period_snapshots snapshots
          group by snapshots.league_season_id
        ),
        entry_summary as (
          select
            snapshots.league_season_id,
            count(*)::integer as entry_count
          from fantasy.roster_period_entries entries
          join fantasy.roster_period_snapshots snapshots on snapshots.id = entries.snapshot_id
          group by snapshots.league_season_id
        ),
        change_summary as (
          select league_season_id, count(*)::integer as change_count
          from fantasy.inferred_roster_changes
          group by league_season_id
        )
        select
          ls.season_key,
          snapshot_summary.baseline_roster_period,
          snapshot_summary.snapshot_count,
          coalesce(entry_summary.entry_count, 0)::integer as entry_count,
          coalesce(change_summary.change_count, 0)::integer as change_count
        from snapshot_summary
        join fantasy.league_seasons ls on ls.id = snapshot_summary.league_season_id
        left join entry_summary on entry_summary.league_season_id = ls.id
        left join change_summary on change_summary.league_season_id = ls.id
        order by ls.season_key desc
      `;
      const teamRows = yield* sql<{
        add_count: number;
        drop_count: number;
        league_member_id: string | null;
        made_playoffs: boolean | null;
        manager_name: string | null;
        postseason_result: LeaguePostseasonResult | null;
        rank: number | null;
        season_key: string;
        team_name: string;
        team_season_id: string;
        transfer_in_count: number;
        transfer_out_count: number;
      }>`
        select
          ls.season_key,
          lts.id as team_season_id,
          lts.team_name,
          lts.league_member_id,
          lm.display_name as manager_name,
          standings.rank,
          standings.made_playoffs,
          standings.postseason_result,
          count(changes.id) filter (
            where changes.change_type = 'add' and changes.to_team_season_id = lts.id
          )::integer as add_count,
          count(changes.id) filter (
            where changes.change_type = 'drop' and changes.from_team_season_id = lts.id
          )::integer as drop_count,
          count(changes.id) filter (
            where changes.change_type = 'team-change' and changes.to_team_season_id = lts.id
          )::integer as transfer_in_count,
          count(changes.id) filter (
            where changes.change_type = 'team-change' and changes.from_team_season_id = lts.id
          )::integer as transfer_out_count
        from fantasy.league_team_seasons lts
        join fantasy.league_seasons ls on ls.id = lts.league_season_id
        left join fantasy.league_members lm on lm.id = lts.league_member_id
        left join fantasy.league_team_standings standings
          on standings.league_team_season_id = lts.id
        left join fantasy.inferred_roster_changes changes
          on changes.from_team_season_id = lts.id or changes.to_team_season_id = lts.id
        where exists (
          select 1
          from fantasy.roster_period_snapshots snapshots
          where snapshots.league_season_id = ls.id
        )
        group by
          ls.season_key,
          lts.id,
          lts.team_name,
          lts.league_member_id,
          lm.display_name,
          standings.rank,
          standings.made_playoffs,
          standings.postseason_result
        order by ls.season_key desc, add_count desc, transfer_in_count desc, lts.team_name
      `;
      const changeRows = yield* sql<{
        change_type: InferredRosterChangeType;
        from_manager_name: string | null;
        from_team_name: string | null;
        from_team_season_id: string | null;
        observed_at: string;
        player_id: string;
        player_name: string;
        previous_roster_period: number;
        roster_period: number;
        season_key: string;
        to_manager_name: string | null;
        to_team_name: string | null;
        to_team_season_id: string | null;
      }>`
        select
          ls.season_key,
          changes.previous_roster_period,
          changes.roster_period,
          changes.observed_at::text,
          changes.change_type,
          p.id as player_id,
          p.canonical_name as player_name,
          from_team.id as from_team_season_id,
          from_team.team_name as from_team_name,
          from_member.display_name as from_manager_name,
          to_team.id as to_team_season_id,
          to_team.team_name as to_team_name,
          to_member.display_name as to_manager_name
        from fantasy.inferred_roster_changes changes
        join fantasy.league_seasons ls on ls.id = changes.league_season_id
        join fantasy.players p on p.id = changes.player_id
        left join fantasy.league_team_seasons from_team
          on from_team.id = changes.from_team_season_id
        left join fantasy.league_members from_member
          on from_member.id = from_team.league_member_id
        left join fantasy.league_team_seasons to_team
          on to_team.id = changes.to_team_season_id
        left join fantasy.league_members to_member
          on to_member.id = to_team.league_member_id
        order by ls.season_key desc, changes.roster_period desc, p.canonical_name
      `;

      const teamsBySeason = new Map<string, LeagueRosterActivityTeam[]>();
      for (const row of teamRows) {
        const teams = teamsBySeason.get(row.season_key) ?? [];
        teams.push({
          addCount: row.add_count,
          departureCount: row.drop_count + row.transfer_out_count,
          dropCount: row.drop_count,
          leagueMemberId: row.league_member_id,
          managerName: row.manager_name,
          outcome:
            row.rank === null || row.made_playoffs === null || row.postseason_result === null
              ? null
              : {
                  madePlayoffs: row.made_playoffs,
                  postseasonResult: row.postseason_result,
                  rank: row.rank,
                },
          teamName: row.team_name,
          teamSeasonId: row.team_season_id,
          totalAcquisitionCount: row.add_count + row.transfer_in_count,
          transferInCount: row.transfer_in_count,
          transferOutCount: row.transfer_out_count,
        });
        teamsBySeason.set(row.season_key, teams);
      }
      const changesBySeason = new Map<string, LeagueRosterActivityChange[]>();
      for (const row of changeRows) {
        const changes = changesBySeason.get(row.season_key) ?? [];
        changes.push({
          changeType: row.change_type,
          fromTeam:
            row.from_team_season_id === null || row.from_team_name === null
              ? null
              : {
                  managerName: row.from_manager_name,
                  teamName: row.from_team_name,
                  teamSeasonId: row.from_team_season_id,
                },
          observedAt: row.observed_at,
          playerId: row.player_id,
          playerName: row.player_name,
          previousRosterPeriod: row.previous_roster_period,
          rosterPeriod: row.roster_period,
          toTeam:
            row.to_team_season_id === null || row.to_team_name === null
              ? null
              : {
                  managerName: row.to_manager_name,
                  teamName: row.to_team_name,
                  teamSeasonId: row.to_team_season_id,
                },
        });
        changesBySeason.set(row.season_key, changes);
      }
      const seasons = seasonRows.map(
        (row): LeagueRosterActivitySeason => ({
          baselineRosterPeriod: row.baseline_roster_period,
          changeCount: row.change_count,
          changes: changesBySeason.get(row.season_key) ?? [],
          entryCount: row.entry_count,
          seasonKey: row.season_key,
          snapshotCount: row.snapshot_count,
          teams: teamsBySeason.get(row.season_key) ?? [],
        }),
      );

      return {
        seasons,
        summary: {
          changeCount: seasons.reduce((count, season) => count + season.changeCount, 0),
          latestSeason: seasons[0]?.seasonKey ?? null,
          seasonCount: seasons.length,
          snapshotCount: seasons.reduce((count, season) => count + season.snapshotCount, 0),
        },
      } satisfies LeagueRosterActivityHistory;
    }).pipe(
      Effect.mapError(() =>
        databaseUnavailable(
          'league_roster_activity',
          'The inferred league roster activity could not be loaded',
        ),
      ),
    );

    const leagueRosterSnapshot = Effect.gen(function* () {
      const rows = yield* sql<{
        amount_cents: number | null;
        base_budget_cents: number;
        division: string | null;
        league_season_id: string;
        league_team_season_id: string;
        member_id: string | null;
        member_name: string | null;
        nomination_order: number | null;
        player_id: string | null;
        player_name: string | null;
        roster_size: number;
        roster_slot: number | null;
        season_key: string;
        season_name: string;
        source_team_id: string;
        team_count: number;
        team_name: string;
      }>`
        select
          ls.id as league_season_id,
          ls.season_key,
          ls.name as season_name,
          ls.team_count,
          ls.roster_size,
          ls.base_budget_cents,
          lts.id as league_team_season_id,
          lts.source_team_id,
          lts.team_name,
          lts.division,
          lm.id as member_id,
          lm.display_name as member_name,
          ar.player_id,
          p.canonical_name as player_name,
          ar.amount_cents,
          ar.nomination_order,
          ar.roster_slot
        from fantasy.league_seasons ls
        join fantasy.league_team_seasons lts on lts.league_season_id = ls.id
        left join fantasy.league_members lm on lm.id = lts.league_member_id
        left join fantasy.auction_results ar on ar.league_team_season_id = lts.id
        left join fantasy.players p on p.id = ar.player_id
        where
          ls.source = 'fantrax'
          and ls.source_league_history_id is not null
        order by
          ls.season_key desc,
          lts.team_name,
          ar.roster_slot nulls last,
          ar.nomination_order nulls last,
          p.canonical_name
      `;

      type TeamAccumulator = Omit<
        LeagueRosterTeam,
        'baseBudgetBalanceCents' | 'roster' | 'rosterCount' | 'spendCents'
      > & {
        readonly roster: LeagueRosterPlayer[];
      };
      type SeasonAccumulator = Omit<
        LeagueRosterSeason,
        'draftedPlayerCount' | 'rosterStatus' | 'teams' | 'totalSpendCents'
      > & {
        readonly teamsById: Map<string, TeamAccumulator>;
      };

      const seasonsById = new Map<string, SeasonAccumulator>();
      for (const row of rows) {
        let season = seasonsById.get(row.league_season_id);
        if (season === undefined) {
          season = {
            baseBudgetCents: row.base_budget_cents,
            name: row.season_name,
            rosterSize: row.roster_size,
            seasonKey: row.season_key,
            teamCount: row.team_count,
            teamsById: new Map(),
          };
          seasonsById.set(row.league_season_id, season);
        }

        let team = season.teamsById.get(row.league_team_season_id);
        if (team === undefined) {
          team = {
            division: row.division,
            owner:
              row.member_id === null || row.member_name === null
                ? null
                : { displayName: row.member_name, memberId: row.member_id },
            roster: [],
            sourceTeamId: row.source_team_id,
            teamName: row.team_name,
            teamSeasonId: row.league_team_season_id,
          };
          season.teamsById.set(row.league_team_season_id, team);
        }

        if (row.player_id !== null) {
          if (row.player_name === null || row.amount_cents === null) {
            throw new Error('A rostered player is missing its canonical name or auction cost');
          }
          team.roster.push({
            auctionCostCents: row.amount_cents,
            nominationOrder: row.nomination_order,
            playerId: row.player_id,
            playerName: row.player_name,
            rosterSlot: row.roster_slot,
          });
        }
      }

      const seasons = [...seasonsById.values()]
        .map((season): LeagueRosterSeason => {
          const teams = [...season.teamsById.values()]
            .map((team): LeagueRosterTeam => {
              const spendCents = team.roster.reduce(
                (total, player) => total + player.auctionCostCents,
                0,
              );
              return {
                ...team,
                baseBudgetBalanceCents: season.baseBudgetCents - spendCents,
                rosterCount: team.roster.length,
                spendCents,
              };
            })
            .sort((left, right) => left.teamName.localeCompare(right.teamName));
          const draftedPlayerCount = teams.reduce((total, team) => total + team.rosterCount, 0);
          const expectedPlayerCount = season.teamCount * season.rosterSize;
          return {
            baseBudgetCents: season.baseBudgetCents,
            draftedPlayerCount,
            name: season.name,
            rosterSize: season.rosterSize,
            rosterStatus:
              draftedPlayerCount === 0
                ? 'empty'
                : draftedPlayerCount >= expectedPlayerCount
                  ? 'complete'
                  : 'partial',
            seasonKey: season.seasonKey,
            teamCount: season.teamCount,
            teams,
            totalSpendCents: teams.reduce((total, team) => total + team.spendCents, 0),
          };
        })
        .sort((left, right) => right.seasonKey.localeCompare(left.seasonKey));

      return {
        seasons,
        summary: {
          latestPopulatedSeason:
            seasons.find((season) => season.draftedPlayerCount > 0)?.seasonKey ?? null,
          latestSeason: seasons[0]?.seasonKey ?? null,
          seasonCount: seasons.length,
        },
      } satisfies LeagueRosterSnapshot;
    }).pipe(
      Effect.mapError(() =>
        databaseUnavailable(
          'league_roster_snapshot',
          'The league roster snapshot could not be loaded',
        ),
      ),
    );

    const readPreDraftPlan = (planId: string): Effect.Effect<PreDraftPlan | null, unknown> =>
      Effect.gen(function* () {
        const [plan] = yield* sql<{
          anchor_budget_cents: number;
          core_budget_cents: number;
          endgame_budget_cents: number;
          id: string;
          name: string;
          notes: string;
          primary_goal: PreDraftGoal;
          risk_tolerance: PreDraftRiskTolerance;
          status: string;
          strategy_angle: string;
          streaming_slots: number;
          updated_at: string;
        }>`
          select
            id,
            name,
            status,
            primary_goal,
            strategy_angle,
            risk_tolerance,
            anchor_budget_cents,
            core_budget_cents,
            endgame_budget_cents,
            streaming_slots,
            notes,
            updated_at::text
          from fantasy.pre_draft_plans
          where id = ${planId}
        `;
        if (plan === undefined) return null;
        const targets = yield* sql<{
          id: string;
          max_bid_cents: number | null;
          player_id: string;
          player_name: string;
          priority: number;
          rationale: string;
          stance: PreDraftTargetStance;
        }>`
          select
            pdt.id,
            pdt.player_id,
            p.canonical_name as player_name,
            pdt.stance,
            pdt.max_bid_cents,
            pdt.priority,
            pdt.rationale
          from fantasy.pre_draft_targets pdt
          join fantasy.players p on p.id = pdt.player_id
          where pdt.plan_id = ${planId}
          order by pdt.priority, p.canonical_name
        `;
        return {
          anchorBudgetCents: plan.anchor_budget_cents,
          coreBudgetCents: plan.core_budget_cents,
          endgameBudgetCents: plan.endgame_budget_cents,
          id: plan.id,
          name: plan.name,
          notes: plan.notes,
          primaryGoal: plan.primary_goal,
          riskTolerance: plan.risk_tolerance,
          status: plan.status,
          strategyAngle: plan.strategy_angle,
          streamingSlots: plan.streaming_slots,
          targets: targets.map((target) => ({
            maxBidCents: target.max_bid_cents,
            playerId: target.player_id,
            playerName: target.player_name,
            priority: target.priority,
            rationale: target.rationale,
            stance: target.stance,
            targetId: target.id,
          })),
          updatedAt: plan.updated_at,
        } satisfies PreDraftPlan;
      });

    const preDraftWorkspace = (
      ownerCanonicalKey: string,
      requestedSeasonKey?: string,
    ): Effect.Effect<PreDraftWorkspace, DatabaseUnavailable> =>
      Effect.gen(function* () {
        const [season] = requestedSeasonKey
          ? yield* sql<{
              base_budget_cents: number;
              id: string;
              roster_size: number;
              season_key: string;
              source_league_history_id: string | null;
              team_count: number;
            }>`
              select id, source_league_history_id, season_key, roster_size, base_budget_cents, team_count
              from fantasy.league_seasons
              where source = 'fantrax' and season_key = ${requestedSeasonKey}
              order by updated_at desc
              limit 1
            `
          : yield* sql<{
              base_budget_cents: number;
              id: string;
              roster_size: number;
              season_key: string;
              source_league_history_id: string | null;
              team_count: number;
            }>`
              select id, source_league_history_id, season_key, roster_size, base_budget_cents, team_count
              from fantasy.league_seasons
              where source = 'fantrax'
              order by season_key desc, updated_at desc
              limit 1
            `;
        if (season === undefined || season.source_league_history_id === null) {
          return { league: null, owner: null, plan: null };
        }

        const [owner] = yield* sql<{
          canonical_key: string;
          display_name: string;
          member_id: string;
          team_name: string | null;
        }>`
          select
            lm.id as member_id,
            lm.canonical_key,
            lm.display_name,
            lts.team_name
          from fantasy.league_members lm
          left join fantasy.league_team_seasons lts
            on lts.league_member_id = lm.id
            and lts.league_season_id = ${season.id}
          where
            lm.source_league_history_id = ${season.source_league_history_id}
            and lm.canonical_key = ${ownerCanonicalKey}
          limit 1
        `;
        if (owner === undefined) {
          return {
            league: {
              baseBudgetCents: season.base_budget_cents,
              rosterSize: season.roster_size,
              seasonKey: season.season_key,
              teamCount: season.team_count,
            },
            owner: null,
            plan: null,
          };
        }

        const [planRow] = yield* sql<{ id: string }>`
          select id
          from fantasy.pre_draft_plans
          where
            league_member_id = ${owner.member_id}
            and league_season_id = ${season.id}
            and status = 'active'
          order by updated_at desc
          limit 1
        `;
        const plan = planRow === undefined ? null : yield* readPreDraftPlan(planRow.id);
        return {
          league: {
            baseBudgetCents: season.base_budget_cents,
            rosterSize: season.roster_size,
            seasonKey: season.season_key,
            teamCount: season.team_count,
          },
          owner: {
            canonicalKey: owner.canonical_key,
            displayName: owner.display_name,
            memberId: owner.member_id,
            teamName: owner.team_name,
          },
          plan,
        } satisfies PreDraftWorkspace;
      }).pipe(
        Effect.mapError(() =>
          databaseUnavailable('pre_draft_workspace', 'The pre-draft workspace could not be loaded'),
        ),
      );

    const savePreDraftPlan = (
      input: SavePreDraftPlanInput,
    ): Effect.Effect<PreDraftPlan, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        if (
          input.name.trim().length < 2 ||
          input.strategyAngle.trim().length < 2 ||
          input.streamingSlots < 0 ||
          input.streamingSlots > 3 ||
          input.anchorBudgetCents < 0 ||
          input.coreBudgetCents < 0 ||
          input.endgameBudgetCents < 0
        ) {
          throw new Error('The pre-draft plan is invalid');
        }
        const [reference] = yield* sql<{ league_member_id: string; league_season_id: string }>`
          select lm.id as league_member_id, ls.id as league_season_id
          from fantasy.league_seasons ls
          join fantasy.league_members lm
            on lm.source_league_history_id = ls.source_league_history_id
          where
            ls.source = 'fantrax'
            and ls.season_key = ${input.seasonKey}
            and lm.canonical_key = ${input.ownerCanonicalKey}
          order by ls.updated_at desc
          limit 1
        `;
        if (reference === undefined) throw new Error('The owner or league season was not found');
        const [saved] = yield* sql<{ id: string }>`
          insert into fantasy.pre_draft_plans
            (
              league_member_id,
              league_season_id,
              name,
              status,
              primary_goal,
              strategy_angle,
              risk_tolerance,
              anchor_budget_cents,
              core_budget_cents,
              endgame_budget_cents,
              streaming_slots,
              notes
            )
          values
            (
              ${reference.league_member_id},
              ${reference.league_season_id},
              ${input.name.trim()},
              'active',
              ${input.primaryGoal},
              ${input.strategyAngle.trim()},
              ${input.riskTolerance},
              ${input.anchorBudgetCents},
              ${input.coreBudgetCents},
              ${input.endgameBudgetCents},
              ${input.streamingSlots},
              ${input.notes.trim()}
            )
          on conflict (league_member_id, league_season_id, name) do update set
            status = 'active',
            primary_goal = excluded.primary_goal,
            strategy_angle = excluded.strategy_angle,
            risk_tolerance = excluded.risk_tolerance,
            anchor_budget_cents = excluded.anchor_budget_cents,
            core_budget_cents = excluded.core_budget_cents,
            endgame_budget_cents = excluded.endgame_budget_cents,
            streaming_slots = excluded.streaming_slots,
            notes = excluded.notes,
            updated_at = now()
          returning id
        `;
        if (saved === undefined) throw new Error('The pre-draft plan was not saved');
        const plan = yield* readPreDraftPlan(saved.id);
        if (plan === null) throw new Error('The saved pre-draft plan could not be loaded');
        return plan;
      });
      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError(() =>
            databaseUnavailable('save_pre_draft_plan', 'The pre-draft plan could not be saved'),
          ),
        );
    };

    const savePreDraftTarget = (
      input: SavePreDraftTargetInput,
    ): Effect.Effect<void, DatabaseUnavailable> => {
      if (
        input.priority < 1 ||
        input.priority > 5 ||
        (input.maxBidCents !== null && input.maxBidCents < 0)
      ) {
        return Effect.fail(
          databaseUnavailable('save_pre_draft_target', 'The pre-draft target is invalid'),
        );
      }
      return sql`
        insert into fantasy.pre_draft_targets
          (plan_id, player_id, stance, max_bid_cents, priority, rationale)
        values
          (
            ${input.planId},
            ${input.playerId},
            ${input.stance},
            ${input.maxBidCents},
            ${input.priority},
            ${input.rationale.trim()}
          )
        on conflict (plan_id, player_id) do update set
          stance = excluded.stance,
          max_bid_cents = excluded.max_bid_cents,
          priority = excluded.priority,
          rationale = excluded.rationale,
          updated_at = now()
      `.pipe(
        Effect.asVoid,
        Effect.mapError(() =>
          databaseUnavailable('save_pre_draft_target', 'The pre-draft target could not be saved'),
        ),
      );
    };

    const previewPlayerIdentityMergeInternal = (
      input: PlayerIdentityMergeInput,
      lockPlayers: boolean,
    ) =>
      Effect.gen(function* () {
        validatePlayerIdentityMergeInput(input);
        const playerRows = lockPlayers
          ? yield* sql<{
              canonical_name: string;
              id: string;
              normalized_name: string;
            }>`
              select id, canonical_name, normalized_name
              from fantasy.players
              where id in ${sql.in([input.sourcePlayerId, input.targetPlayerId])}
              order by id
              for update
            `
          : yield* sql<{
              canonical_name: string;
              id: string;
              normalized_name: string;
            }>`
              select id, canonical_name, normalized_name
              from fantasy.players
              where id in ${sql.in([input.sourcePlayerId, input.targetPlayerId])}
              order by id
            `;
        const { source, target } = resolvePlayerIdentityMergePlayers(
          input,
          playerRows.map((player) => ({
            canonicalName: player.canonical_name,
            normalizedName: player.normalized_name,
            playerId: player.id,
          })),
        );

        const referenceRows = yield* sql<{
          reference_count: number;
          table_name: string;
        }>`
          select 'player_identities' as table_name, count(*)::integer as reference_count
          from fantasy.player_identities where player_id = ${input.sourcePlayerId}
          union all
          select 'roster_period_entries', count(*)::integer
          from fantasy.roster_period_entries where player_id = ${input.sourcePlayerId}
          union all
          select 'inferred_roster_changes', count(*)::integer
          from fantasy.inferred_roster_changes where player_id = ${input.sourcePlayerId}
          union all
          select 'player_projections', count(*)::integer
          from fantasy.player_projections where player_id = ${input.sourcePlayerId}
          union all
          select 'player_adp', count(*)::integer
          from fantasy.player_adp where player_id = ${input.sourcePlayerId}
          union all
          select 'pre_draft_targets', count(*)::integer
          from fantasy.pre_draft_targets where player_id = ${input.sourcePlayerId}
          union all
          select 'player_season_stats', count(*)::integer
          from fantasy.player_season_stats where player_id = ${input.sourcePlayerId}
          union all
          select 'auction_results', count(*)::integer
          from fantasy.auction_results where player_id = ${input.sourcePlayerId}
          union all
          select 'player_rankings', count(*)::integer
          from fantasy.player_rankings where player_id = ${input.sourcePlayerId}
        `;
        const referenceCounts = Object.fromEntries(
          referenceRows.map((row) => [row.table_name, row.reference_count]),
        );
        if (PLAYER_IDENTITY_MERGE_REFERENCE_TABLES.some((table) => !(table in referenceCounts))) {
          throw new Error('The player reference registry is incomplete');
        }

        const conflicts = yield* sql<{ key: string; table_name: string }>`
          select 'roster_period_entries' as table_name, source.snapshot_id::text as key
          from fantasy.roster_period_entries source
          join fantasy.roster_period_entries target
            on target.snapshot_id = source.snapshot_id
            and target.player_id = ${input.targetPlayerId}
          where source.player_id = ${input.sourcePlayerId}
          union all
          select 'inferred_roster_changes',
            concat_ws('|', source.league_season_id::text, source.roster_period::text)
          from fantasy.inferred_roster_changes source
          join fantasy.inferred_roster_changes target
            on target.league_season_id = source.league_season_id
            and target.roster_period = source.roster_period
            and target.player_id = ${input.targetPlayerId}
          where source.player_id = ${input.sourcePlayerId}
          union all
          select 'player_projections', source.snapshot_id::text
          from fantasy.player_projections source
          join fantasy.player_projections target
            on target.snapshot_id = source.snapshot_id
            and target.player_id = ${input.targetPlayerId}
          where source.player_id = ${input.sourcePlayerId}
          union all
          select 'player_adp', source.snapshot_id::text
          from fantasy.player_adp source
          join fantasy.player_adp target
            on target.snapshot_id = source.snapshot_id
            and target.player_id = ${input.targetPlayerId}
          where source.player_id = ${input.sourcePlayerId}
          union all
          select 'pre_draft_targets', source.plan_id::text
          from fantasy.pre_draft_targets source
          join fantasy.pre_draft_targets target
            on target.plan_id = source.plan_id
            and target.player_id = ${input.targetPlayerId}
          where source.player_id = ${input.sourcePlayerId}
          union all
          select 'player_season_stats',
            concat_ws('|', source.source, source.season_key, source.period)
          from fantasy.player_season_stats source
          join fantasy.player_season_stats target
            on target.source = source.source
            and target.season_key = source.season_key
            and target.period = source.period
            and target.player_id = ${input.targetPlayerId}
          where source.player_id = ${input.sourcePlayerId}
          union all
          select 'auction_results', source.league_season_id::text
          from fantasy.auction_results source
          join fantasy.auction_results target
            on target.league_season_id = source.league_season_id
            and target.player_id = ${input.targetPlayerId}
          where source.player_id = ${input.sourcePlayerId}
          union all
          select 'player_rankings', source.ranking_run_id::text
          from fantasy.player_rankings source
          join fantasy.player_rankings target
            on target.ranking_run_id = source.ranking_run_id
            and target.player_id = ${input.targetPlayerId}
          where source.player_id = ${input.sourcePlayerId}
        `;

        return makePlayerIdentityMergePreview({
          conflicts: conflicts.map((conflict) => ({
            key: conflict.key,
            table: conflict.table_name,
          })),
          referenceCounts,
          source: {
            canonicalName: source.canonicalName,
            normalizedName: source.normalizedName,
            playerId: source.playerId,
          },
          target: {
            canonicalName: target.canonicalName,
            normalizedName: target.normalizedName,
            playerId: target.playerId,
          },
        });
      });

    const previewPlayerIdentityMerge = (
      input: PlayerIdentityMergeInput,
    ): Effect.Effect<PlayerIdentityMergePreview, DatabaseUnavailable> =>
      previewPlayerIdentityMergeInternal(input, false).pipe(
        Effect.mapError(() =>
          databaseUnavailable(
            'preview_player_identity_merge',
            'The player identity merge could not be previewed',
          ),
        ),
      );

    const mergePlayerIdentities = (
      input: PlayerIdentityMergeInput,
      expectedFingerprint: string,
    ): Effect.Effect<PlayerIdentityMergeResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const preview = yield* previewPlayerIdentityMergeInternal(input, true);
        const commitPlan = planPlayerIdentityMergeCommit(preview, expectedFingerprint);

        yield* sql`update fantasy.player_identities set player_id = ${input.targetPlayerId} where player_id = ${input.sourcePlayerId}`;
        yield* sql`update fantasy.roster_period_entries set player_id = ${input.targetPlayerId} where player_id = ${input.sourcePlayerId}`;
        yield* sql`update fantasy.inferred_roster_changes set player_id = ${input.targetPlayerId} where player_id = ${input.sourcePlayerId}`;
        yield* sql`update fantasy.player_projections set player_id = ${input.targetPlayerId} where player_id = ${input.sourcePlayerId}`;
        yield* sql`update fantasy.player_adp set player_id = ${input.targetPlayerId} where player_id = ${input.sourcePlayerId}`;
        yield* sql`update fantasy.pre_draft_targets set player_id = ${input.targetPlayerId} where player_id = ${input.sourcePlayerId}`;
        yield* sql`update fantasy.player_season_stats set player_id = ${input.targetPlayerId} where player_id = ${input.sourcePlayerId}`;
        yield* sql`update fantasy.auction_results set player_id = ${input.targetPlayerId} where player_id = ${input.sourcePlayerId}`;
        yield* sql`update fantasy.player_rankings set player_id = ${input.targetPlayerId} where player_id = ${input.sourcePlayerId}`;

        const [audit] = yield* sql<{ id: string }>`
          insert into fantasy.player_identity_merges
            (
              source_player_id,
              target_player_id,
              source_canonical_name,
              target_canonical_name,
              preview_fingerprint,
              reason,
              resolved_by_user_id,
              reference_counts
            )
          values
            (
              ${input.sourcePlayerId},
              ${input.targetPlayerId},
              ${preview.source.canonicalName},
              ${preview.target.canonicalName},
              ${preview.fingerprint},
              ${input.reason.trim()},
              ${input.resolvedByUserId.trim()},
              ${JSON.stringify(preview.referenceCounts)}::jsonb
            )
          returning id
        `;
        if (audit === undefined) throw new Error('The player merge audit could not be created');

        yield* sql`delete from fantasy.players where id = ${input.sourcePlayerId}`;
        const [remaining] = yield* sql<{ reference_count: number }>`
          select count(*)::integer as reference_count
          from (
            select player_id from fantasy.player_identities where player_id = ${input.sourcePlayerId}
            union all select player_id from fantasy.roster_period_entries where player_id = ${input.sourcePlayerId}
            union all select player_id from fantasy.inferred_roster_changes where player_id = ${input.sourcePlayerId}
            union all select player_id from fantasy.player_projections where player_id = ${input.sourcePlayerId}
            union all select player_id from fantasy.player_adp where player_id = ${input.sourcePlayerId}
            union all select player_id from fantasy.pre_draft_targets where player_id = ${input.sourcePlayerId}
            union all select player_id from fantasy.player_season_stats where player_id = ${input.sourcePlayerId}
            union all select player_id from fantasy.auction_results where player_id = ${input.sourcePlayerId}
            union all select player_id from fantasy.player_rankings where player_id = ${input.sourcePlayerId}
          ) source_references
        `;
        if (remaining?.reference_count !== 0) {
          throw new Error('The player merge left source references behind');
        }

        return {
          auditId: audit.id,
          movedReferenceCounts: commitPlan.movedReferenceCounts,
        } satisfies PlayerIdentityMergeResult;
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError(() =>
            databaseUnavailable(
              'merge_player_identities',
              'The player identities could not be merged',
            ),
          ),
        );
    };

    const reconcileLeagueTeamIdentity = (
      input: LeagueTeamReconciliationInput,
    ): Effect.Effect<LeagueTeamReconciliationResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const teamSeasonIds = [...new Set(input.teamSeasonIds)];
        if (teamSeasonIds.length === 0 || input.resolvedByUserId.trim() === '') {
          throw new Error('A reconciliation requires teams and an authenticated user');
        }

        const teamRows = yield* sql<{
          season_key: string;
          source_league_history_id: string;
          source_team_id: string;
          team_season_id: string;
        }>`
          select
            lts.id as team_season_id,
            ls.source_league_history_id,
            ls.season_key,
            lts.source_team_id
          from fantasy.league_team_seasons lts
          join fantasy.league_seasons ls on ls.id = lts.league_season_id
          where
            lts.id in ${sql.in(teamSeasonIds)}
            and ls.source = 'fantrax'
            and ls.source_league_history_id is not null
          for update of lts
        `;
        if (teamRows.length !== teamSeasonIds.length) {
          throw new Error('One or more league team-seasons could not be found');
        }

        const leagueHistoryIds = new Set(teamRows.map((team) => team.source_league_history_id));
        if (leagueHistoryIds.size !== 1) {
          throw new Error('A reconciliation cannot cross league histories');
        }
        const sourceLeagueHistoryId = teamRows[0]!.source_league_history_id;

        let member: { display_name: string; id: string } | undefined;
        if (input.target.kind === 'existing') {
          const displayName = input.target.displayName?.trim();
          if (displayName !== undefined && (displayName.length < 2 || displayName.length > 80)) {
            throw new Error('Canonical manager names must contain 2 to 80 characters');
          }
          if (displayName === undefined) {
            [member] = yield* sql<{ display_name: string; id: string }>`
              select id, display_name
              from fantasy.league_members
              where
                id = ${input.target.memberId}
                and source_league_history_id = ${sourceLeagueHistoryId}
            `;
          } else {
            [member] = yield* sql<{ display_name: string; id: string }>`
              update fantasy.league_members
              set
                display_name = ${displayName},
                display_name_resolution = 'manual',
                updated_at = now()
              where
                id = ${input.target.memberId}
                and source_league_history_id = ${sourceLeagueHistoryId}
              returning id, display_name
            `;
          }
        } else {
          const displayName = input.target.displayName.trim();
          const canonicalKey = normalizeLeagueMemberKey(displayName);
          if (displayName === '' || canonicalKey === '') {
            throw new Error('A new canonical member requires a display name');
          }
          [member] = yield* sql<{ display_name: string; id: string }>`
            insert into fantasy.league_members
              (source_league_history_id, canonical_key, display_name, display_name_resolution)
            values
              (${sourceLeagueHistoryId}, ${canonicalKey}, ${displayName}, 'manual')
            on conflict (source_league_history_id, canonical_key) do update set
              display_name = excluded.display_name,
              display_name_resolution = 'manual',
              updated_at = now()
            returning id, display_name
          `;
        }
        if (member === undefined) {
          throw new Error('The canonical league member could not be found or created');
        }

        for (const team of teamRows) {
          yield* sql`
            insert into fantasy.league_team_identity_overrides
              (
                source_league_history_id,
                season_key,
                source_team_id,
                league_member_id,
                resolved_by_user_id
              )
            values
              (
                ${team.source_league_history_id},
                ${team.season_key},
                ${team.source_team_id},
                ${member.id},
                ${input.resolvedByUserId}
              )
            on conflict (source_league_history_id, season_key, source_team_id) do update set
              league_member_id = excluded.league_member_id,
              resolved_by_user_id = excluded.resolved_by_user_id,
              updated_at = now()
          `;
          yield* sql`
            update fantasy.league_team_seasons
            set
              league_member_id = ${member.id},
              identity_resolution = 'manual_override',
              identity_confidence = 100,
              updated_at = now()
            where id = ${team.team_season_id}
          `;
        }

        return {
          displayName: member.display_name,
          memberId: member.id,
          resolvedTeamSeasonCount: teamRows.length,
        } satisfies LeagueTeamReconciliationResult;
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError(() =>
            databaseUnavailable(
              'reconcile_league_team_identity',
              'The league team identity could not be reconciled',
            ),
          ),
        );
    };

    const replaceHistoricalAuctions = (
      batch: HistoricalAuctionBatch,
    ): Effect.Effect<HistoricalAuctionImportResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const importedTeamKeys = new Set(
          batch.leagueTeams.map((team) =>
            leagueTeamIdentityKey(team.leagueHistoryId, team.seasonKey, team.sourceTeamId),
          ),
        );
        const overrideRows = yield* sql<{
          league_member_id: string;
          season_key: string;
          source_league_history_id: string;
          source_team_id: string;
        }>`
          select
            source_league_history_id,
            season_key,
            source_team_id,
            league_member_id
          from fantasy.league_team_identity_overrides
        `;
        const manualOverrides = new Map(
          overrideRows
            .filter((row) =>
              importedTeamKeys.has(
                leagueTeamIdentityKey(
                  row.source_league_history_id,
                  row.season_key,
                  row.source_team_id,
                ),
              ),
            )
            .map((row) => [
              leagueTeamIdentityKey(
                row.source_league_history_id,
                row.season_key,
                row.source_team_id,
              ),
              row.league_member_id,
            ]),
        );
        const unresolvedTeamSeasonCount = batch.leagueTeams.filter(
          (team) =>
            team.memberKey === null &&
            !manualOverrides.has(
              leagueTeamIdentityKey(team.leagueHistoryId, team.seasonKey, team.sourceTeamId),
            ),
        ).length;

        const [ingestionRun] = yield* sql<{ id: string }>`
          insert into fantasy.ingestion_runs
            (source, resource, status, record_count, details)
          values
            (
              'historical-auction-import',
              'auction-results',
              'running',
              ${batch.auctions.length},
              ${sql.json({
                fingerprint: batch.fingerprint,
                canonicalMemberCount: batch.leagueMembers.length,
                leagueTeamSeasonCount: batch.leagueTeams.length,
                seasonCount: batch.seasons.length,
                manualOverrideCount: manualOverrides.size,
                unresolvedTeamSeasonCount,
                warningCount: batch.warningCount,
              })}
            )
          returning id
        `;
        if (ingestionRun === undefined) {
          return yield* Effect.fail(
            databaseUnavailable(
              'replace_historical_auctions',
              'The historical auction import could not be completed',
            ),
          );
        }

        const seasonIds = new Map<string, string>();
        for (const season of batch.seasons) {
          const [record] = yield* sql<{ id: string }>`
            insert into fantasy.league_seasons
              (
                source,
                source_league_history_id,
                source_league_id,
                season_key,
                name,
                team_count,
                roster_size,
                base_budget_cents
              )
            values
              (
                'fantrax',
                ${season.leagueHistoryId},
                ${season.leagueId},
                ${season.seasonKey},
                ${`Fantasy Basketball ${season.seasonKey}`},
                ${season.teamCount},
                ${season.rosterSize},
                ${season.baseBudgetCents}
              )
            on conflict (source, source_league_id) do update set
              season_key = excluded.season_key,
              source_league_history_id = excluded.source_league_history_id,
              name = excluded.name,
              team_count = excluded.team_count,
              roster_size = excluded.roster_size,
              base_budget_cents = excluded.base_budget_cents,
              updated_at = now()
            returning id
          `;
          if (record === undefined) {
            return yield* Effect.fail(
              databaseUnavailable(
                'replace_historical_auctions',
                'The historical auction import could not be completed',
              ),
            );
          }
          seasonIds.set(season.seasonKey, record.id);
        }

        const playerIds = new Map<string, string>();
        for (const player of batch.players) {
          const existing = yield* sql<{ player_id: string }>`
            select player_id
            from fantasy.player_identities
            where source = 'fantrax' and external_id = ${player.fantraxId}
          `;
          let playerId = existing[0]?.player_id;
          if (playerId === undefined) {
            const [created] = yield* sql<{ id: string }>`
              insert into fantasy.players (canonical_name, normalized_name)
              values (${player.canonicalName}, ${player.normalizedName})
              returning id
            `;
            if (created === undefined) {
              return yield* Effect.fail(
                databaseUnavailable(
                  'replace_historical_auctions',
                  'The historical auction import could not be completed',
                ),
              );
            }
            playerId = created.id;
            yield* sql`
              insert into fantasy.player_identities
                (player_id, source, external_id, source_name)
              values
                (${playerId}, 'fantrax', ${player.fantraxId}, ${player.canonicalName})
            `;
          } else {
            yield* sql`
              update fantasy.players
              set
                canonical_name = ${player.canonicalName},
                normalized_name = ${player.normalizedName},
                updated_at = now()
              where id = ${playerId}
            `;
            yield* sql`
              update fantasy.player_identities
              set source_name = ${player.canonicalName}, updated_at = now()
              where source = 'fantrax' and external_id = ${player.fantraxId}
            `;
          }
          playerIds.set(player.fantraxId, playerId);
        }

        const importedSeasonIds = [...seasonIds.values()];
        if (importedSeasonIds.length > 0) {
          yield* sql`
            delete from fantasy.auction_results
            where league_season_id in ${sql.in(importedSeasonIds)}
          `;
          yield* sql`
            delete from fantasy.league_team_seasons
            where league_season_id in ${sql.in(importedSeasonIds)}
          `;
        }

        const memberIds = new Map<string, string>();
        for (const member of batch.leagueMembers) {
          const [record] = yield* sql<{ id: string }>`
            insert into fantasy.league_members
              (source_league_history_id, canonical_key, display_name)
            values
              (${member.leagueHistoryId}, ${member.canonicalKey}, ${member.displayName})
            on conflict (source_league_history_id, canonical_key) do update set
              display_name = case
                when league_members.display_name_resolution = 'manual'
                  then league_members.display_name
                else excluded.display_name
              end,
              updated_at = now()
            returning id
          `;
          if (record === undefined) {
            throw new Error(`Canonical member ${member.canonicalKey} was not created`);
          }
          memberIds.set(`${member.leagueHistoryId}:${member.canonicalKey}`, record.id);
        }

        const effectiveMemberIds = new Set<string>();
        const leagueTeamSeasonIds = new Map<string, string>();
        for (const team of batch.leagueTeams) {
          const leagueSeasonId = seasonIds.get(team.seasonKey);
          const manualMemberId = manualOverrides.get(
            leagueTeamIdentityKey(team.leagueHistoryId, team.seasonKey, team.sourceTeamId),
          );
          const leagueMemberId =
            manualMemberId ??
            (team.memberKey === null
              ? null
              : memberIds.get(`${team.leagueHistoryId}:${team.memberKey}`));
          if (leagueSeasonId === undefined || (team.memberKey !== null && !leagueMemberId)) {
            throw new Error(`Canonical team references are incomplete for ${team.seasonKey}`);
          }
          if (leagueMemberId !== null && leagueMemberId !== undefined) {
            effectiveMemberIds.add(leagueMemberId);
          }
          const [record] = yield* sql<{ id: string }>`
            insert into fantasy.league_team_seasons
              (
                league_season_id,
                league_member_id,
                source,
                source_team_id,
                team_name,
                division,
                identity_resolution,
                identity_confidence
              )
            values
              (
                ${leagueSeasonId},
                ${leagueMemberId ?? null},
                'fantrax',
                ${team.sourceTeamId},
                ${team.teamName},
                ${team.division},
                ${manualMemberId === undefined ? team.identityResolution : 'manual_override'},
                ${manualMemberId === undefined ? team.identityConfidence : 100}
              )
            returning id
          `;
          if (record === undefined) {
            throw new Error(`League team ${team.sourceTeamId} was not created`);
          }
          leagueTeamSeasonIds.set(`${team.seasonKey}:${team.sourceTeamId}`, record.id);
        }

        const sourceRecords = batch.auctions.map((auction) => ({
          captured_at: new Date(),
          id: randomUUID(),
          ingestion_run_id: ingestionRun.id,
          payload: auction.sourcePayload,
          source_record_id: `${auction.seasonKey}:${auction.fantraxPick}`,
        }));
        if (sourceRecords.length > 0) {
          yield* sql`
            insert into fantasy.source_records ${sql.insert(sourceRecords)}
          `;
        }

        const auctionRecords = batch.auctions.map((auction, index) => {
          const leagueSeasonId = seasonIds.get(auction.seasonKey);
          const leagueTeamSeasonId = leagueTeamSeasonIds.get(
            `${auction.seasonKey}:${auction.teamId}`,
          );
          const playerId = playerIds.get(auction.fantraxPlayerId);
          const sourceRecord = sourceRecords[index];
          if (
            leagueSeasonId === undefined ||
            leagueTeamSeasonId === undefined ||
            playerId === undefined ||
            sourceRecord === undefined
          ) {
            throw new Error('Validated auction references are incomplete');
          }
          return {
            amount_cents: auction.amountCents,
            drafted_at: new Date(auction.draftedAtMs),
            league_season_id: leagueSeasonId,
            league_team_season_id: leagueTeamSeasonId,
            manager_name: auction.managerLabel ?? auction.teamName,
            nomination_order: auction.fantraxPick,
            player_id: playerId,
            roster_slot: auction.rosterSlot,
            source_record_id: sourceRecord.id,
            team_external_id: auction.teamId,
            team_name: auction.teamName,
          };
        });
        if (auctionRecords.length > 0) {
          yield* sql`
            insert into fantasy.auction_results ${sql.insert(auctionRecords)}
          `;
        }

        yield* sql`
          update fantasy.ingestion_runs
          set status = 'completed', finished_at = now()
          where id = ${ingestionRun.id}
        `;

        return {
          auctionCount: batch.auctions.length,
          canonicalMemberCount: effectiveMemberIds.size,
          ingestionRunId: ingestionRun.id,
          leagueTeamSeasonCount: batch.leagueTeams.length,
          playerCount: batch.players.length,
          seasonCount: batch.seasons.length,
          unresolvedTeamSeasonCount,
        };
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError(() =>
            databaseUnavailable(
              'replace_historical_auctions',
              'The historical auction import could not be completed',
            ),
          ),
        );
    };

    const replacePlayerProduction = (
      batch: PlayerProductionBatch,
    ): Effect.Effect<PlayerProductionImportResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const [ingestionRun] = yield* sql<{ id: string }>`
          insert into fantasy.ingestion_runs
            (source, resource, status, record_count, details)
          values
            (
              'balldontlie',
              'game-player-stats',
              'running',
              ${batch.records.length},
              ${sql.json({
                fingerprint: batch.fingerprint,
                gameStatCount: batch.gameStatCount,
                seasonCount: batch.seasons.length,
              })}
            )
          returning id
        `;
        if (ingestionRun === undefined) {
          return yield* Effect.fail(
            databaseUnavailable(
              'replace_player_production',
              'The player production import could not be completed',
            ),
          );
        }

        const playerReferences = new Map<
          string,
          { providerPlayerId: string; providerPlayerName: string }
        >();
        for (const identity of batch.identities) {
          const existing = playerReferences.get(identity.fantraxId);
          if (
            existing !== undefined &&
            (existing.providerPlayerId !== identity.providerPlayerId ||
              existing.providerPlayerName !== identity.providerPlayerName)
          ) {
            throw new Error(`Conflicting provider identities for ${identity.fantraxId}`);
          }
          playerReferences.set(identity.fantraxId, {
            providerPlayerId: identity.providerPlayerId,
            providerPlayerName: identity.providerPlayerName,
          });
        }

        const playerIds = new Map<string, string>();
        for (const [fantraxId, provider] of playerReferences) {
          const [fantraxIdentity] = yield* sql<{ player_id: string }>`
            select player_id
            from fantasy.player_identities
            where source = 'fantrax' and external_id = ${fantraxId}
          `;
          if (fantraxIdentity === undefined) {
            throw new Error(`Unknown Fantrax player ${fantraxId}`);
          }

          const [providerIdentity] = yield* sql<{ player_id: string }>`
            select player_id
            from fantasy.player_identities
            where source = 'balldontlie' and external_id = ${provider.providerPlayerId}
          `;
          if (
            providerIdentity !== undefined &&
            providerIdentity.player_id !== fantraxIdentity.player_id
          ) {
            throw new Error(`BALLDONTLIE player ${provider.providerPlayerId} is already claimed`);
          }

          yield* sql`
            insert into fantasy.player_identities
              (player_id, source, external_id, source_name)
            values
              (
                ${fantraxIdentity.player_id},
                'balldontlie',
                ${provider.providerPlayerId},
                ${provider.providerPlayerName}
              )
            on conflict (source, external_id) do update set
              source_name = excluded.source_name,
              updated_at = now()
          `;
          playerIds.set(fantraxId, fantraxIdentity.player_id);
        }

        if (batch.seasons.length > 0) {
          yield* sql`
            delete from fantasy.player_season_stats
            where
              source = 'balldontlie'
              and period = 'regular-season'
              and season_key in ${sql.in(batch.seasons)}
          `;
        }

        const sourceRecords = batch.records.map((record) => ({
          captured_at: new Date(),
          id: randomUUID(),
          ingestion_run_id: ingestionRun.id,
          payload: record.sourcePayload,
          source_record_id: `${record.seasonKey}:${record.providerPlayerId}:${record.period}`,
        }));
        if (sourceRecords.length > 0) {
          yield* sql`
            insert into fantasy.source_records ${sql.insert(sourceRecords)}
          `;
        }

        const statRecords = batch.records.map((record, index) => {
          const playerId = playerIds.get(record.fantraxId);
          const sourceRecord = sourceRecords[index];
          if (playerId === undefined || sourceRecord === undefined) {
            throw new Error('Validated player production references are incomplete');
          }
          return {
            games_played: record.gamesPlayed,
            period: record.period,
            player_id: playerId,
            season_key: record.seasonKey,
            source: 'balldontlie',
            source_record_id: sourceRecord.id,
            stats: record.stats,
            updated_at: new Date(),
          };
        });
        if (statRecords.length > 0) {
          yield* sql`
            insert into fantasy.player_season_stats ${sql.insert(statRecords)}
          `;
        }

        yield* sql`
          update fantasy.ingestion_runs
          set status = 'completed', finished_at = now()
          where id = ${ingestionRun.id}
        `;

        return {
          ingestionRunId: ingestionRun.id,
          playerCount: playerReferences.size,
          playerSeasonCount: batch.records.length,
          seasonCount: batch.seasons.length,
        };
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError(() =>
            databaseUnavailable(
              'replace_player_production',
              'The player production import could not be completed',
            ),
          ),
        );
    };

    const replaceHistoricalScoring = (
      batch: HistoricalScoringBatch,
    ): Effect.Effect<HistoricalScoringImportResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const [ingestionRun] = yield* sql<{ id: string }>`
          insert into fantasy.ingestion_runs
            (source, resource, status, record_count, details)
          values
            (
              'league-config',
              'historical-rankings',
              'running',
              ${batch.rankings.length},
              ${sql.json({
                fingerprint: batch.fingerprint,
                name: batch.name,
                seasonCount: batch.seasons.length,
                stackTripleDoubleBonuses: batch.stackTripleDoubleBonuses,
                version: batch.version,
              })}
            )
          returning id
        `;
        if (ingestionRun === undefined) {
          return yield* Effect.fail(new Error('Scoring ingestion run was not created'));
        }

        const rankingRunIds = new Map<string, string>();
        for (const seasonKey of batch.seasons) {
          const seasonRecords = yield* sql<{ id: string }>`
            select id
            from fantasy.league_seasons
            where source = 'fantrax' and season_key = ${seasonKey}
          `;
          if (seasonRecords.length !== 1) {
            return yield* Effect.fail(
              new Error(`${seasonKey} must resolve to exactly one Fantrax league season`),
            );
          }
          const leagueSeasonId = seasonRecords[0]!.id;
          const [existingRuleSet] = yield* sql<{ id: string; name: string }>`
            select id, name
            from fantasy.scoring_rule_sets
            where league_season_id = ${leagueSeasonId} and version = ${batch.version}
          `;
          let ruleSetId = existingRuleSet?.id;
          if (existingRuleSet !== undefined) {
            const existingRules = yield* sql<{
              label: string;
              points: string;
              stat_key: string;
            }>`
              select label, points::text, stat_key
              from fantasy.scoring_rules
              where rule_set_id = ${existingRuleSet.id}
            `;
            const existingRulesByStat = new Map(existingRules.map((rule) => [rule.stat_key, rule]));
            const rulesMatch =
              existingRuleSet.name === batch.name &&
              existingRules.length === batch.rules.length &&
              batch.rules.every((rule) => {
                const existing = existingRulesByStat.get(rule.statKey);
                return (
                  existing !== undefined &&
                  existing.label === rule.label &&
                  Number(existing.points) === rule.points
                );
              });
            if (!rulesMatch) {
              return yield* Effect.fail(
                new Error(
                  `${seasonKey} scoring version ${batch.version} already exists with different rules; increment the version`,
                ),
              );
            }
          } else {
            const [createdRuleSet] = yield* sql<{ id: string }>`
              insert into fantasy.scoring_rule_sets
                (league_season_id, name, version)
              values
                (${leagueSeasonId}, ${batch.name}, ${batch.version})
              returning id
            `;
            if (createdRuleSet === undefined) {
              return yield* Effect.fail(
                new Error(`Scoring rules were not created for ${seasonKey}`),
              );
            }
            ruleSetId = createdRuleSet.id;

            const ruleRecords = batch.rules.map((rule) => ({
              label: rule.label,
              points: rule.points,
              rule_set_id: createdRuleSet.id,
              stat_key: rule.statKey,
            }));
            if (ruleRecords.length > 0) {
              yield* sql`
                insert into fantasy.scoring_rules ${sql.insert(ruleRecords)}
              `;
            }
          }
          if (ruleSetId === undefined) {
            return yield* Effect.fail(new Error(`Scoring rules are unavailable for ${seasonKey}`));
          }

          yield* sql`
            delete from fantasy.ranking_runs
            where scoring_rule_set_id = ${ruleSetId} and model = 'historical-actual'
          `;

          const [rankingRun] = yield* sql<{ id: string }>`
            insert into fantasy.ranking_runs
              (
                scoring_rule_set_id,
                season_key,
                model,
                model_version,
                parameters
              )
            values
              (
                ${ruleSetId},
                ${seasonKey},
                'historical-actual',
                '1',
                ${sql.json({
                  fingerprint: batch.fingerprint,
                  source: 'balldontlie',
                  stackTripleDoubleBonuses: batch.stackTripleDoubleBonuses,
                })}
              )
            returning id
          `;
          if (rankingRun === undefined) {
            return yield* Effect.fail(new Error(`Ranking run was not created for ${seasonKey}`));
          }
          rankingRunIds.set(seasonKey, rankingRun.id);
        }

        const rankingRecords = batch.rankings.map((ranking) => {
          const rankingRunId = rankingRunIds.get(ranking.seasonKey);
          if (rankingRunId === undefined) {
            throw new Error(`Ranking references unknown season ${ranking.seasonKey}`);
          }
          return {
            auction_value_cents: null,
            explanation: {
              components: ranking.components,
              gamesPlayed: ranking.gamesPlayed,
              kind: 'historical-actual',
            },
            player_id: ranking.playerId,
            projected_points: ranking.fantasyPoints,
            projected_points_per_game: ranking.fantasyPointsPerGame,
            rank: ranking.rank,
            ranking_run_id: rankingRunId,
            replacement_value: null,
          };
        });
        if (rankingRecords.length > 0) {
          yield* sql`
            insert into fantasy.player_rankings ${sql.insert(rankingRecords)}
          `;
        }

        yield* sql`
          update fantasy.ingestion_runs
          set status = 'completed', finished_at = now()
          where id = ${ingestionRun.id}
        `;

        return {
          ingestionRunId: ingestionRun.id,
          rankingCount: batch.rankings.length,
          ruleSetCount: batch.seasons.length,
          seasonCount: batch.seasons.length,
        };
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError(() =>
            databaseUnavailable(
              'replace_historical_scoring',
              'The historical scoring import could not be completed',
            ),
          ),
        );
    };

    const saveFantraxAdpSnapshot = (
      batch: FantraxAdpSnapshotBatch,
    ): Effect.Effect<FantraxAdpSnapshotImportResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const [existingSnapshot] = yield* sql<{
          ingestion_run_id: string;
          player_count: number;
          snapshot_id: string;
        }>`
          select
            ads.id as snapshot_id,
            ads.ingestion_run_id,
            count(pa.player_id)::integer as player_count
          from fantasy.adp_snapshots ads
          left join fantasy.player_adp pa on pa.snapshot_id = ads.id
          where ads.fingerprint = ${batch.fingerprint}
          group by ads.id, ads.ingestion_run_id
        `;
        if (existingSnapshot !== undefined) {
          return {
            alreadyImported: true,
            ingestionRunId: existingSnapshot.ingestion_run_id,
            newPlayerCount: 0,
            playerAdpCount: existingSnapshot.player_count,
            snapshotId: existingSnapshot.snapshot_id,
          };
        }

        const capturedAt = new Date(batch.capturedAt);
        if (Number.isNaN(capturedAt.getTime())) throw new Error('ADP capturedAt is invalid');
        const [ingestionRun] = yield* sql<{ id: string }>`
          insert into fantasy.ingestion_runs
            (source, resource, season_key, status, record_count, details)
          values
            (
              ${batch.source},
              'average-draft-position',
              ${batch.seasonKey},
              'running',
              ${batch.records.length},
              ${sql.json({ capturedAt: batch.capturedAt, fingerprint: batch.fingerprint })}
            )
          returning id
        `;
        if (ingestionRun === undefined) throw new Error('The ADP ingestion run was not created');

        const playerIds = new Map<string, string>();
        let newPlayerCount = 0;
        for (const record of batch.records) {
          let playerId = record.existingPlayerId;
          if (playerId === null) {
            const [identity] = yield* sql<{ player_id: string }>`
              select player_id
              from fantasy.player_identities
              where source = 'fantrax' and external_id = ${record.fantraxId}
            `;
            playerId = identity?.player_id ?? null;
          }
          if (playerId === null) {
            const nameMatches = yield* sql<{ id: string }>`
              select id
              from fantasy.players
              where normalized_name = ${record.normalizedName}
            `;
            if (nameMatches.length > 1) {
              throw new Error(`Canonical player ${record.canonicalName} is ambiguous`);
            }
            playerId = nameMatches[0]?.id ?? null;
          }
          if (playerId === null) {
            const [created] = yield* sql<{ id: string }>`
              insert into fantasy.players (canonical_name, normalized_name)
              values (${record.canonicalName}, ${record.normalizedName})
              returning id
            `;
            if (created === undefined) throw new Error(`${record.canonicalName} was not created`);
            playerId = created.id;
            newPlayerCount += 1;
          }

          const [claimedIdentity] = yield* sql<{ player_id: string }>`
            select player_id
            from fantasy.player_identities
            where source = 'fantrax' and external_id = ${record.fantraxId}
          `;
          if (claimedIdentity !== undefined && claimedIdentity.player_id !== playerId) {
            throw new Error(`Fantrax identity ${record.fantraxId} is already claimed`);
          }
          yield* sql`
            insert into fantasy.player_identities
              (player_id, source, external_id, source_name)
            values
              (${playerId}, 'fantrax', ${record.fantraxId}, ${record.sourceName})
            on conflict (source, external_id) do update set
              source_name = excluded.source_name,
              updated_at = now()
          `;
          playerIds.set(record.fantraxId, playerId);
        }

        const [snapshot] = yield* sql<{ id: string }>`
          insert into fantasy.adp_snapshots
            (
              ingestion_run_id,
              source,
              sport,
              season_key,
              captured_at,
              fingerprint,
              record_count
            )
          values
            (
              ${ingestionRun.id},
              ${batch.source},
              ${batch.sport},
              ${batch.seasonKey},
              ${capturedAt},
              ${batch.fingerprint},
              ${batch.records.length}
            )
          returning id
        `;
        if (snapshot === undefined) throw new Error('The ADP snapshot was not created');

        const sourceRecords = batch.records.map((record) => ({
          captured_at: capturedAt,
          id: randomUUID(),
          ingestion_run_id: ingestionRun.id,
          payload: record.sourcePayload,
          source_record_id: `${batch.seasonKey}:${record.fantraxId}`,
        }));
        if (sourceRecords.length > 0) {
          yield* sql`insert into fantasy.source_records ${sql.insert(sourceRecords)}`;
        }
        const adpRecords = batch.records.map((record, index) => {
          const playerId = playerIds.get(record.fantraxId);
          const sourceRecord = sourceRecords[index];
          if (playerId === undefined || sourceRecord === undefined) {
            throw new Error('Validated ADP references are incomplete');
          }
          return {
            adp: record.adp,
            player_id: playerId,
            position: record.position,
            snapshot_id: snapshot.id,
            source_record_id: sourceRecord.id,
          };
        });
        if (adpRecords.length > 0) {
          yield* sql`insert into fantasy.player_adp ${sql.insert(adpRecords)}`;
        }
        yield* sql`
          update fantasy.ingestion_runs
          set
            status = 'completed',
            finished_at = now(),
            details = details || ${sql.json({ newPlayerCount, snapshotId: snapshot.id })}
          where id = ${ingestionRun.id}
        `;
        return {
          alreadyImported: false,
          ingestionRunId: ingestionRun.id,
          newPlayerCount,
          playerAdpCount: batch.records.length,
          snapshotId: snapshot.id,
        };
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError(() =>
            databaseUnavailable(
              'save_fantrax_adp_snapshot',
              'The Fantrax ADP snapshot could not be saved',
            ),
          ),
        );
    };

    const saveLeaguePerformance = (
      batch: LeaguePerformanceBatch,
    ): Effect.Effect<LeaguePerformanceImportResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const [existingRun] = yield* sql<{
          id: string;
          matchup_count: number;
          season_count: number;
          standing_count: number;
        }>`
          select
            id,
            coalesce((details ->> 'matchupCount')::integer, 0) as matchup_count,
            coalesce((details ->> 'seasonCount')::integer, 0) as season_count,
            coalesce((details ->> 'standingCount')::integer, 0) as standing_count
          from fantasy.ingestion_runs
          where
            source = ${batch.source}
            and resource = 'league-performance'
            and status = 'completed'
            and details ->> 'fingerprint' = ${batch.fingerprint}
          order by finished_at desc
          limit 1
        `;
        if (existingRun !== undefined) {
          return {
            alreadyImported: true,
            ingestionRunId: existingRun.id,
            matchupCount: existingRun.matchup_count,
            seasonCount: existingRun.season_count,
            standingCount: existingRun.standing_count,
          };
        }

        const [ingestionRun] = yield* sql<{ id: string }>`
          insert into fantasy.ingestion_runs
            (source, resource, status, record_count, details)
          values
            (
              ${batch.source},
              'league-performance',
              'running',
              ${batch.standings.length + batch.matchups.length},
              ${sql.json({
                fingerprint: batch.fingerprint,
                matchupCount: batch.matchups.length,
                seasonCount: batch.seasons.length,
                standingCount: batch.standings.length,
              })}
            )
          returning id
        `;
        if (ingestionRun === undefined) {
          throw new Error('League performance ingestion run was not created');
        }

        const sourceLeagueIds = batch.seasons.map((season) => season.leagueId);
        const leagueSeasonRows = yield* sql<{
          id: string;
          source_league_id: string;
        }>`
          select id, source_league_id
          from fantasy.league_seasons
          where source = 'fantrax' and source_league_id in ${sql.in(sourceLeagueIds)}
        `;
        if (leagueSeasonRows.length !== batch.seasons.length) {
          throw new Error(
            `League performance resolved ${leagueSeasonRows.length}/${batch.seasons.length} league seasons`,
          );
        }
        const leagueSeasonIds = new Map(
          leagueSeasonRows.map((season) => [season.source_league_id, season.id]),
        );
        const leagueSeasonIdValues = leagueSeasonRows.map((season) => season.id);
        const teamSeasonRows = yield* sql<{
          id: string;
          source_league_id: string;
          source_team_id: string;
        }>`
          select
            lts.id,
            ls.source_league_id,
            lts.source_team_id
          from fantasy.league_team_seasons lts
          join fantasy.league_seasons ls on ls.id = lts.league_season_id
          where ls.id in ${sql.in(leagueSeasonIdValues)}
        `;
        const teamSeasonIds = new Map(
          teamSeasonRows.map((team) => [
            `${team.source_league_id}:${team.source_team_id}`,
            team.id,
          ]),
        );
        const resolveTeamSeasonId = (leagueId: string, sourceTeamId: string): string => {
          const teamSeasonId = teamSeasonIds.get(`${leagueId}:${sourceTeamId}`);
          if (teamSeasonId === undefined) {
            throw new Error(`${leagueId} references unknown team ${sourceTeamId}`);
          }
          return teamSeasonId;
        };

        yield* sql`
          delete from fantasy.league_matchups
          where league_season_id in ${sql.in(leagueSeasonIdValues)}
        `;
        yield* sql`
          delete from fantasy.league_team_standings
          where league_team_season_id in ${sql.in(teamSeasonRows.map((team) => team.id))}
        `;
        yield* sql`
          delete from fantasy.league_season_performance
          where league_season_id in ${sql.in(leagueSeasonIdValues)}
        `;

        const performanceRecords = batch.seasons.map((season) => {
          const leagueSeasonId = leagueSeasonIds.get(season.leagueId);
          if (leagueSeasonId === undefined) {
            throw new Error(`League season ${season.leagueId} was not resolved`);
          }
          return {
            final_scoring_period: season.finalScoringPeriod,
            first_playoff_period: season.firstPlayoffPeriod,
            ingestion_run_id: ingestionRun.id,
            last_regular_season_period: season.lastRegularSeasonPeriod,
            league_season_id: leagueSeasonId,
            playoff_team_count: season.playoffTeamCount,
            scoring_type: season.scoringType,
            updated_at: new Date(),
          };
        });
        yield* sql`
          insert into fantasy.league_season_performance ${sql.insert(performanceRecords)}
        `;

        const standingSourceRecords = batch.standings.map((standing) => ({
          captured_at: new Date(),
          id: randomUUID(),
          ingestion_run_id: ingestionRun.id,
          payload: standing.sourcePayload,
          source_record_id: `${standing.seasonKey}:standings:${standing.sourceTeamId}`,
        }));
        const matchupSourceRecords = batch.matchups.map((matchup) => ({
          captured_at: new Date(),
          id: randomUUID(),
          ingestion_run_id: ingestionRun.id,
          payload: matchup.sourcePayload,
          source_record_id: `${matchup.seasonKey}:matchup:${matchup.scoringPeriod}:${matchup.awayTeamId}:${matchup.homeTeamId}`,
        }));
        yield* sql`
          insert into fantasy.source_records ${sql.insert([
            ...standingSourceRecords,
            ...matchupSourceRecords,
          ])}
        `;

        const standingRecords = batch.standings.map((standing, index) => {
          const sourceRecord = standingSourceRecords[index];
          if (sourceRecord === undefined) throw new Error('Standing source record is missing');
          return {
            games_back: standing.gamesBack,
            ingestion_run_id: ingestionRun.id,
            league_team_season_id: resolveTeamSeasonId(standing.leagueId, standing.sourceTeamId),
            losses: standing.losses,
            made_playoffs: standing.madePlayoffs,
            playoff_seed: standing.playoffSeed,
            points_for: standing.pointsFor,
            postseason_finish: standing.postseasonFinish,
            postseason_result: standing.postseasonResult,
            rank: standing.rank,
            record: standing.record,
            source_record_id: sourceRecord.id,
            ties: standing.ties,
            updated_at: new Date(),
            win_percentage: standing.winPercentage,
            wins: standing.wins,
          };
        });
        yield* sql`
          insert into fantasy.league_team_standings ${sql.insert(standingRecords)}
        `;

        const matchupRecords = batch.matchups.map((matchup, index) => {
          const leagueSeasonId = leagueSeasonIds.get(matchup.leagueId);
          const sourceRecord = matchupSourceRecords[index];
          if (leagueSeasonId === undefined || sourceRecord === undefined) {
            throw new Error('Matchup references are incomplete');
          }
          return {
            away_category_totals: matchup.awayCategoryTotals,
            away_games_played: matchup.awayGamesPlayed,
            away_score: matchup.awayScore,
            away_team_season_id: resolveTeamSeasonId(matchup.leagueId, matchup.awayTeamId),
            home_category_totals: matchup.homeCategoryTotals,
            home_games_played: matchup.homeGamesPlayed,
            home_score: matchup.homeScore,
            home_team_season_id: resolveTeamSeasonId(matchup.leagueId, matchup.homeTeamId),
            id: randomUUID(),
            ingestion_run_id: ingestionRun.id,
            is_tie: matchup.isTie,
            league_season_id: leagueSeasonId,
            period_end_at: new Date(matchup.periodEndAt),
            period_start_at: new Date(matchup.periodStartAt),
            phase: matchup.phase,
            playoff_round: matchup.playoffRound,
            scoring_period: matchup.scoringPeriod,
            source_record_id: sourceRecord.id,
            winner_team_season_id:
              matchup.winnerTeamId === null
                ? null
                : resolveTeamSeasonId(matchup.leagueId, matchup.winnerTeamId),
          };
        });
        yield* sql`
          insert into fantasy.league_matchups ${sql.insert(matchupRecords)}
        `;
        yield* sql`
          update fantasy.ingestion_runs
          set status = 'completed', finished_at = now()
          where id = ${ingestionRun.id}
        `;

        return {
          alreadyImported: false,
          ingestionRunId: ingestionRun.id,
          matchupCount: batch.matchups.length,
          seasonCount: batch.seasons.length,
          standingCount: batch.standings.length,
        };
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError(() =>
            databaseUnavailable(
              'save_league_performance',
              'The league performance import could not be saved',
            ),
          ),
        );
    };

    const saveLeagueRosterHistory = (
      batch: LeagueRosterHistoryBatch,
    ): Effect.Effect<LeagueRosterHistoryImportResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const [existingRun] = yield* sql<{
          change_count: number;
          id: string;
          new_player_count: number;
          player_count: number;
          season_count: number;
          snapshot_count: number;
          snapshot_entry_count: number;
        }>`
          select
            id,
            coalesce((details ->> 'changeCount')::integer, 0) as change_count,
            coalesce((details ->> 'newPlayerCount')::integer, 0) as new_player_count,
            coalesce((details ->> 'playerCount')::integer, 0) as player_count,
            coalesce((details ->> 'seasonCount')::integer, 0) as season_count,
            coalesce((details ->> 'snapshotCount')::integer, 0) as snapshot_count,
            coalesce((details ->> 'snapshotEntryCount')::integer, 0)
              as snapshot_entry_count
          from fantasy.ingestion_runs
          where
            source = ${batch.source}
            and resource = 'roster-history'
            and status = 'completed'
            and details ->> 'fingerprint' = ${batch.fingerprint}
          order by finished_at desc
          limit 1
        `;
        if (existingRun !== undefined) {
          return {
            alreadyImported: true,
            changeCount: existingRun.change_count,
            ingestionRunId: existingRun.id,
            newPlayerCount: existingRun.new_player_count,
            playerCount: existingRun.player_count,
            seasonCount: existingRun.season_count,
            snapshotCount: existingRun.snapshot_count,
            snapshotEntryCount: existingRun.snapshot_entry_count,
          };
        }

        const snapshotEntryCount = batch.snapshots.reduce(
          (count, snapshot) => count + snapshot.entries.length,
          0,
        );
        const [ingestionRun] = yield* sql<{ id: string }>`
          insert into fantasy.ingestion_runs
            (source, resource, status, record_count, details)
          values
            (
              ${batch.source},
              'roster-history',
              'running',
              ${batch.snapshots.length + snapshotEntryCount + batch.changes.length},
              ${sql.json({
                changeCount: batch.changes.length,
                fingerprint: batch.fingerprint,
                playerCount: batch.players.length,
                seasonCount: batch.seasons.length,
                snapshotCount: batch.snapshots.length,
                snapshotEntryCount,
              })}
            )
          returning id
        `;
        if (ingestionRun === undefined) {
          throw new Error('Roster history ingestion run was not created');
        }

        const sourceLeagueIds = batch.seasons.map((season) => season.leagueId);
        const leagueSeasonRows = yield* sql<{
          id: string;
          source_league_id: string;
        }>`
          select id, source_league_id
          from fantasy.league_seasons
          where source = 'fantrax' and source_league_id in ${sql.in(sourceLeagueIds)}
        `;
        if (leagueSeasonRows.length !== batch.seasons.length) {
          throw new Error(
            `Roster history resolved ${leagueSeasonRows.length}/${batch.seasons.length} league seasons`,
          );
        }
        const leagueSeasonIds = new Map(
          leagueSeasonRows.map((season) => [season.source_league_id, season.id]),
        );
        const teamSeasonRows = yield* sql<{
          id: string;
          source_league_id: string;
          source_team_id: string;
        }>`
          select lts.id, ls.source_league_id, lts.source_team_id
          from fantasy.league_team_seasons lts
          join fantasy.league_seasons ls on ls.id = lts.league_season_id
          where ls.id in ${sql.in(leagueSeasonRows.map((season) => season.id))}
        `;
        const teamSeasonIds = new Map(
          teamSeasonRows.map((team) => [
            `${team.source_league_id}:${team.source_team_id}`,
            team.id,
          ]),
        );
        const resolveTeamSeasonId = (leagueId: string, sourceTeamId: string): string => {
          const teamSeasonId = teamSeasonIds.get(`${leagueId}:${sourceTeamId}`);
          if (teamSeasonId === undefined) {
            throw new Error(`${leagueId} references unknown roster team ${sourceTeamId}`);
          }
          return teamSeasonId;
        };

        const playerIds = new Map<string, string>();
        let newPlayerCount = 0;
        for (const player of batch.players) {
          const [identity] = yield* sql<{ player_id: string }>`
            select player_id
            from fantasy.player_identities
            where source = 'fantrax' and external_id = ${player.fantraxId}
          `;
          let playerId = identity?.player_id ?? null;
          if (playerId === null) {
            const nameMatches = yield* sql<{ id: string }>`
              select id
              from fantasy.players
              where normalized_name = ${player.normalizedName}
            `;
            if (nameMatches.length > 1) {
              throw new Error(`Canonical player ${player.canonicalName} is ambiguous`);
            }
            playerId = nameMatches[0]?.id ?? null;
          }
          if (playerId === null) {
            const [created] = yield* sql<{ id: string }>`
              insert into fantasy.players (canonical_name, normalized_name)
              values (${player.canonicalName}, ${player.normalizedName})
              returning id
            `;
            if (created === undefined) throw new Error(`${player.canonicalName} was not created`);
            playerId = created.id;
            newPlayerCount += 1;
          }
          yield* sql`
            insert into fantasy.player_identities
              (player_id, source, external_id, source_name)
            values
              (${playerId}, 'fantrax', ${player.fantraxId}, ${player.sourceName})
            on conflict (source, external_id) do update set
              source_name = excluded.source_name,
              updated_at = now()
          `;
          playerIds.set(player.fantraxId, playerId);
        }

        yield* sql`
          delete from fantasy.roster_period_snapshots
          where league_season_id in ${sql.in(leagueSeasonRows.map((season) => season.id))}
        `;

        const sourceRecords = batch.snapshots.map((snapshot) => ({
          captured_at: new Date(),
          id: randomUUID(),
          ingestion_run_id: ingestionRun.id,
          payload: snapshot.sourcePayload,
          source_record_id: `${snapshot.seasonKey}:roster-period:${snapshot.rosterPeriod}`,
        }));
        for (let index = 0; index < sourceRecords.length; index += 250) {
          yield* sql`
            insert into fantasy.source_records ${sql.insert(sourceRecords.slice(index, index + 250))}
          `;
        }

        const baselineByLeague = new Map(
          batch.seasons.map((season) => [season.leagueId, season.baselineRosterPeriod]),
        );
        const snapshotIds = new Map<string, string>();
        const snapshotRecords = batch.snapshots.map((snapshot, index) => {
          const leagueSeasonId = leagueSeasonIds.get(snapshot.leagueId);
          const sourceRecord = sourceRecords[index];
          if (leagueSeasonId === undefined || sourceRecord === undefined) {
            throw new Error('Roster snapshot references are incomplete');
          }
          const id = randomUUID();
          snapshotIds.set(`${snapshot.leagueId}:${snapshot.rosterPeriod}`, id);
          return {
            id,
            ingestion_run_id: ingestionRun.id,
            is_baseline: baselineByLeague.get(snapshot.leagueId) === snapshot.rosterPeriod,
            league_season_id: leagueSeasonId,
            period_end_at: new Date(snapshot.periodEndAt),
            period_start_at: new Date(snapshot.periodStartAt),
            roster_period: snapshot.rosterPeriod,
            source_record_id: sourceRecord.id,
          };
        });
        for (let index = 0; index < snapshotRecords.length; index += 500) {
          yield* sql`
            insert into fantasy.roster_period_snapshots ${sql.insert(snapshotRecords.slice(index, index + 500))}
          `;
        }

        const entryRecords = batch.snapshots.flatMap((snapshot) => {
          const snapshotId = snapshotIds.get(`${snapshot.leagueId}:${snapshot.rosterPeriod}`);
          if (snapshotId === undefined) throw new Error('Roster snapshot ID is missing');
          return snapshot.entries.map((entry) => {
            const playerId = playerIds.get(entry.fantraxId);
            if (playerId === undefined) {
              throw new Error(`Roster player ${entry.fantraxId} was not resolved`);
            }
            return {
              league_team_season_id: resolveTeamSeasonId(snapshot.leagueId, entry.sourceTeamId),
              player_id: playerId,
              position: entry.position,
              snapshot_id: snapshotId,
              status: entry.status,
            };
          });
        });
        for (let index = 0; index < entryRecords.length; index += 2_000) {
          yield* sql`
            insert into fantasy.roster_period_entries ${sql.insert(entryRecords.slice(index, index + 2_000))}
          `;
        }

        const changeRecords = batch.changes.map((change) => {
          const leagueSeasonId = leagueSeasonIds.get(change.leagueId);
          const playerId = playerIds.get(change.fantraxId);
          const previousSnapshotId = snapshotIds.get(
            `${change.leagueId}:${change.previousRosterPeriod}`,
          );
          const snapshotId = snapshotIds.get(`${change.leagueId}:${change.rosterPeriod}`);
          if (
            leagueSeasonId === undefined ||
            playerId === undefined ||
            previousSnapshotId === undefined ||
            snapshotId === undefined
          ) {
            throw new Error('Roster change references are incomplete');
          }
          return {
            change_type: change.changeType,
            from_position: change.fromPosition,
            from_status: change.fromStatus,
            from_team_season_id:
              change.fromTeamId === null
                ? null
                : resolveTeamSeasonId(change.leagueId, change.fromTeamId),
            id: randomUUID(),
            ingestion_run_id: ingestionRun.id,
            league_season_id: leagueSeasonId,
            observed_at: new Date(change.observedAt),
            player_id: playerId,
            previous_roster_period: change.previousRosterPeriod,
            previous_snapshot_id: previousSnapshotId,
            roster_period: change.rosterPeriod,
            snapshot_id: snapshotId,
            to_position: change.toPosition,
            to_status: change.toStatus,
            to_team_season_id:
              change.toTeamId === null
                ? null
                : resolveTeamSeasonId(change.leagueId, change.toTeamId),
          };
        });
        for (let index = 0; index < changeRecords.length; index += 1_500) {
          yield* sql`
            insert into fantasy.inferred_roster_changes ${sql.insert(changeRecords.slice(index, index + 1_500))}
          `;
        }

        yield* sql`
          update fantasy.ingestion_runs
          set
            status = 'completed',
            finished_at = now(),
            details = details || ${sql.json({ newPlayerCount })}
          where id = ${ingestionRun.id}
        `;
        return {
          alreadyImported: false,
          changeCount: batch.changes.length,
          ingestionRunId: ingestionRun.id,
          newPlayerCount,
          playerCount: batch.players.length,
          seasonCount: batch.seasons.length,
          snapshotCount: batch.snapshots.length,
          snapshotEntryCount,
        };
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError(() =>
            databaseUnavailable(
              'save_league_roster_history',
              'The Fantrax roster history import could not be saved',
            ),
          ),
        );
    };

    const saveSeasonCalendar = (
      batch: SeasonCalendarBatch,
    ): Effect.Effect<SeasonCalendarImportResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        validateSeasonCalendarBatch(batch);
        const [existing] = yield* sql<{
          game_count: number;
          ingestion_run_id: string;
          period_count: number;
          snapshot_id: string;
        }>`
          select
            nss.id as snapshot_id,
            nss.ingestion_run_id,
            count(distinct nsg.provider_game_id)::integer as game_count,
            count(distinct lsp.scoring_period)::integer as period_count
          from fantasy.nba_schedule_snapshots nss
          left join fantasy.nba_schedule_games nsg on nsg.snapshot_id = nss.id
          left join fantasy.league_scoring_periods lsp on lsp.snapshot_id = nss.id
          where nss.fingerprint = ${batch.fingerprint}
          group by nss.id
        `;
        if (existing !== undefined) {
          return {
            alreadyImported: true,
            gameCount: existing.game_count,
            ingestionRunId: existing.ingestion_run_id,
            periodCount: existing.period_count,
            snapshotId: existing.snapshot_id,
          };
        }

        const [leagueSeason] = yield* sql<{ id: string }>`
          select id
          from fantasy.league_seasons
          where source = 'fantrax'
            and source_league_id = ${batch.leagueId}
            and season_key = ${batch.seasonKey}
        `;
        if (leagueSeason === undefined) {
          throw new Error(
            `Season calendar references unknown Fantrax league ${batch.leagueId} for ${batch.seasonKey}`,
          );
        }

        const [ingestionRun] = yield* sql<{ id: string }>`
          insert into fantasy.ingestion_runs
            (source, resource, season_key, status, record_count, details)
          values
            (
              'season-calendar',
              'nba-schedule-and-fantrax-periods',
              ${batch.seasonKey},
              'running',
              ${batch.games.length + batch.fantasyPeriods.length},
              ${sql.json({
                asOf: batch.fantraxCapturedAt,
                fingerprint: batch.fingerprint,
                leagueId: batch.leagueId,
                nbaSourceId: batch.nbaSourceId,
              })}
            )
          returning id
        `;
        if (ingestionRun === undefined) throw new Error('Calendar ingestion run was not created');

        const [snapshot] = yield* sql<{ id: string }>`
          insert into fantasy.nba_schedule_snapshots
            (
              ingestion_run_id,
              league_season_id,
              source,
              season_key,
              as_of,
              fingerprint,
              source_id,
              game_count,
              postponed_game_count
            )
          values
            (
              ${ingestionRun.id},
              ${leagueSeason.id},
              'balldontlie',
              ${batch.seasonKey},
              ${new Date(batch.fantraxCapturedAt)},
              ${batch.fingerprint},
              ${batch.nbaSourceId},
              ${batch.games.length},
              ${batch.games.filter((game) => game.postponed).length}
            )
          returning id
        `;
        if (snapshot === undefined) throw new Error('Calendar snapshot was not created');

        if (batch.games.length > 0) {
          yield* sql`
            insert into fantasy.nba_schedule_games ${sql.insert(
              batch.games.map((game) => ({
                away_team: game.awayTeam,
                game_date: game.date,
                home_team: game.homeTeam,
                postponed: game.postponed,
                provider_game_id: game.providerGameId,
                scheduled_at: new Date(game.scheduledAt),
                season_type: game.seasonType,
                snapshot_id: snapshot.id,
                source_record: game.sourcePayload,
                status: game.status,
              })),
            )}
          `;
        }
        if (batch.fantasyPeriods.length > 0) {
          yield* sql`
            insert into fantasy.league_scoring_periods ${sql.insert(
              batch.fantasyPeriods.map((period) => ({
                end_at: new Date(period.endAt),
                ingestion_run_id: ingestionRun.id,
                league_season_id: leagueSeason.id,
                phase: period.phase,
                playoff_round: period.playoffRound,
                scoring_period: period.scoringPeriod,
                snapshot_id: snapshot.id,
                start_at: new Date(period.startAt),
              })),
            )}
          `;
        }

        yield* sql`
          update fantasy.ingestion_runs
          set
            status = 'completed',
            finished_at = now(),
            details = details || ${sql.json({ snapshotId: snapshot.id })}
          where id = ${ingestionRun.id}
        `;
        return {
          alreadyImported: false,
          gameCount: batch.games.length,
          ingestionRunId: ingestionRun.id,
          periodCount: batch.fantasyPeriods.length,
          snapshotId: snapshot.id,
        };
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError((cause) =>
            databaseUnavailable(
              'save_season_calendar',
              'The season calendar could not be saved',
              cause,
            ),
          ),
        );
    };

    const saveProjectionSnapshot = (
      batch: ProjectionSnapshotBatch,
    ): Effect.Effect<ProjectionSnapshotImportResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const [existingSnapshot] = yield* sql<{
          ingestion_run_id: string;
          new_player_count: number;
          player_projection_count: number;
          snapshot_id: string;
        }>`
          select
            ps.id as snapshot_id,
            ps.ingestion_run_id,
            coalesce((ps.parameters ->> 'newPlayerCount')::integer, 0) as new_player_count,
            count(pp.player_id)::integer as player_projection_count
          from fantasy.projection_snapshots ps
          left join fantasy.player_projections pp on pp.snapshot_id = ps.id
          where ps.fingerprint = ${batch.fingerprint}
          group by ps.id
        `;
        if (existingSnapshot !== undefined) {
          return {
            ingestionRunId: existingSnapshot.ingestion_run_id,
            newPlayerCount: existingSnapshot.new_player_count,
            playerProjectionCount: existingSnapshot.player_projection_count,
            snapshotId: existingSnapshot.snapshot_id,
          };
        }

        const [ingestionRun] = yield* sql<{ id: string }>`
          insert into fantasy.ingestion_runs
            (source, resource, season_key, status, record_count, details)
          values
            (
              ${batch.source},
              'season-projections',
              ${batch.seasonKey},
              'running',
              ${batch.records.length},
              ${sql.json({
                asOf: batch.asOf,
                calendarFingerprint: batch.calendar?.fingerprint ?? null,
                calendarSnapshotId: batch.calendar?.snapshotId ?? null,
                fingerprint: batch.fingerprint,
                limitations: batch.limitations,
                modelVersion: batch.modelVersion,
              })}
            )
          returning id
        `;
        if (ingestionRun === undefined) throw new Error('Projection ingestion run was not created');

        let newPlayerCount = 0;
        const playerIds = new Map<string, string>();
        for (const record of batch.records) {
          let playerId = record.existingPlayerId;
          if (playerId !== null) {
            const [existingPlayer] = yield* sql<{ id: string }>`
              select id from fantasy.players where id = ${playerId}
            `;
            if (existingPlayer === undefined) {
              throw new Error(`Projection references unknown player ${playerId}`);
            }
          } else {
            const providerIdentities = yield* sql<{ player_id: string }>`
              select player_id
              from fantasy.player_identities
              where source = ${batch.source} and external_id = ${record.sourceExternalId}
            `;
            if (providerIdentities.length > 1) {
              throw new Error(`Projection identity ${record.sourceExternalId} is ambiguous`);
            }
            playerId = providerIdentities[0]?.player_id ?? null;
            if (playerId === null) {
              const nameMatches = yield* sql<{ id: string }>`
                select id
                from fantasy.players
                where normalized_name = ${record.normalizedName}
              `;
              if (nameMatches.length > 1) {
                throw new Error(`Canonical player ${record.canonicalName} is ambiguous`);
              }
              playerId = nameMatches[0]?.id ?? null;
            }
            if (playerId === null) {
              const [createdPlayer] = yield* sql<{ id: string }>`
                insert into fantasy.players (canonical_name, normalized_name)
                values (${record.canonicalName}, ${record.normalizedName})
                returning id
              `;
              if (createdPlayer === undefined) {
                throw new Error(`Canonical player ${record.canonicalName} was not created`);
              }
              playerId = createdPlayer.id;
              newPlayerCount += 1;
            }
          }

          const [claimedIdentity] = yield* sql<{ player_id: string }>`
            select player_id
            from fantasy.player_identities
            where source = ${batch.source} and external_id = ${record.sourceExternalId}
          `;
          if (claimedIdentity !== undefined && claimedIdentity.player_id !== playerId) {
            throw new Error(`Projection identity ${record.sourceExternalId} is already claimed`);
          }
          yield* sql`
            insert into fantasy.player_identities
              (player_id, source, external_id, source_name)
            values
              (${playerId}, ${batch.source}, ${record.sourceExternalId}, ${record.sourceName})
            on conflict (source, external_id) do update set
              source_name = excluded.source_name,
              updated_at = now()
          `;
          playerIds.set(record.sourceExternalId, playerId);
        }

        const [snapshot] = yield* sql<{ id: string }>`
          insert into fantasy.projection_snapshots
            (
              ingestion_run_id,
              source,
              season_key,
              as_of,
              model_version,
              fingerprint,
              parameters
            )
          values
            (
              ${ingestionRun.id},
              ${batch.source},
              ${batch.seasonKey},
              ${new Date(batch.asOf)},
              ${batch.modelVersion},
              ${batch.fingerprint},
              ${sql.json({
                calendarFingerprint: batch.calendar?.fingerprint ?? null,
                calendarSnapshotId: batch.calendar?.snapshotId ?? null,
                limitations: batch.limitations,
                newPlayerCount,
              })}
            )
          returning id
        `;
        if (snapshot === undefined) throw new Error('Projection snapshot was not created');

        const sourceRecords = batch.records.map((record) => ({
          captured_at: new Date(batch.asOf),
          id: randomUUID(),
          ingestion_run_id: ingestionRun.id,
          payload: record.sourcePayload,
          source_record_id: `${batch.seasonKey}:${record.sourceExternalId}`,
        }));
        if (sourceRecords.length > 0) {
          yield* sql`
            insert into fantasy.source_records ${sql.insert(sourceRecords)}
          `;
        }

        const projectionRecords = batch.records.map((record, index) => {
          const playerId = playerIds.get(record.sourceExternalId);
          const sourceRecord = sourceRecords[index];
          if (playerId === undefined || sourceRecord === undefined) {
            throw new Error('Validated projection references are incomplete');
          }
          return {
            availability: record.projection.availability,
            bonuses: record.projection.bonuses,
            expected_fantasy_points: record.projection.fantasyPoints,
            expected_fantasy_points_per_game: record.projection.fantasyPointsPerGame,
            expected_games: record.projection.availability.expectedGames,
            player_id: playerId,
            positions: JSON.stringify(record.projection.positions),
            schedule: record.projection.schedule,
            scoring_components: record.projection.scoringComponents,
            snapshot_id: snapshot.id,
            source_record_id: sourceRecord.id,
            stats_per_game: record.projection.statsPerGame,
            team_abbreviation: record.projection.teamAbbreviation,
          };
        });
        if (projectionRecords.length > 0) {
          yield* sql`
            insert into fantasy.player_projections ${sql.insert(projectionRecords)}
          `;
        }

        yield* sql`
          update fantasy.ingestion_runs
          set
            status = 'completed',
            finished_at = now(),
            details = details || ${sql.json({ newPlayerCount, snapshotId: snapshot.id })}
          where id = ${ingestionRun.id}
        `;

        return {
          ingestionRunId: ingestionRun.id,
          newPlayerCount,
          playerProjectionCount: batch.records.length,
          snapshotId: snapshot.id,
        };
      });

      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError((cause) =>
            databaseUnavailable(
              'save_projection_snapshot',
              'The projection snapshot could not be saved',
              cause,
            ),
          ),
        );
    };

    const saveAuctionValuationRun = (
      artifact: AuctionValuationArtifactInput,
    ): Effect.Effect<SaveAuctionValuationRunResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        yield* Effect.try(() => validateAuctionValuationArtifact(artifact));
        const [projection] = yield* sql<{
          as_of: string;
          model_version: string;
          season_key: string;
        }>`
          select season_key, model_version, as_of::text
          from fantasy.projection_snapshots
          where id = ${artifact.projection.snapshotId}
        `;
        if (projection === undefined) throw new Error('Projection snapshot does not exist');
        const projectionPlayers = yield* sql<{ player_id: string }>`
          select player_id
          from fantasy.player_projections
          where snapshot_id = ${artifact.projection.snapshotId}
          order by player_id
        `;
        yield* Effect.try(() =>
          validateAuctionValuationProjectionLink(artifact, {
            asOf: projection.as_of,
            modelVersion: projection.model_version,
            playerIds: projectionPlayers.map((player) => player.player_id),
            seasonKey: projection.season_key,
          }),
        );

        const historyPlayerIds = [
          ...new Set(
            artifact.current.players.flatMap((player) =>
              player.historyPlayerId === null ? [] : [player.historyPlayerId],
            ),
          ),
        ];
        const existingHistoryPlayers =
          historyPlayerIds.length === 0
            ? []
            : yield* sql<{
                id: string;
              }>`select id from fantasy.players where id in ${sql.in(historyPlayerIds)}`;
        if (existingHistoryPlayers.length !== historyPlayerIds.length)
          throw new Error('Valuation references an unknown historical player');

        const [run] = yield* sql<{ id: string }>`
          insert into fantasy.auction_valuation_runs
            (
              projection_snapshot_id, season_key, artifact_version, model_version,
              projection_model_version, projection_as_of, historical_input_fingerprint,
              historical_season_keys, league_settings, fingerprint, candidate_results,
              selected_model_id, selection_rule, methodology, limitations
            )
          values
            (
              ${artifact.projection.snapshotId}, ${artifact.seasonKey}, ${artifact.artifactVersion},
              ${artifact.modelVersion}, ${artifact.projection.modelVersion},
              ${new Date(artifact.projection.asOf)}, ${artifact.historicalInputs.fingerprint},
              ${serializeAuctionValuationJson(artifact.historicalInputs.seasonKeys)}::jsonb,
              ${serializeAuctionValuationJson(artifact.leagueSettings)}::jsonb,
              ${artifact.fingerprint},
              ${serializeAuctionValuationJson(artifact.candidateResults)}::jsonb,
              ${artifact.selectedModelId}, ${artifact.selectionRule}, ${artifact.methodology},
              ${serializeAuctionValuationJson(artifact.limitations)}::jsonb
            )
          on conflict (fingerprint) do nothing
          returning id
        `;
        if (run === undefined) {
          const [winner] = yield* sql<{ id: string }>`
            select id from fantasy.auction_valuation_runs
            where fingerprint = ${artifact.fingerprint}
          `;
          if (winner === undefined) throw new Error('Valuation run conflict winner was not found');
          return { alreadySaved: true, runId: winner.id };
        }
        yield* sql`
          insert into fantasy.auction_valuation_players ${sql.insert(
            artifact.current.players.map((player) => ({
              fair_high_cents: player.fairHighCents,
              fair_low_cents: player.fairLowCents,
              historical_season_count: player.historicalSeasonCount,
              history_player_id: player.historyPlayerId,
              is_modeled: player.isModeled,
              market_estimate_cents: player.marketEstimateCents,
              player_id: player.playerId,
              player_name: player.playerName,
              projected_edge_cents: player.projectedEdgeCents,
              projected_value_cents: player.projectedValueCents,
              projection_rank: player.projectionRank,
              run_id: run.id,
            })),
          )}
        `;
        return { alreadySaved: false, runId: run.id };
      });
      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError((cause) =>
            databaseUnavailable(
              'save_auction_valuation_run',
              'The valuation run could not be saved',
              cause,
            ),
          ),
        );
    };

    const promoteAuctionValuationRun = (
      runId: string,
      promotedByUserId: string,
    ): Effect.Effect<PromoteAuctionValuationRunResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
        const actor = promotedByUserId.trim();
        const [run] = yield* sql<{
          player_count: number;
          projection_season_key: string;
          season_key: string;
          status: AuctionValuationRun['status'];
        }>`
          select
            avr.season_key,
            avr.status,
            ps.season_key as projection_season_key,
            count(avp.player_id)::integer as player_count
          from fantasy.auction_valuation_runs avr
          join fantasy.projection_snapshots ps on ps.id = avr.projection_snapshot_id
          left join fantasy.auction_valuation_players avp on avp.run_id = avr.id
          where avr.id = ${runId}
          group by avr.id, ps.season_key
        `;
        if (run === undefined) throw new Error('Unknown valuation run');
        const [currentPromoted] = yield* sql<{ id: string }>`
          select id from fantasy.auction_valuation_runs
          where season_key = ${run.season_key} and status = 'promoted'
        `;
        const plan = planAuctionValuationPromotion({
          actorId: actor,
          currentPromotedRunId: currentPromoted?.id ?? null,
          playerCount: run.player_count,
          projectionSeasonKey: run.projection_season_key,
          runId,
          seasonKey: run.season_key,
          status: run.status,
        });
        if (run.status === 'promoted') return plan;

        const [displaced] = yield* sql<{ id: string }>`
          update fantasy.auction_valuation_runs
          set status = 'superseded'
          where season_key = ${run.season_key} and status = 'promoted'
          returning id
        `;
        const [promoted] = yield* sql<{ id: string }>`
          update fantasy.auction_valuation_runs
          set status = 'promoted', promoted_at = now(), promoted_by_user_id = ${actor}
          where id = ${runId} and status in ('candidate', 'superseded')
          returning id
        `;
        if (promoted === undefined) throw new Error('Valuation run cannot be promoted');
        return { displacedRunId: displaced?.id ?? plan.displacedRunId, runId: promoted.id };
      });
      return sql
        .withTransaction(operation)
        .pipe(
          Effect.mapError((cause) =>
            databaseUnavailable(
              'promote_auction_valuation_run',
              'The valuation run could not be promoted',
              cause,
            ),
          ),
        );
    };

    return Database.of({
      auctionValuationRun,
      canonicalPlayers,
      canonicalPlayerIdentities,
      health: sql<{ database_time: string }>`select now()::text as database_time`.pipe(
        Effect.flatMap(([row]) =>
          row === undefined
            ? Effect.fail(
                databaseUnavailable('health', 'The database health check did not return a result'),
              )
            : Effect.succeed({
                status: 'ready' as const,
                databaseTime: row.database_time,
              }),
        ),
        Effect.mapError(() => databaseUnavailable('health', 'The database health check failed')),
      ),
      historicalAuctionMarket,
      historicalRankings,
      latestAdpSnapshot,
      latestProjectionSnapshot,
      latestSeasonCalendar,
      leaguePerformanceHistory,
      leagueRosterActivity,
      leagueRosterSnapshot,
      leagueTeamHistory,
      mergePlayerIdentities,
      playerProductionHistory,
      preDraftWorkspace,
      promoteAuctionValuationRun,
      promotedAuctionValuationRun,
      previewPlayerIdentityMerge,
      reconcileLeagueTeamIdentity,
      replaceHistoricalAuctions,
      replaceHistoricalScoring,
      replacePlayerProduction,
      saveFantraxAdpSnapshot,
      saveAuctionValuationRun,
      saveLeaguePerformance,
      saveLeagueRosterHistory,
      savePreDraftPlan,
      savePreDraftTarget,
      saveProjectionSnapshot,
      saveSeasonCalendar,
    });
  }),
);

/** A scoped production layer; callers see the domain service, not the SQL client. */
export const databaseLayer = (config: DatabaseConfig): Layer.Layer<Database, never> =>
  databaseServiceLayer.pipe(
    Layer.provide(
      PgClient.layerFromPool({
        acquire: makePool(config),
        applicationName: 'fantasy-basketball',
        transformResultNames: (name) => name,
      }),
    ),
    Layer.orDie,
  );
