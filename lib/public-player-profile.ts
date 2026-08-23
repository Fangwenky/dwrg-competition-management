const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicPlayerProfileRef =
  | { kind: "member"; memberId: string }
  | { kind: "historical-team"; teamId: string; userId: string }
  | { kind: "individual"; userId: string };

export function currentMemberProfileId(memberId: string) {
  return memberId;
}

export function historicalTeamProfileId(teamId: string, userId: string) {
  return `team~${teamId}~${userId}`;
}

export function individualProfileId(userId: string) {
  return `individual~${userId}`;
}

export function parsePublicPlayerProfileId(value: string): PublicPlayerProfileRef | null {
  if (UUID_PATTERN.test(value)) return { kind: "member", memberId: value };
  const parts = value.split("~");
  if (parts.length === 3 && parts[0] === "team" && UUID_PATTERN.test(parts[1]) && UUID_PATTERN.test(parts[2])) {
    return { kind: "historical-team", teamId: parts[1], userId: parts[2] };
  }
  if (parts.length === 2 && parts[0] === "individual" && UUID_PATTERN.test(parts[1])) {
    return { kind: "individual", userId: parts[1] };
  }
  return null;
}
