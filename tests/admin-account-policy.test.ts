import { describe, expect, it } from "vitest";
import { accountMutationError, accountSuspensionError } from "@/lib/admin-account-policy";

const base = { actorId: "admin-a", targetId: "admin-b", targetRole: "ADMIN" as const, targetDisabled: false, activeAdminCount: 2 };

describe("全局管理员账号安全策略", () => {
  it("禁止停用自己或移除自己的管理员权限", () => {
    expect(accountMutationError({ ...base, targetId: "admin-a", nextDisabled: true })).toMatch("当前登录账号");
    expect(accountMutationError({ ...base, targetId: "admin-a", nextRole: "USER" })).toMatch("当前登录账号");
  });

  it("保护最后一个有效管理员", () => {
    expect(accountMutationError({ ...base, activeAdminCount: 1, nextDisabled: true })).toMatch("至少一个");
    expect(accountMutationError({ ...base, activeAdminCount: 1, nextRole: "USER" })).toMatch("至少一个");
  });

  it("允许在有其他管理员时处置目标管理员", () => {
    expect(accountMutationError({ ...base, nextDisabled: true })).toBeNull();
    expect(accountMutationError({ ...base, nextRole: "USER" })).toBeNull();
  });

  it("不能向已停用账号授予管理员权限", () => {
    expect(accountMutationError({ ...base, targetRole: "USER", targetDisabled: true, nextRole: "ADMIN" })).toMatch("先恢复");
  });
});

describe("账号停用前的业务清理", () => {
  it("阻止遗留工作人员、参赛选手或活跃战队成员", () => {
    expect(accountSuspensionError({ unfinishedAssignmentCount: 1, unfinishedParticipantCount: 0, activeMembershipCount: 0 })).toMatch("改派");
    expect(accountSuspensionError({ unfinishedAssignmentCount: 0, unfinishedParticipantCount: 2, activeMembershipCount: 0 })).toMatch("参赛名单");
    expect(accountSuspensionError({ unfinishedAssignmentCount: 0, unfinishedParticipantCount: 0, activeMembershipCount: 1 })).toMatch("移出战队");
  });

  it("没有进行中职责时允许停用", () => {
    expect(accountSuspensionError({ unfinishedAssignmentCount: 0, unfinishedParticipantCount: 0, activeMembershipCount: 0 })).toBeNull();
  });
});
