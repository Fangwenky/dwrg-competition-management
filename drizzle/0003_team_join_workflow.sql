CREATE TABLE "team_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "review_status" DEFAULT 'PENDING' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"review_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_join_request_user_unique" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_join_requests_team_status_idx" ON "team_join_requests" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "team_join_requests_user_status_idx" ON "team_join_requests" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "team_join_requests_one_pending_per_event" ON "team_join_requests" ("event_id", "user_id") WHERE "status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_one_vice_captain" ON "team_members" ("team_id") WHERE "role" = 'VICE_CAPTAIN';--> statement-breakpoint
UPDATE "teams" SET "locked" = false, "updated_at" = now() WHERE "status" = 'APPROVED';
