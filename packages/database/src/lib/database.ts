import { randomUUID } from 'node:crypto';

import { PgClient } from '@effect/sql-pg';
import { attachDatabasePool } from '@vercel/functions';
import { Context, Data, Effect, Layer, Redacted } from 'effect';
import { Pool } from 'pg';

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
    | 'health'
    | 'historical_auction_market'
    | 'league_roster_snapshot'
    | 'reconcile_league_team_identity'
    | 'league_team_history'
    | 'replace_historical_auctions'
    | 'player_production_history'
    | 'replace_historical_scoring'
    | 'replace_player_production';
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

export interface DatabaseService {
  readonly canonicalPlayerIdentities: Effect.Effect<
    ReadonlyArray<CanonicalPlayerIdentity>,
    DatabaseUnavailable
  >;
  readonly health: Effect.Effect<DatabaseHealth, DatabaseUnavailable>;
  readonly historicalAuctionMarket: Effect.Effect<HistoricalAuctionMarket, DatabaseUnavailable>;
  readonly leagueRosterSnapshot: Effect.Effect<LeagueRosterSnapshot, DatabaseUnavailable>;
  readonly leagueTeamHistory: Effect.Effect<LeagueTeamHistory, DatabaseUnavailable>;
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

const databaseUnavailable = (operation: DatabaseUnavailable['operation'], message: string) =>
  new DatabaseUnavailable({ message, operation });

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

    return Database.of({
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
      leagueRosterSnapshot,
      leagueTeamHistory,
      playerProductionHistory,
      reconcileLeagueTeamIdentity,
      replaceHistoricalAuctions,
      replaceHistoricalScoring,
      replacePlayerProduction,
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
