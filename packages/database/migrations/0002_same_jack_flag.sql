CREATE TABLE "fantasy"."league_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_league_history_id" text NOT NULL,
	"canonical_key" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy"."league_team_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_season_id" uuid NOT NULL,
	"league_member_id" uuid,
	"source" text DEFAULT 'fantrax' NOT NULL,
	"source_team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"division" text,
	"identity_resolution" text NOT NULL,
	"identity_confidence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy"."auction_results" ADD COLUMN "league_team_season_id" uuid;--> statement-breakpoint
ALTER TABLE "fantasy"."league_seasons" ADD COLUMN "source_league_history_id" text;--> statement-breakpoint
ALTER TABLE "fantasy"."league_team_seasons" ADD CONSTRAINT "league_team_seasons_league_season_id_league_seasons_id_fk" FOREIGN KEY ("league_season_id") REFERENCES "fantasy"."league_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy"."league_team_seasons" ADD CONSTRAINT "league_team_seasons_league_member_id_league_members_id_fk" FOREIGN KEY ("league_member_id") REFERENCES "fantasy"."league_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_members_history_key_unique" ON "fantasy"."league_members" USING btree ("source_league_history_id","canonical_key");--> statement-breakpoint
CREATE UNIQUE INDEX "league_team_seasons_season_team_unique" ON "fantasy"."league_team_seasons" USING btree ("league_season_id","source_team_id");--> statement-breakpoint
CREATE INDEX "league_team_seasons_member_idx" ON "fantasy"."league_team_seasons" USING btree ("league_member_id");--> statement-breakpoint
ALTER TABLE "fantasy"."auction_results" ADD CONSTRAINT "auction_results_league_team_season_id_league_team_seasons_id_fk" FOREIGN KEY ("league_team_season_id") REFERENCES "fantasy"."league_team_seasons"("id") ON DELETE restrict ON UPDATE no action;