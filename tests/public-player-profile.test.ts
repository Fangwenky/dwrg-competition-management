import { describe, expect, it } from "vitest";
import { historicalTeamProfileId, individualProfileId, parsePublicPlayerProfileId } from "@/lib/public-player-profile";

const TEAM_ID = "51778ab2-21e6-4207-bee9-cdc7050fb818";
const USER_ID = "b5b41f3a-28c3-4446-bbdb-7d690ba21546";

describe("公开选手档案标识", () => {
  it("兼容当前名单成员 UUID", () => {
    expect(parsePublicPlayerProfileId(USER_ID)).toEqual({ kind: "member", memberId: USER_ID });
  });

  it("将历史战队和用户同时编码，避免转队后的档案串线", () => {
    expect(parsePublicPlayerProfileId(historicalTeamProfileId(TEAM_ID, USER_ID))).toEqual({ kind: "historical-team", teamId: TEAM_ID, userId: USER_ID });
  });

  it("单独标识个人赛参赛者并拒绝畸形输入", () => {
    expect(parsePublicPlayerProfileId(individualProfileId(USER_ID))).toEqual({ kind: "individual", userId: USER_ID });
    expect(parsePublicPlayerProfileId("team~bad~input")).toBeNull();
    expect(parsePublicPlayerProfileId("individual~bad")).toBeNull();
  });
});
