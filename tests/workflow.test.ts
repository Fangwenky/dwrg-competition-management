import { describe, expect, it } from "vitest";
import { roundRobinPairings, singleEliminationBracket, singleEliminationPairings } from "@/lib/workflow";

describe("stage generation",()=>{
  it("creates every round-robin pairing once",()=>{const pairs=roundRobinPairings(["A","B","C","D"]);expect(pairs).toHaveLength(6);const unique=new Set(pairs.map(p=>[p.teamA,p.teamB].sort().join("-")));expect(unique.size).toBe(6)});
  it("handles odd round-robin team counts",()=>expect(roundRobinPairings(["A","B","C"])).toHaveLength(3));
  it("seeds a single-elimination bracket to power of two",()=>{const pairs=singleEliminationPairings(["A","B","C","D","E"]);expect(pairs).toHaveLength(4);expect(pairs.flatMap(p=>[p.teamA,p.teamB]).filter(Boolean)).toHaveLength(5)});
  it("builds a full bracket and advances first-round byes",()=>{const pairs=singleEliminationBracket(["A","B","C","D","E"]);expect(pairs).toHaveLength(4);expect(pairs.filter(p=>p.round===1)).toHaveLength(1);expect(pairs.filter(p=>p.round===2)).toEqual([{round:2,index:0,teamA:"A",teamB:"B"},{round:2,index:1,teamA:"C",teamB:null}]);expect(pairs.at(-1)).toEqual({round:3,index:0,teamA:null,teamB:null})});
});
