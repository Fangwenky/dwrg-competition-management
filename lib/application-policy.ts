export type ApplicationStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";

export function canWithdrawApplication(status: ApplicationStatus) {
  return status === "PENDING";
}

export function canResubmitApplication(status: ApplicationStatus) {
  return status === "REJECTED" || status === "WITHDRAWN";
}

export function canReviewApplication(status: ApplicationStatus) {
  return status === "PENDING";
}

export function applicationApprovalError(input: {
  decision: "APPROVED" | "REJECTED";
  accountDisabled: boolean;
  role: "PLAYER" | "COMMENTATOR" | "REFEREE" | "EVENT_MANAGER";
  playerProfileComplete: boolean;
}) {
  if (input.decision !== "APPROVED") return null;
  if (input.accountDisabled) return "申请账号已停用，不能通过；请先由全局管理员恢复账号";
  if (input.role === "PLAYER" && !input.playerProfileComplete) {
    return "申请人的当前竞技资料不完整，请让其补全游戏 UID、昵称、两项段位和证明截图后重新提交";
  }
  return null;
}
