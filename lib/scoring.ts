import { ESCAPE_POINTS } from "./constants";

export function pointsForEscapes(escapes: number) {
  const points = ESCAPE_POINTS[escapes];
  if (!points) throw new Error("逃脱人数必须是 0–4");
  return { survivor: points[0], hunter: points[1] };
}

export function decideRound(a: number, b: number) {
  return a === b ? "DRAW" : a > b ? "A" : "B";
}

export function decideBestOf(rounds: Array<"A" | "B" | "DRAW">, bestOf: 3 | 5) {
  const target = bestOf === 3 ? 2 : 3;
  const winsA = rounds.filter((r) => r === "A").length;
  const winsB = rounds.filter((r) => r === "B").length;
  if (winsA >= target) return "A";
  if (winsB >= target) return "B";
  if (rounds.length < bestOf) return null;
  return winsA === winsB ? "MANUAL" : winsA > winsB ? "A" : "B";
}
