ALTER TABLE "fantasy"."auction_valuation_players" ADD COLUMN "usable_value_cents" integer;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_valuation_players" ADD COLUMN "usable_edge_cents" integer;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_valuation_players" ADD COLUMN "usable_diagnostics" jsonb;--> statement-breakpoint
ALTER TABLE "fantasy"."auction_valuation_runs" ADD COLUMN "production_value" jsonb;