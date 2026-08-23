CREATE TYPE "public"."event_mode" AS ENUM('PLAYER_TEAMS', 'ADMIN_TEAMS', 'INDIVIDUAL');--> statement-breakpoint
CREATE TYPE "public"."match_participant_side" AS ENUM('A', 'B');--> statement-breakpoint
ALTER TYPE "public"."media_purpose" ADD VALUE 'RANK_SCREENSHOT';--> statement-breakpoint
CREATE TABLE "match_participants" (
	"match_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"side" "match_participant_side" NOT NULL,
	"slot_index" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "match_participants_match_id_user_id_pk" PRIMARY KEY("match_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "mode" "event_mode" DEFAULT 'PLAYER_TEAMS' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "side_a_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "side_b_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "created_by_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "game_uid" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "game_nickname" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "survivor_rank" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hunter_rank" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rank_screenshot_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_participants_match_side_idx" ON "match_participants" USING btree ("match_id","side");--> statement-breakpoint
CREATE INDEX "match_participants_event_user_idx" ON "match_participants" USING btree ("event_id","user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_rank_screenshot_asset_id_media_assets_id_fk" FOREIGN KEY ("rank_screenshot_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
WITH latest_player_profile AS (
	SELECT DISTINCT ON ("user_id") "user_id", NULLIF("profile"->>'gameUid', '') AS "game_uid", COALESCE("profile"->>'gameNickname', '') AS "game_nickname", "updated_at"
	FROM "event_role_applications"
	WHERE "role" = 'PLAYER' AND NULLIF("profile"->>'gameUid', '') IS NOT NULL
	ORDER BY "user_id", "updated_at" DESC
), deduplicated AS (
	SELECT *, row_number() OVER (PARTITION BY "game_uid" ORDER BY "updated_at" DESC, "user_id") AS "uid_order"
	FROM latest_player_profile
)
UPDATE "users" SET "game_uid" = deduplicated."game_uid", "game_nickname" = CASE WHEN "users"."game_nickname" = '' THEN deduplicated."game_nickname" ELSE "users"."game_nickname" END
FROM deduplicated WHERE "users"."id" = deduplicated."user_id" AND deduplicated."uid_order" = 1 AND "users"."game_uid" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_game_uid_unique" UNIQUE("game_uid");
