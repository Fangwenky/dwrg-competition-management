export type MatchLifecycleStatus = "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "RESULT_DRAFT" | "PUBLISHED";

export function canManageMatchStaff(status: MatchLifecycleStatus) {
  return status !== "PUBLISHED";
}

export function canDiscardResultDraft(status: MatchLifecycleStatus) {
  return status === "RESULT_DRAFT";
}

export function canDeclineMatchAssignment(status: MatchLifecycleStatus) {
  return status === "DRAFT" || status === "SCHEDULED";
}

export function publishedResultRevisionError(input: {
  sourceStatus: MatchLifecycleStatus;
  downstreamStatus?: MatchLifecycleStatus | null;
  downstreamRoundCount?: number;
}) {
  if (input.sourceStatus !== "PUBLISHED" || !input.downstreamStatus) return null;
  if (!["DRAFT", "SCHEDULED"].includes(input.downstreamStatus)) {
    return "下一轮比赛已经开始录入或发布结果，不能直接修改本场胜方；请先处理下一轮结果";
  }
  if ((input.downstreamRoundCount ?? 0) > 0) {
    return "下一轮比赛已有局级数据，不能直接修改本场胜方；请先清理下一轮结果草稿";
  }
  return null;
}

export function stageStatusAfterLastMatchRemoved(input: {
  stageType: string | null;
  remainingStageMatches: number;
}) {
  return input.stageType === "MANUAL" && input.remainingStageMatches === 0 ? "DRAFT" as const : null;
}
