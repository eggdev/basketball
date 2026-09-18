CREATE TABLE "fantasy"."league_matchups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_season_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"source_record_id" uuid,
	"scoring_period" integer NOT NULL,
	"period_start_at" timestamp with time zone NOT NULL,
	"period_end_at" timestamp with time zone NOT NULL,
	"phase" text NOT NULL,
	"playoff_round" text,
	"away_team_season_id" uuid NOT NULL,
	"home_team_season_id" uuid NOT NULL,
	"away_score" numeric(14, 3) NOT NULL,
	"home_score" numeric(14, 3) NOT NULL,
	"away_games_played" integer NOT NULL,
	"home_games_played" integer NOT NULL,
	"away_category_totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"home_category_totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"winner_team_season_id" uuid,
	"is_tie" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."league_season_performance" (
	"league_season_id" uuid PRIMARY KEY NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"scoring_type" text NOT NULL,
	"last_regular_season_period" integer NOT NULL,
	"first_playoff_period" integer,
	"final_scoring_period" integer NOT NULL,
	"playoff_team_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."league_team_standings" (
	"league_team_season_id" uuid PRIMARY KEY NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"source_record_id" uuid,
	"rank" integer NOT NULL,
	"record" text NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"ties" integer NOT NULL,
	"win_percentage" numeric(7, 5) NOT NULL,
	"games_back" numeric(7, 2) NOT NULL,
	"points_for" numeric(14, 3) NOT NULL,
	"made_playoffs" boolean NOT NULL,
	"playoff_seed" integer,
	"postseason_result" text NOT NULL,
	"postseason_finish" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy"."league_matchups" ADD CONSTRAINT "league_matchups_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_matchups" ADD CONSTRAINT "league_matchups_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_matchups" ADD CONSTRAINT "league_matchups_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "fantasy"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_matchups" ADD CONSTRAINT "league_matchups_away_team_season_id_league_team_seasons_id_fk" FOREIGN KEY ("away_team_season_id") REFERENCES "fantasy"."league_team_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_matchups" ADD CONSTRAINT "league_matchups_home_team_season_id_league_team_seasons_id_fk" FOREIGN KEY ("home_team_season_id") REFERENCES "fantasy"."league_team_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_matchups" ADD CONSTRAINT "league_matchups_winner_team_season_id_league_team_seasons_id_fk" FOREIGN KEY ("winner_team_season_id") REFERENCES "fantasy"."league_team_seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_season_performance" ADD CONSTRAINT "league_season_performance_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_season_performance" ADD CONSTRAINT "league_season_performance_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_team_standings" ADD CONSTRAINT "league_team_standings_league_team_season_id_league_team_seasons_id_fk" FOREIGN KEY ("league_team_season_id") REFERENCES "fantasy"."league_team_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_team_standings" ADD CONSTRAINT "league_team_standings_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_team_standings" ADD CONSTRAINT "league_team_standings_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "fantasy"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_matchups_season_period_teams_unique" ON "fantasy"."league_matchups" USING btree ("league_season_id","scoring_period","away_team_season_id","home_team_season_id");--> statement-breakpoint
CREATE INDEX "league_matchups_away_team_idx" ON "fantasy"."league_matchups" USING btree ("away_team_season_id");--> statement-breakpoint
CREATE INDEX "league_matchups_home_team_idx" ON "fantasy"."league_matchups" USING btree ("home_team_season_id");--> statement-breakpoint
CREATE INDEX "league_matchups_season_phase_period_idx" ON "fantasy"."league_matchups" USING btree ("league_season_id","phase","scoring_period");--> statement-breakpoint
CREATE INDEX "league_team_standings_rank_idx" ON "fantasy"."league_team_standings" USING btree ("rank");