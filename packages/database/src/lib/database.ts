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
  readonly operation: 'health' | 'historical_auction_market' | 'replace_historical_auctions';
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
  readonly players: ReadonlyArray<{
    readonly canonicalName: string;
    readonly fantraxId: string;
    readonly normalizedName: string;
  }>;
  readonly seasons: ReadonlyArray<{
    readonly baseBudgetCents: number;
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
  readonly ingestionRunId: string;
  readonly playerCount: number;
  readonly seasonCount: number;
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

export interface DatabaseService {
  readonly health: Effect.Effect<DatabaseHealth, DatabaseUnavailable>;
  readonly historicalAuctionMarket: Effect.Effect<HistoricalAuctionMarket, DatabaseUnavailable>;
  readonly replaceHistoricalAuctions: (
    batch: HistoricalAuctionBatch,
  ) => Effect.Effect<HistoricalAuctionImportResult, DatabaseUnavailable>;
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

const databaseServiceLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;

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

    const replaceHistoricalAuctions = (
      batch: HistoricalAuctionBatch,
    ): Effect.Effect<HistoricalAuctionImportResult, DatabaseUnavailable> => {
      const operation = Effect.gen(function* () {
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
                seasonCount: batch.seasons.length,
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
                ${season.leagueId},
                ${season.seasonKey},
                ${`Fantasy Basketball ${season.seasonKey}`},
                ${season.teamCount},
                ${season.rosterSize},
                ${season.baseBudgetCents}
              )
            on conflict (source, source_league_id) do update set
              season_key = excluded.season_key,
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
          const playerId = playerIds.get(auction.fantraxPlayerId);
          const sourceRecord = sourceRecords[index];
          if (
            leagueSeasonId === undefined ||
            playerId === undefined ||
            sourceRecord === undefined
          ) {
            throw new Error('Validated auction references are incomplete');
          }
          return {
            amount_cents: auction.amountCents,
            drafted_at: new Date(auction.draftedAtMs),
            league_season_id: leagueSeasonId,
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
          ingestionRunId: ingestionRun.id,
          playerCount: batch.players.length,
          seasonCount: batch.seasons.length,
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

    return Database.of({
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
      replaceHistoricalAuctions,
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
