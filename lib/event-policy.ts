export type EventMode = "PLAYER_TEAMS" | "ADMIN_TEAMS" | "INDIVIDUAL";
export type EventStatus = "DRAFT" | "REGISTRATION" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type RegistrationPhase = "OPEN" | "UPCOMING" | "CLOSED";

export const allowsPlayerManagedTeams = (mode: EventMode) => mode === "PLAYER_TEAMS";
export const usesFixedTeams = (mode: EventMode) => mode !== "INDIVIDUAL";
export const requiresManualParticipantScheduling = (mode: EventMode) => mode === "INDIVIDUAL";

export function isEventRegistrationOpen(event: { status: string; registrationStart?: Date | null; registrationEnd?: Date | null }, now = new Date()) {
  return event.status === "REGISTRATION"
    && (!event.registrationStart || now >= event.registrationStart)
    && (!event.registrationEnd || now <= event.registrationEnd);
}

export function eventRegistrationPhase(event: { status: string; registrationStart?: Date | null; registrationEnd?: Date | null }, now = new Date()): RegistrationPhase {
  if (isEventRegistrationOpen(event, now)) return "OPEN";
  if (event.status === "REGISTRATION" && event.registrationStart && now < event.registrationStart) return "UPCOMING";
  return "CLOSED";
}

const ALLOWED_EVENT_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  DRAFT: ["DRAFT", "REGISTRATION", "ACTIVE"],
  REGISTRATION: ["REGISTRATION", "DRAFT", "ACTIVE"],
  ACTIVE: ["ACTIVE", "REGISTRATION", "COMPLETED"],
  COMPLETED: ["COMPLETED", "ACTIVE"],
  ARCHIVED: ["ARCHIVED"]
};

export function eventStatusTransitionError(input: {
  current: EventStatus;
  next: EventStatus;
  reason?: string | null;
  registrationEnd?: Date | null;
  unfinishedMatchCount?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.current === "ARCHIVED") return "已归档赛事处于只读状态，需由全局管理员先恢复为草稿";
  if (input.current === "COMPLETED" && input.next === "COMPLETED") return "已结束赛事处于只读状态，如需编辑请先填写说明并重新开启";
  if (input.next === "ARCHIVED") return "赛事归档只能由全局管理员在全局后台执行";
  if (!ALLOWED_EVENT_TRANSITIONS[input.current].includes(input.next)) return "不支持从当前状态直接切换到所选状态";
  const needsReason = (input.current === "REGISTRATION" && input.next === "DRAFT")
    || (input.current === "ACTIVE" && input.next === "REGISTRATION")
    || (input.current === "COMPLETED" && input.next === "ACTIVE");
  if (needsReason && !input.reason?.trim()) return "回退或重新开启赛事时必须填写状态变更说明";
  if (input.next === "REGISTRATION" && input.registrationEnd && input.registrationEnd <= now) return "报名结束时间已过，不能切换为报名中";
  if (input.next === "COMPLETED" && (input.unfinishedMatchCount ?? 0) > 0) return "仍有未发布结果的比赛，不能将赛事标记为已结束";
  return null;
}

export function isPlayerProfileComplete(profile: {
  gameUid?: string | null;
  gameNickname?: string | null;
  survivorRank?: string | null;
  hunterRank?: string | null;
  rankScreenshotAssetId?: string | null;
}) {
  return Boolean(profile.gameUid && profile.gameNickname && profile.survivorRank && profile.hunterRank && profile.rankScreenshotAssetId);
}
