type AccountMutationInput = {
  actorId: string;
  targetId: string;
  targetRole: "USER" | "ADMIN";
  targetDisabled: boolean;
  nextRole?: "USER" | "ADMIN";
  nextDisabled?: boolean;
  activeAdminCount: number;
};

export function accountMutationError(input: AccountMutationInput) {
  const selfDemotion = input.actorId === input.targetId && input.nextRole === "USER";
  const selfDisable = input.actorId === input.targetId && input.nextDisabled === true;
  if (selfDemotion || selfDisable) return "不能停用或移除当前登录账号的管理员权限";

  const removesActiveAdmin = input.targetRole === "ADMIN" && !input.targetDisabled &&
    (input.nextRole === "USER" || input.nextDisabled === true);
  if (removesActiveAdmin && input.activeAdminCount <= 1) return "必须保留至少一个正常可用的全局管理员";
  if (input.nextRole === "ADMIN" && input.targetDisabled) return "不能向已停用账号授予管理员权限，请先恢复账号";
  return null;
}

export function accountSuspensionError(input: {
  unfinishedAssignmentCount: number;
  unfinishedParticipantCount: number;
  activeMembershipCount: number;
}) {
  if (input.unfinishedAssignmentCount > 0) return `该账号仍有 ${input.unfinishedAssignmentCount} 场未结束的裁判或解说指派，请先取消或改派`;
  if (input.unfinishedParticipantCount > 0) return `该账号仍被安排在 ${input.unfinishedParticipantCount} 场未结束比赛中，请先调整参赛名单`;
  if (input.activeMembershipCount > 0) return `该账号仍属于 ${input.activeMembershipCount} 支进行中赛事的战队，请先移出战队或完成队长交接`;
  return null;
}
