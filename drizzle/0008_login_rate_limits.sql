CREATE TABLE IF NOT EXISTS "login_rate_limits" (
  "key_hash" text PRIMARY KEY NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "blocked_until" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_rate_limits_updated_idx" ON "login_rate_limits" USING btree ("updated_at");
