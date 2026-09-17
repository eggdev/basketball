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
  readonly operation: 'health' | 'replace_historical_auctions';
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

export interface DatabaseService {
  readonly health: Effect.Effect<DatabaseHealth, DatabaseUnavailable>;
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

const databaseServiceLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;

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
            new DatabaseUnavailable({
              message: 'The historical auction import could not be completed',
              operation: 'replace_historical_auctions',
            }),
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
              new DatabaseUnavailable({
                message: 'The historical auction import could not be completed',
                operation: 'replace_historical_auctions',
              }),
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
                new DatabaseUnavailable({
                  message: 'The historical auction import could not be completed',
                  operation: 'replace_historical_auctions',
                }),
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

      return sql.withTransaction(operation).pipe(
        Effect.mapError(
          () =>
            new DatabaseUnavailable({
              message: 'The historical auction import could not be completed',
              operation: 'replace_historical_auctions',
            }),
        ),
      );
    };

    return Database.of({
      health: sql<{ database_time: string }>`select now()::text as database_time`.pipe(
        Effect.flatMap(([row]) =>
          row === undefined
            ? Effect.fail(
                new DatabaseUnavailable({
                  message: 'The database health check did not return a result',
                  operation: 'health',
                }),
              )
            : Effect.succeed({
                status: 'ready' as const,
                databaseTime: row.database_time,
              }),
        ),
        Effect.mapError(
          () =>
            new DatabaseUnavailable({
              message: 'The database health check failed',
              operation: 'health',
            }),
        ),
      ),
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
