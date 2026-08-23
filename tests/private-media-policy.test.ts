import { describe, expect, it } from "vitest";
import { canReadRankProof } from "@/lib/private-media-policy";

describe("段位证明访问策略", () => {
  it("允许本人和全局管理员访问", () => {
    expect(canReadRankProof({ viewerId: "owner", viewerRole: "USER", ownerId: "owner" })).toBe(true);
    expect(canReadRankProof({ viewerId: "admin", viewerRole: "ADMIN", ownerId: "owner" })).toBe(true);
  });

  it("只允许对应赛事管理员查看该赛事申请人的证明", () => {
    expect(canReadRankProof({ viewerId: "manager", viewerRole: "USER", ownerId: "owner", eventId: "event", hasEventManagerGrant: true, hasPlayerApplication: true })).toBe(true);
    expect(canReadRankProof({ viewerId: "manager", viewerRole: "USER", ownerId: "owner", eventId: "event", hasEventManagerGrant: true, hasPlayerApplication: false })).toBe(false);
    expect(canReadRankProof({ viewerId: "other", viewerRole: "USER", ownerId: "owner", eventId: "event", hasEventManagerGrant: false, hasPlayerApplication: true })).toBe(false);
  });

  it("拒绝匿名上下文与无赛事上下文的其他用户", () => {
    expect(canReadRankProof({ viewerId: "other", viewerRole: "USER", ownerId: "owner" })).toBe(false);
  });
});
