CREATE TABLE "fantasy"."live_draft_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"league_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "live_draft_events_user_league_created_idx" ON "fantasy"."live_draft_events" USING btree ("user_id","league_id","created_at");