import { describe, expect, it } from "vitest";
import { mediaPurposeSchema, safeNextPath } from "@/lib/validation";
import { PROFILE_FIELD_LABELS, STATUS_LABELS } from "@/lib/constants";

describe("界面安全与中文映射", () => {
  it("仅允许站内登录回跳地址", () => {
    expect(safeNextPath("/ops/event-1/matches")).toBe("/ops/event-1/matches");
    expect(safeNextPath("https://evil.example")).toBe("/me");
    expect(safeNextPath("//evil.example")).toBe("/me");
    expect(safeNextPath("/\\evil.example")).toBe("/me");
  });

  it("限制图片用途", () => {
    expect(mediaPurposeSchema.safeParse("EVENT_HERO").success).toBe(true);
    expect(mediaPurposeSchema.safeParse("DOCUMENT").success).toBe(false);
  });

  it("关键公开状态和申请字段均有中文名称", () => {
    expect(STATUS_LABELS.PUBLISHED).toBe("已发布");
    expect(PROFILE_FIELD_LABELS.gameUid).toBe("游戏 UID");
    expect(PROFILE_FIELD_LABELS.portfolioUrl).toBe("作品链接");
  });
});
