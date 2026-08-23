import { describe, expect, it } from "vitest";
import { allowsPlayerManagedTeams, eventRegistrationPhase, eventStatusTransitionError, isEventRegistrationOpen, isPlayerProfileComplete, requiresManualParticipantScheduling, usesFixedTeams } from "@/lib/event-policy";

describe("赛事编制模式", () => {
  it("仅玩家自由组队模式开放建队和入队申请", () => {
    expect(allowsPlayerManagedTeams("PLAYER_TEAMS")).toBe(true);
    expect(allowsPlayerManagedTeams("ADMIN_TEAMS")).toBe(false);
    expect(allowsPlayerManagedTeams("INDIVIDUAL")).toBe(false);
  });

  it("管理员编队仍使用固定战队，个人模式逐场分配选手", () => {
    expect(usesFixedTeams("ADMIN_TEAMS")).toBe(true);
    expect(usesFixedTeams("INDIVIDUAL")).toBe(false);
    expect(requiresManualParticipantScheduling("INDIVIDUAL")).toBe(true);
  });

  it("选手报名要求 UID、昵称、双阵营段位和证明截图全部完成", () => {
    const complete = { gameUid: "123456", gameNickname: "夜莺", survivorRank: "五阶", hunterRank: "四阶", rankScreenshotAssetId: "asset" };
    expect(isPlayerProfileComplete(complete)).toBe(true);
    expect(isPlayerProfileComplete({ ...complete, rankScreenshotAssetId: null })).toBe(false);
    expect(isPlayerProfileComplete({ ...complete, hunterRank: "" })).toBe(false);
  });

  it("只有报名状态且当前时间位于报名窗口内才开放申请", () => {
    const now = new Date("2026-08-12T12:00:00+08:00");
    expect(isEventRegistrationOpen({ status: "REGISTRATION" }, now)).toBe(true);
    expect(isEventRegistrationOpen({ status: "ACTIVE" }, now)).toBe(false);
    expect(isEventRegistrationOpen({ status: "REGISTRATION", registrationStart: new Date("2026-08-13T00:00:00+08:00") }, now)).toBe(false);
    expect(isEventRegistrationOpen({ status: "REGISTRATION", registrationEnd: new Date("2026-08-11T23:59:00+08:00") }, now)).toBe(false);
  });

  it("区分报名未开始、开放和关闭，避免公开入口进入空表单", () => {
    const now = new Date("2026-08-12T12:00:00+08:00");
    expect(eventRegistrationPhase({ status: "REGISTRATION", registrationStart: new Date("2026-08-13T00:00:00+08:00") }, now)).toBe("UPCOMING");
    expect(eventRegistrationPhase({ status: "REGISTRATION" }, now)).toBe("OPEN");
    expect(eventRegistrationPhase({ status: "ACTIVE" }, now)).toBe("CLOSED");
  });

  it("赛事状态只能按受控路径切换，回退需要说明", () => {
    expect(eventStatusTransitionError({ current: "DRAFT", next: "ACTIVE" })).toBeNull();
    expect(eventStatusTransitionError({ current: "COMPLETED", next: "REGISTRATION" })).toContain("不支持");
    expect(eventStatusTransitionError({ current: "ACTIVE", next: "REGISTRATION" })).toContain("必须填写");
    expect(eventStatusTransitionError({ current: "ACTIVE", next: "REGISTRATION", reason: "追加报名" })).toBeNull();
    expect(eventStatusTransitionError({ current: "ACTIVE", next: "ARCHIVED" })).toContain("全局管理员");
    expect(eventStatusTransitionError({ current: "ARCHIVED", next: "DRAFT" })).toContain("只读");
    expect(eventStatusTransitionError({ current: "COMPLETED", next: "COMPLETED" })).toContain("重新开启");
  });

  it("未发布比赛和过期报名窗口会阻止错误状态", () => {
    const now = new Date("2026-08-12T12:00:00+08:00");
    expect(eventStatusTransitionError({ current: "ACTIVE", next: "COMPLETED", unfinishedMatchCount: 1 })).toContain("未发布");
    expect(eventStatusTransitionError({ current: "DRAFT", next: "REGISTRATION", registrationEnd: new Date("2026-08-11T00:00:00+08:00"), now })).toContain("已过");
  });
});
