import { describe, expect, it } from "vitest";
import { HUNTER_RANKS, SURVIVOR_RANKS, isValidRank } from "@/lib/ranks";

describe("第五人格段位目录", () => {
  it("两个阵营都只使用八个纯段位名称", () => {
    expect(SURVIVOR_RANKS).toHaveLength(8);
    expect(HUNTER_RANKS).toHaveLength(8);
    expect(SURVIVOR_RANKS).toEqual(["一阶", "二阶", "三阶", "四阶", "五阶", "六阶", "七阶", "巅峰七阶"]);
    expect(HUNTER_RANKS).toEqual(SURVIVOR_RANKS);
  });

  it("拒绝附带徽章称号的旧值和任意文本", () => {
    expect(isValidRank("HUNTER", "七阶")).toBe(true);
    expect(isValidRank("HUNTER", "七阶 · 恶龙")).toBe(false);
    expect(isValidRank("HUNTER", "七阶邪龙")).toBe(false);
    expect(isValidRank("SURVIVOR", "自定义段位")).toBe(false);
  });
});
