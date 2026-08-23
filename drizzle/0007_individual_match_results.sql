ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "winner_side" "match_participant_side";--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "bracket_round" integer;--> statement-breakpoint
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "winner_side" "match_participant_side";--> statement-breakpoint
ALTER TABLE "half_results" ALTER COLUMN "survivor_team_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "half_results" ALTER COLUMN "hunter_team_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "half_results" ADD COLUMN IF NOT EXISTS "survivor_side" "match_participant_side";--> statement-breakpoint
ALTER TABLE "half_results" ADD COLUMN IF NOT EXISTS "hunter_side" "match_participant_side";--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "team_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN IF NOT EXISTS "side" "match_participant_side";--> statement-breakpoint

UPDATE "matches"
SET "winner_side" = CASE
  WHEN "winner_team_id" = "team_a_id" THEN 'A'::"match_participant_side"
  WHEN "winner_team_id" = "team_b_id" THEN 'B'::"match_participant_side"
  ELSE NULL
END
WHERE "winner_side" IS NULL;--> statement-breakpoint

UPDATE "game_rounds" AS round
SET "winner_side" = CASE
  WHEN round."winner_team_id" = match."team_a_id" THEN 'A'::"match_participant_side"
  WHEN round."winner_team_id" = match."team_b_id" THEN 'B'::"match_participant_side"
  ELSE NULL
END
FROM "matches" AS match
WHERE round."match_id" = match."id" AND round."winner_side" IS NULL;--> statement-breakpoint

UPDATE "half_results" AS half
SET
  "survivor_side" = CASE
    WHEN half."survivor_team_id" = match."team_a_id" THEN 'A'::"match_participant_side"
    WHEN half."survivor_team_id" = match."team_b_id" THEN 'B'::"match_participant_side"
    ELSE NULL
  END,
  "hunter_side" = CASE
    WHEN half."hunter_team_id" = match."team_a_id" THEN 'A'::"match_participant_side"
    WHEN half."hunter_team_id" = match."team_b_id" THEN 'B'::"match_participant_side"
    ELSE NULL
  END
FROM "game_rounds" AS round, "matches" AS match
WHERE half."round_id" = round."id" AND round."match_id" = match."id"
  AND (half."survivor_side" IS NULL OR half."hunter_side" IS NULL);--> statement-breakpoint

UPDATE "appearances" AS appearance
SET "side" = CASE
  WHEN appearance."team_id" = match."team_a_id" THEN 'A'::"match_participant_side"
  WHEN appearance."team_id" = match."team_b_id" THEN 'B'::"match_participant_side"
  ELSE NULL
END
FROM "half_results" AS half, "game_rounds" AS round, "matches" AS match
WHERE appearance."half_id" = half."id" AND half."round_id" = round."id" AND round."match_id" = match."id"
  AND appearance."side" IS NULL;
