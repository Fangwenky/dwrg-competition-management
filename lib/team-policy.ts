export type TeamLeadershipRole = "CAPTAIN" | "VICE_CAPTAIN" | "MEMBER";

export function canReviewTeamJoinRequest(role: TeamLeadershipRole | null | undefined) {
  return role === "CAPTAIN" || role === "VICE_CAPTAIN";
}

export function canManageTeamLeadership(role: TeamLeadershipRole | null | undefined) {
  return role === "CAPTAIN";
}

export function canCancelTeamInvite(role: TeamLeadershipRole | null | undefined) {
  return role === "CAPTAIN" || role === "VICE_CAPTAIN";
}

export function canWithdrawTeamApplication(status: string, role: TeamLeadershipRole | null | undefined) {
  return status === "PENDING" && role === "CAPTAIN";
}

export function canResubmitTeamApplication(status: string, role: TeamLeadershipRole | null | undefined) {
  return status === "REJECTED" && role === "CAPTAIN";
}

export function canLeaveTeam(role: TeamLeadershipRole | null | undefined, locked: boolean) {
  return role !== "CAPTAIN" && Boolean(role) && !locked;
}

export function canRequestTeamMembership(input: {
  teamStatus: string;
  locked: boolean;
  hasPlayerRole: boolean;
  hasMembership: boolean;
  hasPendingRequest: boolean;
}) {
  return input.teamStatus === "APPROVED"
    && !input.locked
    && input.hasPlayerRole
    && !input.hasMembership
    && !input.hasPendingRequest;
}

export function teamDissolutionError(input: { unfinishedMatchCount: number }) {
  return input.unfinishedMatchCount > 0
    ? "战队仍有未完成比赛，请先撤销相关赛程或完成并发布结果后再解散"
    : null;
}
