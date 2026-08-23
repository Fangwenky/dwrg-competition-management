ALTER TABLE "game_characters" ADD COLUMN "wiki_page_id" integer;--> statement-breakpoint
ALTER TABLE "game_characters" ADD COLUMN "wiki_revision_id" integer;--> statement-breakpoint
ALTER TABLE "game_characters" ADD COLUMN "poster_path" text;--> statement-breakpoint
ALTER TABLE "game_characters" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "game_characters" ADD COLUMN "source_image_url" text;--> statement-breakpoint
ALTER TABLE "game_characters" ADD COLUMN "source_image_page_url" text;--> statement-breakpoint
ALTER TABLE "game_characters" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_characters" ADD CONSTRAINT "game_characters_wiki_page_id_unique" UNIQUE("wiki_page_id");--> statement-breakpoint
UPDATE "users" SET "survivor_rank" = CASE "survivor_rank"
  WHEN '一阶工蜂' THEN '一阶 · 工蜂'
  WHEN '二阶猎犬' THEN '二阶 · 猎犬'
  WHEN '三阶驼鹿' THEN '三阶 · 驼鹿'
  WHEN '四阶猛犸' THEN '四阶 · 猛犸'
  WHEN '五阶狮鹫' THEN '五阶 · 狮鹫'
  WHEN '六阶独角兽' THEN '六阶 · 独角兽'
  WHEN '七阶勇士' THEN '七阶 · 勇士'
  WHEN '巅峰七阶' THEN '巅峰七阶 · 大力神'
  ELSE "survivor_rank"
END;--> statement-breakpoint
UPDATE "users" SET "hunter_rank" = CASE "hunter_rank"
  WHEN '一阶狼蛛' THEN '一阶 · 狼蛛'
  WHEN '二阶眼镜蛇' THEN '二阶 · 眼镜蛇'
  WHEN '三阶鳄鱼' THEN '三阶 · 鳄鱼'
  WHEN '四阶剑齿虎' THEN '四阶 · 剑齿虎'
  WHEN '五阶飞狮' THEN '五阶 · 飞狮'
  WHEN '六阶独眼巨人' THEN '六阶 · 独眼巨人'
  WHEN '七阶邪龙' THEN '七阶 · 恶龙'
  WHEN '七阶恶龙' THEN '七阶 · 恶龙'
  WHEN '巅峰七阶' THEN '巅峰七阶 · 九头蛇'
  ELSE "hunter_rank"
END;
