import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const fantasySchema = pgSchema('fantasy');

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const players = fantasySchema.table(
  'players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    canonicalName: text('canonical_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    nbaId: text('nba_id'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('players_nba_id_unique')
      .on(table.nbaId)
      .where(sql`${table.nbaId} is not null`),
    index('players_normalized_name_idx').on(table.normalizedName),
  ],
);

export const playerIdentities = fantasySchema.table(
  'player_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    sourceName: text('source_name').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('player_identities_source_external_id_unique').on(table.source, table.externalId),
    index('player_identities_player_id_idx').on(table.playerId),
  ],
);

export const leagueSeasons = fantasySchema.table(
  'league_seasons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: text('source').notNull().default('fantrax'),
    sourceLeagueId: text('source_league_id').notNull(),
    seasonKey: text('season_key').notNull(),
    name: text('name').notNull(),
    teamCount: integer('team_count').notNull(),
    rosterSize: integer('roster_size').notNull(),
    baseBudgetCents: integer('base_budget_cents').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('league_seasons_source_id_unique').on(table.source, table.sourceLeagueId),
  ],
);

export const scoringRuleSets = fantasySchema.table(
  'scoring_rule_sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leagueSeasonId: uuid('league_season_id')
      .notNull()
      .references(() => leagueSeasons.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('scoring_rule_sets_season_version_unique').on(table.leagueSeasonId, table.version),
  ],
);

export const scoringRules = fantasySchema.table(
  'scoring_rules',
  {
    ruleSetId: uuid('rule_set_id')
      .notNull()
      .references(() => scoringRuleSets.id, { onDelete: 'cascade' }),
    statKey: text('stat_key').notNull(),
    points: numeric('points', { precision: 10, scale: 4 }).notNull(),
    label: text('label').notNull(),
  },
  (table) => [primaryKey({ columns: [table.ruleSetId, table.statKey] })],
);

export const ingestionRuns = fantasySchema.table(
  'ingestion_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: text('source').notNull(),
    resource: text('resource').notNull(),
    seasonKey: text('season_key'),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    recordCount: integer('record_count').notNull().default(0),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index('ingestion_runs_source_started_at_idx').on(table.source, table.startedAt)],
);

export const sourceRecords = fantasySchema.table(
  'source_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ingestionRunId: uuid('ingestion_run_id')
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: 'cascade' }),
    sourceRecordId: text('source_record_id').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    uniqueIndex('source_records_run_record_unique').on(table.ingestionRunId, table.sourceRecordId),
  ],
);

export const playerSeasonStats = fantasySchema.table(
  'player_season_stats',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    seasonKey: text('season_key').notNull(),
    period: text('period').notNull().default('regular-season'),
    gamesPlayed: integer('games_played'),
    stats: jsonb('stats').$type<Record<string, number | null>>().notNull(),
    sourceRecordId: uuid('source_record_id').references(() => sourceRecords.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.playerId, table.source, table.seasonKey, table.period],
    }),
  ],
);

export const auctionResults = fantasySchema.table(
  'auction_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leagueSeasonId: uuid('league_season_id')
      .notNull()
      .references(() => leagueSeasons.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    managerName: text('manager_name').notNull(),
    teamExternalId: text('team_external_id').notNull(),
    teamName: text('team_name').notNull(),
    amountCents: integer('amount_cents').notNull(),
    nominationOrder: integer('nomination_order'),
    rosterSlot: integer('roster_slot'),
    draftedAt: timestamp('drafted_at', { withTimezone: true }),
    sourceRecordId: uuid('source_record_id').references(() => sourceRecords.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('auction_results_season_player_unique').on(table.leagueSeasonId, table.playerId),
    index('auction_results_season_amount_idx').on(table.leagueSeasonId, table.amountCents),
  ],
);

export const rankingRuns = fantasySchema.table('ranking_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  scoringRuleSetId: uuid('scoring_rule_set_id')
    .notNull()
    .references(() => scoringRuleSets.id, { onDelete: 'restrict' }),
  seasonKey: text('season_key').notNull(),
  model: text('model').notNull(),
  modelVersion: text('model_version').notNull(),
  parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const playerRankings = fantasySchema.table(
  'player_rankings',
  {
    rankingRunId: uuid('ranking_run_id')
      .notNull()
      .references(() => rankingRuns.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    projectedPoints: numeric('projected_points', {
      precision: 12,
      scale: 3,
    }).notNull(),
    projectedPointsPerGame: numeric('projected_points_per_game', {
      precision: 10,
      scale: 3,
    }),
    replacementValue: numeric('replacement_value', {
      precision: 12,
      scale: 3,
    }),
    auctionValueCents: integer('auction_value_cents'),
    explanation: jsonb('explanation').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    primaryKey({ columns: [table.rankingRunId, table.playerId] }),
    uniqueIndex('player_rankings_run_rank_unique').on(table.rankingRunId, table.rank),
  ],
);
