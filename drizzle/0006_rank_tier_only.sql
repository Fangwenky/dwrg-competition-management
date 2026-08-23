UPDATE "users"
SET "survivor_rank" = CASE
  WHEN "survivor_rank" LIKE '巅峰七阶%' THEN '巅峰七阶'
  WHEN "survivor_rank" LIKE '一阶%' THEN '一阶'
  WHEN "survivor_rank" LIKE '二阶%' THEN '二阶'
  WHEN "survivor_rank" LIKE '三阶%' THEN '三阶'
  WHEN "survivor_rank" LIKE '四阶%' THEN '四阶'
  WHEN "survivor_rank" LIKE '五阶%' THEN '五阶'
  WHEN "survivor_rank" LIKE '六阶%' THEN '六阶'
  WHEN "survivor_rank" LIKE '七阶%' THEN '七阶'
  ELSE "survivor_rank"
END
WHERE "survivor_rank" IS NOT NULL;--> statement-breakpoint

UPDATE "users"
SET "hunter_rank" = CASE
  WHEN "hunter_rank" LIKE '巅峰七阶%' THEN '巅峰七阶'
  WHEN "hunter_rank" LIKE '一阶%' THEN '一阶'
  WHEN "hunter_rank" LIKE '二阶%' THEN '二阶'
  WHEN "hunter_rank" LIKE '三阶%' THEN '三阶'
  WHEN "hunter_rank" LIKE '四阶%' THEN '四阶'
  WHEN "hunter_rank" LIKE '五阶%' THEN '五阶'
  WHEN "hunter_rank" LIKE '六阶%' THEN '六阶'
  WHEN "hunter_rank" LIKE '七阶%' THEN '七阶'
  ELSE "hunter_rank"
END
WHERE "hunter_rank" IS NOT NULL;--> statement-breakpoint

UPDATE "event_role_applications"
SET "profile" = jsonb_set(
  "profile",
  '{survivorRank}',
  to_jsonb((CASE
    WHEN "profile"->>'survivorRank' LIKE '巅峰七阶%' THEN '巅峰七阶'
    WHEN "profile"->>'survivorRank' LIKE '一阶%' THEN '一阶'
    WHEN "profile"->>'survivorRank' LIKE '二阶%' THEN '二阶'
    WHEN "profile"->>'survivorRank' LIKE '三阶%' THEN '三阶'
    WHEN "profile"->>'survivorRank' LIKE '四阶%' THEN '四阶'
    WHEN "profile"->>'survivorRank' LIKE '五阶%' THEN '五阶'
    WHEN "profile"->>'survivorRank' LIKE '六阶%' THEN '六阶'
    WHEN "profile"->>'survivorRank' LIKE '七阶%' THEN '七阶'
    ELSE "profile"->>'survivorRank'
  END)::text),
  true
)
WHERE "profile" ? 'survivorRank';--> statement-breakpoint

UPDATE "event_role_applications"
SET "profile" = jsonb_set(
  "profile",
  '{hunterRank}',
  to_jsonb((CASE
    WHEN "profile"->>'hunterRank' LIKE '巅峰七阶%' THEN '巅峰七阶'
    WHEN "profile"->>'hunterRank' LIKE '一阶%' THEN '一阶'
    WHEN "profile"->>'hunterRank' LIKE '二阶%' THEN '二阶'
    WHEN "profile"->>'hunterRank' LIKE '三阶%' THEN '三阶'
    WHEN "profile"->>'hunterRank' LIKE '四阶%' THEN '四阶'
    WHEN "profile"->>'hunterRank' LIKE '五阶%' THEN '五阶'
    WHEN "profile"->>'hunterRank' LIKE '六阶%' THEN '六阶'
    WHEN "profile"->>'hunterRank' LIKE '七阶%' THEN '七阶'
    ELSE "profile"->>'hunterRank'
  END)::text),
  true
)
WHERE "profile" ? 'hunterRank';
