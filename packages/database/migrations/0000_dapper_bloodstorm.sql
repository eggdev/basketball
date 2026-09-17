CREATE SCHEMA "fantasy";
--> statement-breakpoint
CREATE TABLE "fantasy"."auction_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"manager_name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"nomination_order" integer,
	"source_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"resource" text NOT NULL,
	"season_key" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"record_count" integer DEFAULT 0 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."league_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'fantrax' NOT NULL,
	"source_league_id" text NOT NULL,
	"season_key" text NOT NULL,
	"name" text NOT NULL,
	"team_count" integer NOT NULL,
	"roster_size" integer NOT NULL,
	"base_budget_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."player_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"source_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."player_rankings" (
	"ranking_run_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"projected_points" numeric(12, 3) NOT NULL,
	"projected_points_per_game" numeric(10, 3),
	"replacement_value" numeric(12, 3),
	"auction_value_cents" integer,
	"explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "player_rankings_ranking_run_id_player_id_pk" PRIMARY KEY("ranking_run_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy"."player_season_stats" (
	"player_id" uuid NOT NULL,
	"source" text NOT NULL,
	"season_key" text NOT NULL,
	"period" text DEFAULT 'regular-season' NOT NULL,
	"games_played" integer,
	"stats" jsonb NOT NULL,
	"source_record_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_season_stats_player_id_source_season_key_period_pk" PRIMARY KEY("player_id","source","season_key","period")
);
--> statement-breakpoint
CREATE TABLE "fantasy"."players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"nba_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."ranking_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scoring_rule_set_id" uuid NOT NULL,
	"season_key" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."scoring_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."scoring_rules" (
	"rule_set_id" uuid NOT NULL,
	"stat_key" text NOT NULL,
	"points" numeric(10, 4) NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "scoring_rules_rule_set_id_stat_key_pk" PRIMARY KEY("rule_set_id","stat_key")
);
--> statement-breakpoint
CREATE TABLE "fantasy"."source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"source_record_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy"."auction_results" ADD CONSTRAINT "auction_results_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_results" ADD CONSTRAINT "auction_results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_results" ADD CONSTRAINT "auction_results_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "fantasy"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_identities" ADD CONSTRAINT "player_identities_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_rankings" ADD CONSTRAINT "player_rankings_ranking_run_id_ranking_runs_id_fk" FOREIGN KEY ("ranking_run_id") REFERENCES "fantasy"."ranking_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_rankings" ADD CONSTRAINT "player_rankings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_season_stats" ADD CONSTRAINT "player_season_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_season_stats" ADD CONSTRAINT "player_season_stats_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "fantasy"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."ranking_runs" ADD CONSTRAINT "ranking_runs_scoring_rule_set_id_scoring_rule_sets_id_fk" FOREIGN KEY ("scoring_rule_set_id") REFERENCES "fantasy"."scoring_rule_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."scoring_rule_sets" ADD CONSTRAINT "scoring_rule_sets_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."scoring_rules" ADD CONSTRAINT "scoring_rules_rule_set_id_scoring_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "fantasy"."scoring_rule_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."source_records" ADD CONSTRAINT "source_records_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auction_results_season_player_unique" ON "fantasy"."auction_results" USING btree ("league_season_id","player_id");--> statement-breakpoint
CREATE INDEX "auction_results_season_amount_idx" ON "fantasy"."auction_results" USING btree ("league_season_id","amount_cents");--> statement-breakpoint
CREATE INDEX "ingestion_runs_source_started_at_idx" ON "fantasy"."ingestion_runs" USING btree ("source","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "league_seasons_source_id_unique" ON "fantasy"."league_seasons" USING btree ("source","source_league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_identities_source_external_id_unique" ON "fantasy"."player_identities" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "player_identities_player_id_idx" ON "fantasy"."player_identities" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_rankings_run_rank_unique" ON "fantasy"."player_rankings" USING btree ("ranking_run_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "players_nba_id_unique" ON "fantasy"."players" USING btree ("nba_id") WHERE "fantasy"."players"."nba_id" is not null;--> statement-breakpoint
CREATE INDEX "players_normalized_name_idx" ON "fantasy"."players" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_rule_sets_season_version_unique" ON "fantasy"."scoring_rule_sets" USING btree ("league_season_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "source_records_run_record_unique" ON "fantasy"."source_records" USING btree ("ingestion_run_id","source_record_id");