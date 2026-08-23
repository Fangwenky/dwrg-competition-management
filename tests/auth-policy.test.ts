import { describe, expect, it } from "vitest";
import { forcedPasswordChangePath, loginDestination } from "@/lib/auth-policy";

describe("强制改密策略", () => {
  it("临时密码会阻止访问其他页面和查询参数绕过", () => {
    expect(forcedPasswordChangePath(true, "/me")).toBe("/me/security?required=1");
    expect(forcedPasswordChangePath(true, "/admin/users")).toBe("/me/security?required=1");
    expect(forcedPasswordChangePath(true, "/me/security?required=1")).toBeNull();
  });

  it("普通账号不受影响", () => {
    expect(forcedPasswordChangePath(false, "/admin/users")).toBeNull();
  });

  it("使用临时密码登录后直接带明确的强制改密提示", () => {
    expect(loginDestination(true, "/me")).toBe("/me/security?required=1");
    expect(loginDestination(false, "/events")).toBe("/events");
  });
});
