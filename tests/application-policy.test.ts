import { describe, expect, it } from "vitest";
import { canResubmitApplication, canReviewApplication, canWithdrawApplication } from "@/lib/application-policy";

describe("身份申请状态闭环", () => {
  it("只有待审核申请可以撤销和审核", () => {
    expect(canWithdrawApplication("PENDING")).toBe(true);
    expect(canReviewApplication("PENDING")).toBe(true);
    for (const status of ["APPROVED", "REJECTED", "WITHDRAWN"] as const) {
      expect(canWithdrawApplication(status)).toBe(false);
      expect(canReviewApplication(status)).toBe(false);
    }
  });

  it("被拒绝或主动撤销后可以重新提交", () => {
    expect(canResubmitApplication("REJECTED")).toBe(true);
    expect(canResubmitApplication("WITHDRAWN")).toBe(true);
    expect(canResubmitApplication("PENDING")).toBe(false);
    expect(canResubmitApplication("APPROVED")).toBe(false);
  });
});
