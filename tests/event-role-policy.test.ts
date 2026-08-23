import { describe, expect, it } from "vitest";
import { eventRoleRevocationError } from "@/lib/event-role-policy";

describe("赛事身份撤销策略", () => {
  it("选手仍在战队或个人赛排期时不能撤销", () => {
    expect(eventRoleRevocationError({ role: "PLAYER", membershipCount: 1 })).toContain("活动赛事战队");
    expect(eventRoleRevocationError({ role: "PLAYER", participantCount: 1 })).toContain("未结束的个人赛排期");
  });

  it("裁判与解说仍有未完成指派时不能撤销", () => {
    expect(eventRoleRevocationError({ role: "REFEREE", unfinishedAssignmentCount: 2 })).toContain("2 场");
    expect(eventRoleRevocationError({ role: "COMMENTATOR", unfinishedAssignmentCount: 1 })).toContain("取消指派");
  });

  it("没有业务占用时允许撤销，赛事管理员不受选手约束", () => {
    expect(eventRoleRevocationError({ role: "PLAYER" })).toBeNull();
    expect(eventRoleRevocationError({ role: "EVENT_MANAGER", membershipCount: 1, unfinishedAssignmentCount: 1 })).toBeNull();
  });
});
