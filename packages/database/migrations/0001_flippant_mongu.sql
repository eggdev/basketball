ALTER TABLE "fantasy"."auction_results" ADD COLUMN "team_external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_results" ADD COLUMN "team_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_results" ADD COLUMN "roster_slot" integer;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_results" ADD COLUMN "drafted_at" timestamp with time zone;