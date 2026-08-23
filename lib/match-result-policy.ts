import { pointsForEscapes } from "@/lib/scoring";

export type MatchSide = "A" | "B";

export function scoreRoundBySide(firstSurvivor: MatchSide, firstEscapes: number, secondEscapes: number) {
  const first = pointsForEscapes(firstEscapes);
  const second = pointsForEscapes(secondEscapes);
  const scoreA = firstSurvivor === "A" ? first.survivor + second.hunter : first.hunter + second.survivor;
  const scoreB = firstSurvivor === "A" ? first.hunter + second.survivor : first.survivor + second.hunter;
  return { scoreA, scoreB, winnerSide: winnerSideFromScores(scoreA, scoreB) };
}

export function winnerSideFromScores(scoreA: number, scoreB: number): MatchSide | null {
  return scoreA === scoreB ? null : scoreA > scoreB ? "A" : "B";
}

export function individualMatchRosterError(sideACount: number, sideBCount: number, uniqueCount: number) {
  if (sideACount < 5 || sideBCount < 5) return "A、B 双方至少各需 5 名选手，才能组成完整出场阵容";
  if (uniqueCount !== sideACount + sideBCount) return "同一选手不能同时出现在 A、B 双方";
  return null;
}

export function seriesCompletionError(bestOf: number, roundWinners: Array<MatchSide | null>) {
  const winsNeeded = Math.floor(bestOf / 2) + 1;
  let winsA = 0;
  let winsB = 0;
  for (let index = 0; index < roundWinners.length; index++) {
    if (roundWinners[index] === "A") winsA++;
    if (roundWinners[index] === "B") winsB++;
    if ((winsA >= winsNeeded || winsB >= winsNeeded) && index < roundWinners.length - 1) {
      return "系列赛已提前决出胜负，请移除胜负确定后的多余对局";
    }
  }
  if (winsA < winsNeeded && winsB < winsNeeded && roundWinners.length < bestOf) {
    return `当前 BO${bestOf} 系列尚未决出胜负，请继续录入后续对局`;
  }
  return null;
}
