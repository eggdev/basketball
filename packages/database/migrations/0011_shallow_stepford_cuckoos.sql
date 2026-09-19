CREATE TABLE "fantasy"."league_scoring_periods" (
	"snapshot_id" uuid NOT NULL,
	"league_season_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"scoring_period" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"phase" text NOT NULL,
	"playoff_round" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_scoring_periods_snapshot_id_scoring_period_pk" PRIMARY KEY("snapshot_id","scoring_period")
);
--> statement-breakpoint
CREATE TABLE "fantasy"."nba_schedule_games" (
	"snapshot_id" uuid NOT NULL,
	"provider_game_id" text NOT NULL,
	"game_date" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"season_type" text NOT NULL,
	"status" text NOT NULL,
	"postponed" boolean DEFAULT false NOT NULL,
	"source_record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nba_schedule_games_snapshot_id_provider_game_id_pk" PRIMARY KEY("snapshot_id","provider_game_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy"."nba_schedule_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"league_season_id" uuid NOT NULL,
	"source" text NOT NULL,
	"season_key" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"source_id" text NOT NULL,
	"game_count" integer NOT NULL,
	"postponed_game_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy"."league_scoring_periods" ADD CONSTRAINT "league_scoring_periods_snapshot_id_nba_schedule_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "fantasy"."nba_schedule_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_scoring_periods" ADD CONSTRAINT "league_scoring_periods_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_scoring_periods" ADD CONSTRAINT "league_scoring_periods_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."nba_schedule_games" ADD CONSTRAINT "nba_schedule_games_snapshot_id_nba_schedule_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "fantasy"."nba_schedule_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."nba_schedule_snapshots" ADD CONSTRAINT "nba_schedule_snapshots_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."nba_schedule_snapshots" ADD CONSTRAINT "nba_schedule_snapshots_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_scoring_periods_league_season_idx" ON "fantasy"."league_scoring_periods" USING btree ("league_season_id","scoring_period");--> statement-breakpoint
CREATE INDEX "league_scoring_periods_ingestion_run_idx" ON "fantasy"."league_scoring_periods" USING btree ("ingestion_run_id");--> statement-breakpoint
CREATE INDEX "nba_schedule_games_snapshot_date_idx" ON "fantasy"."nba_schedule_games" USING btree ("snapshot_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "nba_schedule_games_snapshot_home_team_idx" ON "fantasy"."nba_schedule_games" USING btree ("snapshot_id","home_team");--> statement-breakpoint
CREATE INDEX "nba_schedule_games_snapshot_away_team_idx" ON "fantasy"."nba_schedule_games" USING btree ("snapshot_id","away_team");--> statement-breakpoint
CREATE UNIQUE INDEX "nba_schedule_snapshots_fingerprint_unique" ON "fantasy"."nba_schedule_snapshots" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "nba_schedule_snapshots_season_as_of_idx" ON "fantasy"."nba_schedule_snapshots" USING btree ("season_key","as_of");--> statement-breakpoint
CREATE INDEX "nba_schedule_snapshots_league_season_idx" ON "fantasy"."nba_schedule_snapshots" USING btree ("league_season_id");