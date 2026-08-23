import { describe, expect, it } from "vitest";
import { decideBestOf, decideRound, pointsForEscapes } from "@/lib/scoring";

describe("Identity V scoring",()=>{
  it.each([[0,0,5],[1,1,3],[2,2,2],[3,3,1],[4,5,0]])("scores %i escapes",(escapes,survivor,hunter)=>expect(pointsForEscapes(escapes)).toEqual({survivor,hunter}));
  it("rejects invalid escape counts",()=>expect(()=>pointsForEscapes(5)).toThrow());
  it("decides round results",()=>{expect(decideRound(8,2)).toBe("A");expect(decideRound(4,4)).toBe("DRAW")});
  it("decides BO3 and manual tie",()=>{expect(decideBestOf(["A","A"],3)).toBe("A");expect(decideBestOf(["A","B","DRAW"],3)).toBe("MANUAL")});
});
