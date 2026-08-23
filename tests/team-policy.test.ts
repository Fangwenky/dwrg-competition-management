import { describe, expect, it } from "vitest";
import { canCancelTeamInvite, canLeaveTeam, canManageTeamLeadership, canRequestTeamMembership, canResubmitTeamApplication, canReviewTeamJoinRequest, canWithdrawTeamApplication, teamDissolutionError } from "@/lib/team-policy";

describe("战队权限策略", () => {
  it("队长和副队长都能审核入队申请，普通队员不能", () => {
    expect(canReviewTeamJoinRequest("CAPTAIN")).toBe(true);
    expect(canReviewTeamJoinRequest("VICE_CAPTAIN")).toBe(true);
    expect(canReviewTeamJoinRequest("MEMBER")).toBe(false);
    expect(canReviewTeamJoinRequest(null)).toBe(false);
  });

  it("只有队长能设置副队长或转移队长身份", () => {
    expect(canManageTeamLeadership("CAPTAIN")).toBe(true);
    expect(canManageTeamLeadership("VICE_CAPTAIN")).toBe(false);
    expect(canManageTeamLeadership("MEMBER")).toBe(false);
  });

  it("队长和副队长可撤销邀请，非队长可在名单未锁定时退队", () => {
    expect(canCancelTeamInvite("CAPTAIN")).toBe(true);
    expect(canCancelTeamInvite("VICE_CAPTAIN")).toBe(true);
    expect(canCancelTeamInvite("MEMBER")).toBe(false);
    expect(canLeaveTeam("MEMBER", false)).toBe(true);
    expect(canLeaveTeam("VICE_CAPTAIN", false)).toBe(true);
    expect(canLeaveTeam("CAPTAIN", false)).toBe(false);
    expect(canLeaveTeam("MEMBER", true)).toBe(false);
  });

  it("只有队长能撤销待审建队申请或重提被拒申请", () => {
    expect(canWithdrawTeamApplication("PENDING", "CAPTAIN")).toBe(true);
    expect(canWithdrawTeamApplication("APPROVED", "CAPTAIN")).toBe(false);
    expect(canWithdrawTeamApplication("PENDING", "VICE_CAPTAIN")).toBe(false);
    expect(canResubmitTeamApplication("REJECTED", "CAPTAIN")).toBe(true);
    expect(canResubmitTeamApplication("PENDING", "CAPTAIN")).toBe(false);
    expect(canResubmitTeamApplication("REJECTED", "MEMBER")).toBe(false);
  });

  it("只有公开、未锁定的战队接受尚未入队的认证选手申请", () => {
    const valid = { teamStatus: "APPROVED", locked: false, hasPlayerRole: true, hasMembership: false, hasPendingRequest: false };
    expect(canRequestTeamMembership(valid)).toBe(true);
    expect(canRequestTeamMembership({ ...valid, teamStatus: "PENDING" })).toBe(false);
    expect(canRequestTeamMembership({ ...valid, locked: true })).toBe(false);
    expect(canRequestTeamMembership({ ...valid, hasPlayerRole: false })).toBe(false);
    expect(canRequestTeamMembership({ ...valid, hasMembership: true })).toBe(false);
    expect(canRequestTeamMembership({ ...valid, hasPendingRequest: true })).toBe(false);
  });

  it("战队仅在没有未完成比赛时允许解散", () => {
    expect(teamDissolutionError({ unfinishedMatchCount: 0 })).toBeNull();
    expect(teamDissolutionError({ unfinishedMatchCount: 1 })).toContain("未完成比赛");
  });
});
