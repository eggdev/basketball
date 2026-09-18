import { sql } from 'drizzle-orm';
import {
  boolean,
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
    sourceLeagueHistoryId: text('source_league_history_id'),
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

export const leagueMembers = fantasySchema.table(
  'league_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceLeagueHistoryId: text('source_league_history_id').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    displayName: text('display_name').notNull(),
    displayNameResolution: text('display_name_resolution').notNull().default('imported'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('league_members_history_key_unique').on(
      table.sourceLeagueHistoryId,
      table.canonicalKey,
    ),
  ],
);

export const leagueTeamSeasons = fantasySchema.table(
  'league_team_seasons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leagueSeasonId: uuid('league_season_id')
      .notNull()
      .references(() => leagueSeasons.id, { onDelete: 'cascade' }),
    leagueMemberId: uuid('league_member_id').references(() => leagueMembers.id, {
      onDelete: 'set null',
    }),
    source: text('source').notNull().default('fantrax'),
    sourceTeamId: text('source_team_id').notNull(),
    teamName: text('team_name').notNull(),
    division: text('division'),
    identityResolution: text('identity_resolution').notNull(),
    identityConfidence: integer('identity_confidence').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('league_team_seasons_season_team_unique').on(
      table.leagueSeasonId,
      table.sourceTeamId,
    ),
    index('league_team_seasons_member_idx').on(table.leagueMemberId),
  ],
);

export const leagueTeamIdentityOverrides = fantasySchema.table(
  'league_team_identity_overrides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceLeagueHistoryId: text('source_league_history_id').notNull(),
    seasonKey: text('season_key').notNull(),
    sourceTeamId: text('source_team_id').notNull(),
    leagueMemberId: uuid('league_member_id')
      .notNull()
      .references(() => leagueMembers.id, { onDelete: 'restrict' }),
    resolvedByUserId: text('resolved_by_user_id').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('league_team_identity_overrides_team_unique').on(
      table.sourceLeagueHistoryId,
      table.seasonKey,
      table.sourceTeamId,
    ),
    index('league_team_identity_overrides_member_idx').on(table.leagueMemberId),
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

export const leagueSeasonPerformance = fantasySchema.table('league_season_performance', {
  leagueSeasonId: uuid('league_season_id')
    .primaryKey()
    .references(() => leagueSeasons.id, { onDelete: 'cascade' }),
  ingestionRunId: uuid('ingestion_run_id')
    .notNull()
    .references(() => ingestionRuns.id, { onDelete: 'restrict' }),
  scoringType: text('scoring_type').notNull(),
  lastRegularSeasonPeriod: integer('last_regular_season_period').notNull(),
  firstPlayoffPeriod: integer('first_playoff_period'),
  finalScoringPeriod: integer('final_scoring_period').notNull(),
  playoffTeamCount: integer('playoff_team_count').notNull(),
  ...timestamps,
});

export const leagueTeamStandings = fantasySchema.table(
  'league_team_standings',
  {
    leagueTeamSeasonId: uuid('league_team_season_id')
      .primaryKey()
      .references(() => leagueTeamSeasons.id, { onDelete: 'cascade' }),
    ingestionRunId: uuid('ingestion_run_id')
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: 'restrict' }),
    sourceRecordId: uuid('source_record_id').references(() => sourceRecords.id, {
      onDelete: 'set null',
    }),
    rank: integer('rank').notNull(),
    record: text('record').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    ties: integer('ties').notNull(),
    winPercentage: numeric('win_percentage', { precision: 7, scale: 5 }).notNull(),
    gamesBack: numeric('games_back', { precision: 7, scale: 2 }).notNull(),
    pointsFor: numeric('points_for', { precision: 14, scale: 3 }).notNull(),
    madePlayoffs: boolean('made_playoffs').notNull(),
    playoffSeed: integer('playoff_seed'),
    postseasonResult: text('postseason_result').notNull(),
    postseasonFinish: integer('postseason_finish'),
    ...timestamps,
  },
  (table) => [index('league_team_standings_rank_idx').on(table.rank)],
);

export const leagueMatchups = fantasySchema.table(
  'league_matchups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leagueSeasonId: uuid('league_season_id')
      .notNull()
      .references(() => leagueSeasons.id, { onDelete: 'cascade' }),
    ingestionRunId: uuid('ingestion_run_id')
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: 'restrict' }),
    sourceRecordId: uuid('source_record_id').references(() => sourceRecords.id, {
      onDelete: 'set null',
    }),
    scoringPeriod: integer('scoring_period').notNull(),
    periodStartAt: timestamp('period_start_at', { withTimezone: true }).notNull(),
    periodEndAt: timestamp('period_end_at', { withTimezone: true }).notNull(),
    phase: text('phase').notNull(),
    playoffRound: text('playoff_round'),
    awayTeamSeasonId: uuid('away_team_season_id')
      .notNull()
      .references(() => leagueTeamSeasons.id, { onDelete: 'cascade' }),
    homeTeamSeasonId: uuid('home_team_season_id')
      .notNull()
      .references(() => leagueTeamSeasons.id, { onDelete: 'cascade' }),
    awayScore: numeric('away_score', { precision: 14, scale: 3 }).notNull(),
    homeScore: numeric('home_score', { precision: 14, scale: 3 }).notNull(),
    awayGamesPlayed: integer('away_games_played').notNull(),
    homeGamesPlayed: integer('home_games_played').notNull(),
    awayCategoryTotals: jsonb('away_category_totals')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    homeCategoryTotals: jsonb('home_category_totals')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    winnerTeamSeasonId: uuid('winner_team_season_id').references(() => leagueTeamSeasons.id, {
      onDelete: 'set null',
    }),
    isTie: boolean('is_tie').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('league_matchups_season_period_teams_unique').on(
      table.leagueSeasonId,
      table.scoringPeriod,
      table.awayTeamSeasonId,
      table.homeTeamSeasonId,
    ),
    index('league_matchups_away_team_idx').on(table.awayTeamSeasonId),
    index('league_matchups_home_team_idx').on(table.homeTeamSeasonId),
    index('league_matchups_season_phase_period_idx').on(
      table.leagueSeasonId,
      table.phase,
      table.scoringPeriod,
    ),
  ],
);

export const projectionSnapshots = fantasySchema.table(
  'projection_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ingestionRunId: uuid('ingestion_run_id')
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: 'restrict' }),
    source: text('source').notNull(),
    seasonKey: text('season_key').notNull(),
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),
    modelVersion: text('model_version').notNull(),
    fingerprint: text('fingerprint').notNull(),
    parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('projection_snapshots_fingerprint_unique').on(table.fingerprint),
    index('projection_snapshots_source_season_as_of_idx').on(
      table.source,
      table.seasonKey,
      table.asOf,
    ),
  ],
);

export const playerProjections = fantasySchema.table(
  'player_projections',
  {
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => projectionSnapshots.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    sourceRecordId: uuid('source_record_id').references(() => sourceRecords.id, {
      onDelete: 'set null',
    }),
    teamAbbreviation: text('team_abbreviation').notNull(),
    positions: jsonb('positions').$type<ReadonlyArray<string>>().notNull(),
    expectedGames: numeric('expected_games', { precision: 5, scale: 2 }).notNull(),
    statsPerGame: jsonb('stats_per_game').$type<Record<string, number>>().notNull(),
    expectedFantasyPoints: numeric('expected_fantasy_points', {
      precision: 12,
      scale: 3,
    }).notNull(),
    expectedFantasyPointsPerGame: numeric('expected_fantasy_points_per_game', {
      precision: 10,
      scale: 3,
    }).notNull(),
    bonuses: jsonb('bonuses').$type<Record<string, number>>().notNull(),
    availability: jsonb('availability').$type<Record<string, unknown>>().notNull(),
    schedule: jsonb('schedule').$type<Record<string, unknown> | null>(),
    scoringComponents: jsonb('scoring_components').$type<Record<string, number>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.playerId] }),
    index('player_projections_player_id_idx').on(table.playerId),
  ],
);

export const adpSnapshots = fantasySchema.table(
  'adp_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ingestionRunId: uuid('ingestion_run_id')
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: 'restrict' }),
    source: text('source').notNull(),
    sport: text('sport').notNull(),
    seasonKey: text('season_key').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    fingerprint: text('fingerprint').notNull(),
    recordCount: integer('record_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('adp_snapshots_fingerprint_unique').on(table.fingerprint),
    index('adp_snapshots_source_season_captured_at_idx').on(
      table.source,
      table.seasonKey,
      table.capturedAt,
    ),
  ],
);

export const playerAdp = fantasySchema.table(
  'player_adp',
  {
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => adpSnapshots.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    sourceRecordId: uuid('source_record_id').references(() => sourceRecords.id, {
      onDelete: 'set null',
    }),
    position: text('position').notNull(),
    adp: numeric('adp', { precision: 8, scale: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.playerId] }),
    index('player_adp_player_id_idx').on(table.playerId),
  ],
);

export const preDraftPlans = fantasySchema.table(
  'pre_draft_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leagueMemberId: uuid('league_member_id')
      .notNull()
      .references(() => leagueMembers.id, { onDelete: 'cascade' }),
    leagueSeasonId: uuid('league_season_id')
      .notNull()
      .references(() => leagueSeasons.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    primaryGoal: text('primary_goal').notNull(),
    strategyAngle: text('strategy_angle').notNull(),
    riskTolerance: text('risk_tolerance').notNull(),
    anchorBudgetCents: integer('anchor_budget_cents').notNull(),
    coreBudgetCents: integer('core_budget_cents').notNull(),
    endgameBudgetCents: integer('endgame_budget_cents').notNull(),
    streamingSlots: integer('streaming_slots').notNull(),
    notes: text('notes').notNull().default(''),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('pre_draft_plans_member_season_name_unique').on(
      table.leagueMemberId,
      table.leagueSeasonId,
      table.name,
    ),
    index('pre_draft_plans_member_season_idx').on(table.leagueMemberId, table.leagueSeasonId),
  ],
);

export const preDraftTargets = fantasySchema.table(
  'pre_draft_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => preDraftPlans.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    stance: text('stance').notNull(),
    maxBidCents: integer('max_bid_cents'),
    priority: integer('priority').notNull().default(3),
    rationale: text('rationale').notNull().default(''),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('pre_draft_targets_plan_player_unique').on(table.planId, table.playerId),
    index('pre_draft_targets_plan_priority_idx').on(table.planId, table.priority),
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
    leagueTeamSeasonId: uuid('league_team_season_id').references(() => leagueTeamSeasons.id, {
      onDelete: 'restrict',
    }),
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
