export type Pairing = { round: number; index: number; teamA: string | null; teamB: string | null };

export function roundRobinPairings(teamIds: string[]): Pairing[] {
  if (teamIds.length < 2) return [];
  const teams = [...teamIds];
  if (teams.length % 2) teams.push("__BYE__");
  const fixed = teams[0];
  let rotating = teams.slice(1);
  const result: Pairing[] = [];
  for (let round = 0; round < teams.length - 1; round++) {
    const row = [fixed, ...rotating];
    for (let i = 0; i < row.length / 2; i++) {
      const a = row[i];
      const b = row[row.length - 1 - i];
      if (a !== "__BYE__" && b !== "__BYE__") result.push({ round: round + 1, index: i, teamA: round % 2 ? b : a, teamB: round % 2 ? a : b });
    }
    rotating = [rotating.at(-1)!, ...rotating.slice(0, -1)];
  }
  return result;
}

export function singleEliminationPairings(teamIds: string[]): Pairing[] {
  if (teamIds.length < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(teamIds.length));
  const seeded = [...teamIds, ...Array(size - teamIds.length).fill(null)];
  return Array.from({ length: size / 2 }, (_, index) => ({ round: 1, index, teamA: seeded[index], teamB: seeded[size - 1 - index] }));
}

export function singleEliminationBracket(teamIds: string[]): Pairing[] {
  if (teamIds.length < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(teamIds.length));
  const totalRounds = Math.log2(size);
  const seeded = [...teamIds, ...Array<string | null>(size - teamIds.length).fill(null)];
  const firstRound = Array.from({ length: size / 2 }, (_, index) => ({
    round: 1,
    index,
    teamA: seeded[index],
    teamB: seeded[size - 1 - index]
  }));
  const bracket = firstRound.filter((pairing) => pairing.teamA && pairing.teamB);
  let knownWinners = firstRound.map((pairing) => pairing.teamA && !pairing.teamB ? pairing.teamA : pairing.teamB && !pairing.teamA ? pairing.teamB : null);
  for (let round = 2; round <= totalRounds; round++) {
    const current = Array.from({ length: size / 2 ** round }, (_, index) => ({
      round,
      index,
      teamA: knownWinners[index * 2] ?? null,
      teamB: knownWinners[index * 2 + 1] ?? null
    }));
    bracket.push(...current);
    knownWinners = current.map(() => null);
  }
  return bracket;
}
