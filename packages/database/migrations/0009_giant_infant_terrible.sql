CREATE TABLE "fantasy"."player_identity_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_player_id" uuid NOT NULL,
	"target_player_id" uuid NOT NULL,
	"source_canonical_name" text NOT NULL,
	"target_canonical_name" text NOT NULL,
	"preview_fingerprint" text NOT NULL,
	"reason" text NOT NULL,
	"resolved_by_user_id" text NOT NULL,
	"reference_counts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "player_identity_merges_source_player_id_idx" ON "fantasy"."player_identity_merges" USING btree ("source_player_id");--> statement-breakpoint
CREATE INDEX "player_identity_merges_target_player_id_idx" ON "fantasy"."player_identity_merges" USING btree ("target_player_id");