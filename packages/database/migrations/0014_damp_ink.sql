CREATE TABLE "fantasy"."player_context_entries" (
	"snapshot_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"source_record_id" uuid,
	"context" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_context_entries_snapshot_id_player_id_pk" PRIMARY KEY("snapshot_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy"."player_context_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"source" text NOT NULL,
	"season_key" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"player_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy"."player_season_stats" ADD COLUMN "team_stints" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy"."player_context_entries" ADD CONSTRAINT "player_context_entries_snapshot_id_player_context_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "fantasy"."player_context_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_context_entries" ADD CONSTRAINT "player_context_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_context_entries" ADD CONSTRAINT "player_context_entries_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "fantasy"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_context_snapshots" ADD CONSTRAINT "player_context_snapshots_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_context_entries_player_idx" ON "fantasy"."player_context_entries" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_context_snapshots_fingerprint_unique" ON "fantasy"."player_context_snapshots" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "player_context_snapshots_season_as_of_idx" ON "fantasy"."player_context_snapshots" USING btree ("season_key","as_of");