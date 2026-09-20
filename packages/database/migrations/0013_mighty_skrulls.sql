CREATE TABLE "fantasy"."pre_draft_plan_selections" (
	"league_member_id" uuid NOT NULL,
	"league_season_id" uuid NOT NULL,
	"active_plan_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pre_draft_plan_selections_league_member_id_league_season_id_pk" PRIMARY KEY("league_member_id","league_season_id")
);
--> statement-breakpoint
ALTER TABLE "fantasy"."pre_draft_plans" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "pre_draft_plans_id_member_season_unique" ON "fantasy"."pre_draft_plans" USING btree ("id","league_member_id","league_season_id");--> statement-breakpoint
ALTER TABLE "fantasy"."pre_draft_plan_selections" ADD CONSTRAINT "pre_draft_plan_selections_active_plan_scope_fk" FOREIGN KEY ("active_plan_id","league_member_id","league_season_id") REFERENCES "fantasy"."pre_draft_plans"("id","league_member_id","league_season_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pre_draft_plan_selections_active_plan_idx" ON "fantasy"."pre_draft_plan_selections" USING btree ("active_plan_id");--> statement-breakpoint
