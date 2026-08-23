CREATE TYPE "public"."media_purpose" AS ENUM('EVENT_HERO', 'TEAM_LOGO', 'PLAYER_AVATAR');--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "media_purpose" NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"credit_text" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "hero_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "hero_focal_x" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "hero_focal_y" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "public_bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "logo_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_asset_id" uuid;--> statement-breakpoint
CREATE INDEX "media_assets_uploader_idx" ON "media_assets" USING btree ("uploaded_by");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_hero_asset_id_media_assets_id_fk" FOREIGN KEY ("hero_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_logo_asset_id_media_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_asset_id_media_assets_id_fk" FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;