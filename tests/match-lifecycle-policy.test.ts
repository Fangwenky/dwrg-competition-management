import { describe, expect, it } from "vitest";
import { canDeclineMatchAssignment, canDiscardResultDraft, canManageMatchStaff, publishedResultRevisionError, stageStatusAfterLastMatchRemoved } from "@/lib/match-lifecycle-policy";

describe("比赛生命周期策略", () => {
  it("已发布比赛保留工作人员历史但不能再增删指派", () => {
    expect(canManageMatchStaff("SCHEDULED")).toBe(true);
    expect(canManageMatchStaff("RESULT_DRAFT")).toBe(true);
    expect(canManageMatchStaff("PUBLISHED")).toBe(false);
  });

  it("只有结果草稿可以放弃并回到待赛状态", () => {
    expect(canDiscardResultDraft("RESULT_DRAFT")).toBe(true);
    expect(canDiscardResultDraft("SCHEDULED")).toBe(false);
    expect(canDiscardResultDraft("PUBLISHED")).toBe(false);
  });

  it("工作人员只能在比赛开始前谢绝指派", () => {
    expect(canDeclineMatchAssignment("DRAFT")).toBe(true);
    expect(canDeclineMatchAssignment("SCHEDULED")).toBe(true);
    expect(canDeclineMatchAssignment("IN_PROGRESS")).toBe(false);
    expect(canDeclineMatchAssignment("RESULT_DRAFT")).toBe(false);
    expect(canDeclineMatchAssignment("PUBLISHED")).toBe(false);
  });

  it("下游已有结果时阻止修改已发布淘汰赛，只有空白下游允许回退", () => {
    expect(publishedResultRevisionError({ sourceStatus: "PUBLISHED", downstreamStatus: "SCHEDULED", downstreamRoundCount: 0 })).toBeNull();
    expect(publishedResultRevisionError({ sourceStatus: "PUBLISHED", downstreamStatus: "RESULT_DRAFT", downstreamRoundCount: 1 })).toContain("下一轮");
    expect(publishedResultRevisionError({ sourceStatus: "PUBLISHED", downstreamStatus: "SCHEDULED", downstreamRoundCount: 1 })).toContain("局级数据");
    expect(publishedResultRevisionError({ sourceStatus: "SCHEDULED", downstreamStatus: "PUBLISHED", downstreamRoundCount: 2 })).toBeNull();
  });

  it("删除手动阶段最后一场比赛时恢复为草稿", () => {
    expect(stageStatusAfterLastMatchRemoved({ stageType: "MANUAL", remainingStageMatches: 0 })).toBe("DRAFT");
    expect(stageStatusAfterLastMatchRemoved({ stageType: "MANUAL", remainingStageMatches: 1 })).toBeNull();
    expect(stageStatusAfterLastMatchRemoved({ stageType: "ROUND_ROBIN", remainingStageMatches: 0 })).toBeNull();
  });
});
