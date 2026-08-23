import { describe, expect, it } from "vitest";
import catalog from "@/data/wiki-catalog.json";
import { HUNTER_RANKS, SURVIVOR_RANKS } from "@/lib/ranks";

describe("BWIKI 比赛角色目录", () => {
  it("角色标识唯一且所有立绘均使用本地资源", () => {
    const pageIds = catalog.characters.map((item) => item.wikiPageId);
    expect(new Set(pageIds).size).toBe(pageIds.length);
    expect(catalog.characters).toHaveLength(87);
    expect(catalog.characters.every((item) => item.posterPath?.startsWith("/catalog/characters/"))).toBe(true);
  });

  it("抓取的段位与表单常量一致", () => {
    expect(catalog.ranks.survivor.map((item) => item.label)).toEqual([...SURVIVOR_RANKS]);
    expect(catalog.ranks.hunter.map((item) => item.label)).toEqual([...HUNTER_RANKS]);
  });
});
