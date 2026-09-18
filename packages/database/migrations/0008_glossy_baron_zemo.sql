CREATE TABLE "fantasy"."inferred_roster_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_season_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"previous_snapshot_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"from_team_season_id" uuid,
	"to_team_season_id" uuid,
	"previous_roster_period" integer NOT NULL,
	"roster_period" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"change_type" text NOT NULL,
	"from_position" text,
	"from_status" text,
	"to_position" text,
	"to_status" text,
	"inference_method" text DEFAULT 'adjacent-roster-delta' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."roster_period_entries" (
	"snapshot_id" uuid NOT NULL,
	"league_team_season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"position" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_period_entries_snapshot_id_player_id_pk" PRIMARY KEY("snapshot_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy"."roster_period_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_season_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"source_record_id" uuid,
	"roster_period" integer NOT NULL,
	"period_start_at" timestamp with time zone NOT NULL,
	"period_end_at" timestamp with time zone NOT NULL,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy"."inferred_roster_changes" ADD CONSTRAINT "inferred_roster_changes_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."inferred_roster_changes" ADD CONSTRAINT "inferred_roster_changes_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."inferred_roster_changes" ADD CONSTRAINT "inferred_roster_changes_previous_snapshot_id_roster_period_snapshots_id_fk" FOREIGN KEY ("previous_snapshot_id") REFERENCES "fantasy"."roster_period_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."inferred_roster_changes" ADD CONSTRAINT "inferred_roster_changes_snapshot_id_roster_period_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "fantasy"."roster_period_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."inferred_roster_changes" ADD CONSTRAINT "inferred_roster_changes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."inferred_roster_changes" ADD CONSTRAINT "inferred_roster_changes_from_team_season_id_league_team_seasons_id_fk" FOREIGN KEY ("from_team_season_id") REFERENCES "fantasy"."league_team_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."inferred_roster_changes" ADD CONSTRAINT "inferred_roster_changes_to_team_season_id_league_team_seasons_id_fk" FOREIGN KEY ("to_team_season_id") REFERENCES "fantasy"."league_team_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."roster_period_entries" ADD CONSTRAINT "roster_period_entries_snapshot_id_roster_period_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "fantasy"."roster_period_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."roster_period_entries" ADD CONSTRAINT "roster_period_entries_league_team_season_id_league_team_seasons_id_fk" FOREIGN KEY ("league_team_season_id") REFERENCES "fantasy"."league_team_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."roster_period_entries" ADD CONSTRAINT "roster_period_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."roster_period_snapshots" ADD CONSTRAINT "roster_period_snapshots_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."roster_period_snapshots" ADD CONSTRAINT "roster_period_snapshots_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."roster_period_snapshots" ADD CONSTRAINT "roster_period_snapshots_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "fantasy"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inferred_roster_changes_season_period_player_unique" ON "fantasy"."inferred_roster_changes" USING btree ("league_season_id","roster_period","player_id");--> statement-breakpoint
CREATE INDEX "inferred_roster_changes_from_team_idx" ON "fantasy"."inferred_roster_changes" USING btree ("from_team_season_id");--> statement-breakpoint
CREATE INDEX "inferred_roster_changes_to_team_idx" ON "fantasy"."inferred_roster_changes" USING btree ("to_team_season_id");--> statement-breakpoint
CREATE INDEX "inferred_roster_changes_season_observed_idx" ON "fantasy"."inferred_roster_changes" USING btree ("league_season_id","observed_at");--> statement-breakpoint
CREATE INDEX "roster_period_entries_team_idx" ON "fantasy"."roster_period_entries" USING btree ("league_team_season_id");--> statement-breakpoint
CREATE INDEX "roster_period_entries_player_idx" ON "fantasy"."roster_period_entries" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_period_snapshots_season_period_unique" ON "fantasy"."roster_period_snapshots" USING btree ("league_season_id","roster_period");--> statement-breakpoint
CREATE INDEX "roster_period_snapshots_season_start_idx" ON "fantasy"."roster_period_snapshots" USING btree ("league_season_id","period_start_at");