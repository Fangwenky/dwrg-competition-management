import { describe, expect, it } from "vitest";
import { individualMatchRosterError, scoreRoundBySide, seriesCompletionError, winnerSideFromScores } from "@/lib/match-result-policy";

describe("个人编组比赛结果策略", () => {
  it("按上下半场阵营交换计算 A、B 双方积分", () => {
    expect(scoreRoundBySide("A", 4, 1)).toEqual({ scoreA: 8, scoreB: 1, winnerSide: "A" });
    expect(scoreRoundBySide("B", 4, 1)).toEqual({ scoreA: 1, scoreB: 8, winnerSide: "B" });
    expect(scoreRoundBySide("A", 2, 2)).toEqual({ scoreA: 4, scoreB: 4, winnerSide: null });
  });

  it("场级胜方按局胜数判断", () => {
    expect(winnerSideFromScores(2, 1)).toBe("A");
    expect(winnerSideFromScores(1, 2)).toBe("B");
    expect(winnerSideFromScores(1, 1)).toBeNull();
  });

  it("每方至少五人且不能跨侧重复", () => {
    expect(individualMatchRosterError(4, 5, 9)).toContain("至少各需 5 名");
    expect(individualMatchRosterError(5, 5, 9)).toContain("不能同时");
    expect(individualMatchRosterError(5, 6, 11)).toBeNull();
  });
});

describe("BO 系列完成判定", () => {
  it("允许 BO3 在两胜后结束", () => {
    expect(seriesCompletionError(3, ["A", "A"])).toBeNull();
  });

  it("拒绝未决出胜负的短系列", () => {
    expect(seriesCompletionError(3, ["A"])).toContain("尚未决出胜负");
    expect(seriesCompletionError(5, ["A", "B", null])).toContain("尚未决出胜负");
  });

  it("拒绝胜负确定后的多余对局，并允许打满后的人工同分裁定", () => {
    expect(seriesCompletionError(3, ["A", "A", "B"])).toContain("多余对局");
    expect(seriesCompletionError(3, ["A", "B", null])).toBeNull();
  });
});
