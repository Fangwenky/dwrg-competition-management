import { describe, expect, it } from "vitest";
import { matchStaffAssignmentError } from "@/lib/match-staff-policy";

describe("比赛工作人员规则", () => {
  it("同一场可以指派多名不同的裁判", () => {
    expect(matchStaffAssignmentError({ role: "REFEREE", hasReferee: true })).toBeNull();
  });

  it("同一场可以指派多名不同的解说", () => {
    expect(matchStaffAssignmentError({ role: "COMMENTATOR", hasReferee: true })).toBeNull();
  });

  it("同一用户不能在同一场兼任裁判和解说", () => {
    expect(matchStaffAssignmentError({ role: "COMMENTATOR", sameUserRole: "REFEREE", hasReferee: true })).toBe("CROSS_ROLE");
  });
});
