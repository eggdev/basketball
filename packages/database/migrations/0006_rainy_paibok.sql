CREATE TABLE "fantasy"."adp_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"source" text NOT NULL,
	"sport" text NOT NULL,
	"season_key" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"record_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."player_adp" (
	"snapshot_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"source_record_id" uuid,
	"position" text NOT NULL,
	"adp" numeric(8, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_adp_snapshot_id_player_id_pk" PRIMARY KEY("snapshot_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy"."pre_draft_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_member_id" uuid NOT NULL,
	"league_season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"primary_goal" text NOT NULL,
	"strategy_angle" text NOT NULL,
	"risk_tolerance" text NOT NULL,
	"anchor_budget_cents" integer NOT NULL,
	"core_budget_cents" integer NOT NULL,
	"endgame_budget_cents" integer NOT NULL,
	"streaming_slots" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."pre_draft_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"stance" text NOT NULL,
	"max_bid_cents" integer,
	"priority" integer DEFAULT 3 NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy"."adp_snapshots" ADD CONSTRAINT "adp_snapshots_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "fantasy"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_adp" ADD CONSTRAINT "player_adp_snapshot_id_adp_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "fantasy"."adp_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_adp" ADD CONSTRAINT "player_adp_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."player_adp" ADD CONSTRAINT "player_adp_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "fantasy"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."pre_draft_plans" ADD CONSTRAINT "pre_draft_plans_league_member_id_league_members_id_fk" FOREIGN KEY ("league_member_id") REFERENCES "fantasy"."league_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."pre_draft_plans" ADD CONSTRAINT "pre_draft_plans_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."pre_draft_targets" ADD CONSTRAINT "pre_draft_targets_plan_id_pre_draft_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "fantasy"."pre_draft_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."pre_draft_targets" ADD CONSTRAINT "pre_draft_targets_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "adp_snapshots_fingerprint_unique" ON "fantasy"."adp_snapshots" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "adp_snapshots_source_season_captured_at_idx" ON "fantasy"."adp_snapshots" USING btree ("source","season_key","captured_at");--> statement-breakpoint
CREATE INDEX "player_adp_player_id_idx" ON "fantasy"."player_adp" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pre_draft_plans_member_season_name_unique" ON "fantasy"."pre_draft_plans" USING btree ("league_member_id","league_season_id","name");--> statement-breakpoint
CREATE INDEX "pre_draft_plans_member_season_idx" ON "fantasy"."pre_draft_plans" USING btree ("league_member_id","league_season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pre_draft_targets_plan_player_unique" ON "fantasy"."pre_draft_targets" USING btree ("plan_id","player_id");--> statement-breakpoint
CREATE INDEX "pre_draft_targets_plan_priority_idx" ON "fantasy"."pre_draft_targets" USING btree ("plan_id","priority");