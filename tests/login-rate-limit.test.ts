import { describe, expect, it } from "vitest";
import { nextLoginLimitState } from "@/lib/login-rate-limit-policy";

describe("登录失败限制", () => {
  it("同一窗口第 5 次失败后阻止继续尝试", () => {
    const now = new Date("2026-08-12T12:00:00Z");
    expect(nextLoginLimitState({ failedCount: 4, windowStartedAt: new Date("2026-08-12T11:55:00Z"), now })).toMatchObject({ failedCount: 5 });
    expect(nextLoginLimitState({ failedCount: 4, windowStartedAt: new Date("2026-08-12T11:55:00Z"), now }).blockedUntil).not.toBeNull();
  });

  it("窗口结束后重新计数", () => {
    const now = new Date("2026-08-12T12:20:00Z");
    expect(nextLoginLimitState({ failedCount: 4, windowStartedAt: new Date("2026-08-12T12:00:00Z"), now })).toMatchObject({ failedCount: 1, blockedUntil: null, windowStartedAt: now });
  });

  it("共享 IP 使用更高阈值", () => {
    const now = new Date("2026-08-12T12:00:00Z");
    expect(nextLoginLimitState({ failedCount: 18, windowStartedAt: new Date("2026-08-12T11:55:00Z"), now, maxFailures: 20 }).blockedUntil).toBeNull();
    expect(nextLoginLimitState({ failedCount: 19, windowStartedAt: new Date("2026-08-12T11:55:00Z"), now, maxFailures: 20 }).blockedUntil).not.toBeNull();
  });
});
