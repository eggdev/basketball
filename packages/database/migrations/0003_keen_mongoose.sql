CREATE TABLE "fantasy"."league_team_identity_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_league_history_id" text NOT NULL,
	"season_key" text NOT NULL,
	"source_team_id" text NOT NULL,
	"league_member_id" uuid NOT NULL,
	"resolved_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy"."league_team_identity_overrides" ADD CONSTRAINT "league_team_identity_overrides_league_member_id_league_members_id_fk" FOREIGN KEY ("league_member_id") REFERENCES "fantasy"."league_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_team_identity_overrides_team_unique" ON "fantasy"."league_team_identity_overrides" USING btree ("source_league_history_id","season_key","source_team_id");--> statement-breakpoint
CREATE INDEX "league_team_identity_overrides_member_idx" ON "fantasy"."league_team_identity_overrides" USING btree ("league_member_id");