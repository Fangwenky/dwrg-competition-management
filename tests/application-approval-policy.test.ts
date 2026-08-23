import { describe, expect, it } from "vitest";
import { applicationApprovalError } from "@/lib/application-policy";

describe("身份申请通过策略", () => {
  it("拒绝申请时不受账号与资料完整度影响", () => {
    expect(applicationApprovalError({ decision: "REJECTED", accountDisabled: true, role: "PLAYER", playerProfileComplete: false })).toBeNull();
  });

  it("不能通过已停用账号的申请", () => {
    expect(applicationApprovalError({ decision: "APPROVED", accountDisabled: true, role: "COMMENTATOR", playerProfileComplete: true })).toContain("已停用");
  });

  it("选手资料必须在审核当下仍然完整", () => {
    expect(applicationApprovalError({ decision: "APPROVED", accountDisabled: false, role: "PLAYER", playerProfileComplete: false })).toContain("竞技资料不完整");
    expect(applicationApprovalError({ decision: "APPROVED", accountDisabled: false, role: "PLAYER", playerProfileComplete: true })).toBeNull();
  });

  it("解说和裁判不要求选手竞技资料", () => {
    expect(applicationApprovalError({ decision: "APPROVED", accountDisabled: false, role: "REFEREE", playerProfileComplete: false })).toBeNull();
  });
});
