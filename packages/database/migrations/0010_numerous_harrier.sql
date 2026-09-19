CREATE TABLE "fantasy"."auction_valuation_players" (
	"run_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"player_name" text NOT NULL,
	"projection_rank" integer NOT NULL,
	"historical_season_count" integer NOT NULL,
	"history_player_id" uuid,
	"is_modeled" boolean NOT NULL,
	"market_estimate_cents" integer NOT NULL,
	"fair_low_cents" integer NOT NULL,
	"fair_high_cents" integer NOT NULL,
	"projected_value_cents" integer NOT NULL,
	"projected_edge_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auction_valuation_players_run_id_player_id_pk" PRIMARY KEY("run_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy"."auction_valuation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projection_snapshot_id" uuid NOT NULL,
	"season_key" text NOT NULL,
	"artifact_version" text NOT NULL,
	"model_version" text NOT NULL,
	"projection_model_version" text NOT NULL,
	"projection_as_of" timestamp with time zone NOT NULL,
	"historical_input_fingerprint" text NOT NULL,
	"historical_season_keys" jsonb NOT NULL,
	"league_settings" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"candidate_results" jsonb NOT NULL,
	"selected_model_id" text NOT NULL,
	"selection_rule" text NOT NULL,
	"methodology" text NOT NULL,
	"limitations" jsonb NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"promoted_at" timestamp with time zone,
	"promoted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy"."auction_valuation_players" ADD CONSTRAINT "auction_valuation_players_run_id_auction_valuation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "fantasy"."auction_valuation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_valuation_players" ADD CONSTRAINT "auction_valuation_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "fantasy"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_valuation_players" ADD CONSTRAINT "auction_valuation_players_history_player_id_players_id_fk" FOREIGN KEY ("history_player_id") REFERENCES "fantasy"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_valuation_runs" ADD CONSTRAINT "auction_valuation_runs_projection_snapshot_id_projection_snapshots_id_fk" FOREIGN KEY ("projection_snapshot_id") REFERENCES "fantasy"."projection_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auction_valuation_players_run_rank_unique" ON "fantasy"."auction_valuation_players" USING btree ("run_id","projection_rank");--> statement-breakpoint
CREATE INDEX "auction_valuation_players_player_idx" ON "fantasy"."auction_valuation_players" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auction_valuation_runs_fingerprint_unique" ON "fantasy"."auction_valuation_runs" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "auction_valuation_runs_promoted_season_unique" ON "fantasy"."auction_valuation_runs" USING btree ("season_key") WHERE "fantasy"."auction_valuation_runs"."status" = 'promoted';--> statement-breakpoint
CREATE INDEX "auction_valuation_runs_projection_snapshot_idx" ON "fantasy"."auction_valuation_runs" USING btree ("projection_snapshot_id");