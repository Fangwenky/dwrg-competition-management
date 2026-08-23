export type RevocableEventRole = "PLAYER" | "COMMENTATOR" | "REFEREE" | "EVENT_MANAGER";

export function eventRoleRevocationError(input: {
  role: RevocableEventRole;
  membershipCount?: number;
  participantCount?: number;
  unfinishedAssignmentCount?: number;
}) {
  if (input.role === "PLAYER" && (input.membershipCount ?? 0) > 0) {
    return "该选手仍属于活动赛事战队，请先退出或解散战队，或由赛事管理员将其移出";
  }
  if (input.role === "PLAYER" && (input.participantCount ?? 0) > 0) {
    return "该选手仍在未结束的个人赛排期中，请先由赛事管理员调整或撤销相关比赛";
  }
  if ((input.role === "COMMENTATOR" || input.role === "REFEREE") && (input.unfinishedAssignmentCount ?? 0) > 0) {
    return `该用户仍有 ${input.unfinishedAssignmentCount} 场未结束的工作指派，请先在赛事工作台取消指派`;
  }
  return null;
}
