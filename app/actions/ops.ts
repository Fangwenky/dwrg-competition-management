"use server";

import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import argon2 from "argon2";
import { appearances, auditLogs, bpEntries, eventRoleApplications, eventRoleGrants, events, gameCharacters, gameMaps, gameRounds, halfResults, matchAssignments, matchParticipants, matches, notifications, sessions, stages, teamInvites, teamJoinRequests, teamMembers, teams, users } from "@/lib/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth";
import { canManageEvent, isOnTeam } from "@/lib/permissions";
import { audit, notify } from "@/lib/audit";
import { formRawString, formString, passwordSchema, safeNextPath, slugSchema, usernameSchema } from "@/lib/validation";
import { roundRobinPairings, singleEliminationBracket } from "@/lib/workflow";
import { pointsForEscapes } from "@/lib/scoring";
import { applicationApprovalError, canReviewApplication } from "@/lib/application-policy";
import { accountMutationError, accountSuspensionError } from "@/lib/admin-account-policy";
import { teamDissolutionError } from "@/lib/team-policy";
import { eventRoleRevocationError, type RevocableEventRole } from "@/lib/event-role-policy";
import { individualMatchRosterError, scoreRoundBySide, seriesCompletionError, winnerSideFromScores } from "@/lib/match-result-policy";
import { canDiscardResultDraft, canManageMatchStaff, publishedResultRevisionError, stageStatusAfterLastMatchRemoved } from "@/lib/match-lifecycle-policy";
import { isValidRank } from "@/lib/ranks";
import { eventStatusTransitionError, type EventStatus } from "@/lib/event-policy";
import { matchStaffAssignmentError } from "@/lib/match-staff-policy";

export type OpsState = { error?: string; success?: string };

function invalidAction(message: string) {
  return `/me?${new URLSearchParams({ error: "action-invalid", message }).toString()}`;
}

function applicationFeedbackPath(eventId: string, type: "error" | "success", message: string) {
  const search = new URLSearchParams({ [type]: message });
  return `/ops/${eventId}/applications?${search.toString()}`;
}

async function manager(eventId: string, options: { allowCompleted?: boolean } = {}) {
  const user = await requireUser();
  if (!await canManageEvent(user, eventId)) redirect("/me?error=forbidden");
  const [event] = await db.select({ status: events.status }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) redirect(invalidAction("赛事不存在或已被删除"));
  if (event.status === "ARCHIVED") redirect(`/ops/${eventId}?${new URLSearchParams({ error: "archived", message: "该赛事已归档并进入只读状态。请联系全局管理员恢复后再编辑。" }).toString()}`);
  if (event.status === "COMPLETED" && !options.allowCompleted) redirect(`/ops/${eventId}?${new URLSearchParams({ error: "completed", message: "该赛事已结束并进入只读状态。如需继续修改，请先在赛事设置中填写原因并重新开启。" }).toString()}`);
  return user;
}

export async function reviewApplication(formData: FormData) {
  const applicationId = formString(formData, "applicationId");
  const decision = formString(formData, "decision") as "APPROVED" | "REJECTED";
  const reason = formString(formData, "reason").slice(0, 300);
  const [application] = await db.select().from(eventRoleApplications).where(eq(eventRoleApplications.id, applicationId)).limit(1);
  if (!application) redirect(invalidAction("申请不存在或已被删除"));
  const actor = await manager(application.eventId);
  if (!canReviewApplication(application.status)) redirect(applicationFeedbackPath(application.eventId, "error", "该申请已被处理或撤销，请刷新审核队列。"));
  if (application.userId === actor.id) redirect(applicationFeedbackPath(application.eventId, "error", "不能审核自己的申请，请由另一位全局管理员或赛事管理员处理。"));
  if (!['APPROVED', 'REJECTED'].includes(decision)) redirect(applicationFeedbackPath(application.eventId, "error", "审核操作无效，请重新选择。"));
  if (decision === "REJECTED" && !reason) redirect(applicationFeedbackPath(application.eventId, "error", "拒绝申请时必须填写审核意见。"));
  const reviewed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${application.userId}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${application.eventId}:${application.userId}:${application.role}`}))`);
    await tx.execute(sql`select ${eventRoleApplications.id} from ${eventRoleApplications} where ${eventRoleApplications.id} = ${applicationId} for update`);
    const [applicant] = await tx.select({
      disabled: users.disabled,
      gameUid: users.gameUid,
      gameNickname: users.gameNickname,
      survivorRank: users.survivorRank,
      hunterRank: users.hunterRank,
      rankScreenshotAssetId: users.rankScreenshotAssetId
    }).from(users).where(eq(users.id, application.userId)).limit(1);
    if (!applicant) return "申请账号不存在或已删除";
    const approvalError = applicationApprovalError({
      decision,
      accountDisabled: applicant.disabled,
      role: application.role,
      playerProfileComplete: Boolean(applicant.gameUid && applicant.gameNickname && applicant.survivorRank && applicant.hunterRank && applicant.rankScreenshotAssetId)
    });
    if (approvalError) return approvalError;
    const updated = await tx.update(eventRoleApplications).set({ status: decision, reviewReason: reason || null, reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(eventRoleApplications.id, applicationId), eq(eventRoleApplications.status, "PENDING"))).returning({ id: eventRoleApplications.id });
    if (!updated.length) return "该申请刚刚已被处理或撤销，请刷新审核队列。";
    if (decision === "APPROVED") await tx.insert(eventRoleGrants).values({ eventId: application.eventId, userId: application.userId, role: application.role, grantedBy: actor.id }).onConflictDoNothing();
    else await tx.delete(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, application.eventId), eq(eventRoleGrants.userId, application.userId), eq(eventRoleGrants.role, application.role)));
    await tx.insert(notifications).values({ userId: application.userId, title: decision === "APPROVED" ? "身份申请已通过" : "身份申请需修改", body: reason || "审核已完成", href: "/me/applications" });
    return true;
  });
  if (reviewed !== true) redirect(applicationFeedbackPath(application.eventId, "error", reviewed));
  await audit({ eventId: application.eventId, actorId: actor.id, action: `ROLE_APPLICATION_${decision}`, entityType: "role_application", entityId: application.id, detail: { reason } });
  revalidatePath(`/ops/${application.eventId}/applications`);
  redirect(applicationFeedbackPath(application.eventId, "success", decision === "APPROVED" ? "身份申请已通过。" : "身份申请已拒绝。"));
}

export async function reviewTeam(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const decision = formString(formData, "decision") as "APPROVED" | "REJECTED";
  const reason = formString(formData, "reason").slice(0, 300);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) redirect("/events?error=" + encodeURIComponent("战队不存在"));
  const actor = await manager(team.eventId);
  if (team.status !== "PENDING") redirect(teamOpsFeedback(team.eventId, "error", "该战队申请已处理，请刷新列表"));
  if (!["APPROVED", "REJECTED"].includes(decision)) redirect(teamOpsFeedback(team.eventId, "error", "审核操作无效"));
  if (await isOnTeam(actor.id, team.eventId, teamId)) redirect(teamOpsFeedback(team.eventId, "error", "不能审核自己的战队，请由其他管理员处理"));
  if (decision === "REJECTED" && !reason) redirect(teamOpsFeedback(team.eventId, "error", "拒绝时必须填写原因"));
  const updated = await db.update(teams).set({ status: decision, locked: false, reviewReason: reason || null, updatedAt: new Date() }).where(and(eq(teams.id, teamId), eq(teams.status, "PENDING"))).returning({ id: teams.id });
  if (!updated.length) redirect(teamOpsFeedback(team.eventId, "error", "申请状态已变化，请刷新列表"));
  await notify(team.captainId, decision === "APPROVED" ? "建队申请已通过" : "建队申请需修改", reason || "战队已公开并开放选手申请加入", "/me/teams");
  await audit({ eventId: team.eventId, actorId: actor.id, action: `TEAM_${decision}`, entityType: "team", entityId: team.id, detail: { reason } });
  revalidatePath(`/ops/${team.eventId}/teams`);
  revalidatePath(`/events`);
  redirect(teamOpsFeedback(team.eventId, "success", decision === "APPROVED" ? "战队申请已通过并公开" : "战队申请已拒绝"));
}

function teamOpsFeedback(eventId: string, type: "error" | "success", message: string) {
  return `/ops/${eventId}/teams?${new URLSearchParams({ [type]: message }).toString()}`;
}

export async function adminCreateTeam(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const actor = await manager(eventId);
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || event.mode === "INDIVIDUAL") redirect(teamOpsFeedback(eventId, "error", "个人赛制不建立固定战队"));
  const name = formString(formData, "name").slice(0, 40);
  const abbreviation = formString(formData, "abbreviation").toUpperCase();
  const captainUsername = formString(formData, "captainUsername").toLowerCase();
  const [captain] = await db.select().from(users).innerJoin(eventRoleGrants, and(eq(eventRoleGrants.userId, users.id), eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.role, "PLAYER"))).where(and(eq(users.username, captainUsername), eq(users.disabled, false))).limit(1).then((rows) => rows.map((row) => row.users));
  if (!captain) redirect(teamOpsFeedback(eventId, "error", "队长账号不存在或尚未通过本赛事选手审核"));
  const [membership] = await db.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, captain.id))).limit(1);
  if (membership) redirect(teamOpsFeedback(eventId, "error", "该队长已经属于本赛事其他战队"));
  if (name.length < 2 || abbreviation.length < 2 || abbreviation.length > 6) redirect(teamOpsFeedback(eventId, "error", "战队名称至少 2 字，缩写应为 2–6 个字符"));
  const creationResult = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${captain.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-user:${eventId}:${captain.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${eventId}:${captain.id}:PLAYER`}))`);
    const [currentCaptain] = await tx.select({ id: users.id }).from(users)
      .innerJoin(eventRoleGrants, and(eq(eventRoleGrants.userId, users.id), eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.role, "PLAYER")))
      .where(and(eq(users.id, captain.id), eq(users.disabled, false))).limit(1);
    if (!currentCaptain) throw new Error("PLAYER_ROLE_REQUIRED");
    const created = await tx.insert(teams).values({ eventId, name, abbreviation, captainId: captain.id, status: "APPROVED", createdByAdmin: true }).returning();
    await tx.insert(teamMembers).values({ eventId, teamId: created[0].id, userId: captain.id, role: "CAPTAIN", gameNickname: captain.gameNickname });
    return created[0];
  }).catch((error) => error instanceof Error ? error.message : "UNKNOWN");
  if (typeof creationResult === "string") {
    redirect(teamOpsFeedback(eventId, "error", creationResult === "PLAYER_ROLE_REQUIRED" ? "队长的赛事选手身份已失效或账号已停用" : "战队名称或缩写已存在"));
  }
  const team = creationResult;
  await notify(captain.id, "赛事方已将你设为队长", `${event.name} 的战队 ${team.name} 已建立`, "/me/teams");
  await audit({ eventId, actorId: actor.id, action: "TEAM_CREATED_BY_MANAGER", entityType: "team", entityId: team.id, detail: { captainId: captain.id } });
  revalidatePath(`/ops/${eventId}/teams`);
  revalidatePath("/events");
  redirect(teamOpsFeedback(eventId, "success", "战队已创建并公开"));
}

export async function adminAddTeamMember(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const username = formString(formData, "username").toLowerCase();
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) redirect(invalidAction("战队不存在或已被删除"));
  const actor = await manager(team.eventId);
  const [event] = await db.select().from(events).where(eq(events.id, team.eventId)).limit(1);
  if (!event || event.mode === "INDIVIDUAL" || team.status !== "APPROVED") redirect(teamOpsFeedback(team.eventId, "error", "当前战队不能添加成员"));
  if (team.locked) redirect(teamOpsFeedback(team.eventId, "error", "名单已锁定；请先填写原因并解锁，再调整成员"));
  const [player] = await db.select().from(users).innerJoin(eventRoleGrants, and(eq(eventRoleGrants.userId, users.id), eq(eventRoleGrants.eventId, team.eventId), eq(eventRoleGrants.role, "PLAYER"))).where(and(eq(users.username, username), eq(users.disabled, false))).limit(1).then((rows) => rows.map((row) => row.users));
  if (!player) redirect(teamOpsFeedback(team.eventId, "error", "用户不存在或尚未通过本赛事选手审核"));
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${player.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-user:${team.eventId}:${player.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${team.eventId}:${player.id}:PLAYER`}))`);
    await tx.execute(sql`select ${teams.id} from ${teams} where ${teams.id} = ${teamId} for update`);
    const [currentTeam] = await tx.select({ status: teams.status, locked: teams.locked }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!currentTeam || currentTeam.status !== "APPROVED" || currentTeam.locked) return "TEAM_UNAVAILABLE" as const;
    const [currentPlayer] = await tx.select({ id: users.id }).from(users)
      .innerJoin(eventRoleGrants, and(eq(eventRoleGrants.userId, users.id), eq(eventRoleGrants.eventId, team.eventId), eq(eventRoleGrants.role, "PLAYER")))
      .where(and(eq(users.id, player.id), eq(users.disabled, false))).limit(1);
    if (!currentPlayer) return "PLAYER_ROLE_REQUIRED" as const;
    const [refereeConflict] = await tx.select({ userId: matchAssignments.userId }).from(matchAssignments)
      .innerJoin(matches, eq(matches.id, matchAssignments.matchId))
      .where(and(eq(matchAssignments.userId, player.id), eq(matchAssignments.role, "REFEREE"), eq(matches.eventId, team.eventId), inArray(matches.status, ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT"]), or(eq(matches.teamAId, teamId), eq(matches.teamBId, teamId))))
      .limit(1);
    if (refereeConflict) return "REFEREE_CONFLICT" as const;
    const count = await tx.$count(teamMembers, eq(teamMembers.teamId, teamId));
    if (count >= event.maxRoster) return "ROSTER_FULL" as const;
    const inserted = await tx.insert(teamMembers).values({ eventId: team.eventId, teamId, userId: player.id, gameNickname: player.gameNickname }).onConflictDoNothing().returning({ id: teamMembers.id });
    if (!inserted.length) return "ALREADY_MEMBER" as const;
    await tx.update(teamJoinRequests).set({ status: "WITHDRAWN", reviewReason: "赛事管理员已完成编队", reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(teamJoinRequests.eventId, team.eventId), eq(teamJoinRequests.userId, player.id), eq(teamJoinRequests.status, "PENDING")));
    await tx.update(teamInvites).set({ status: "WITHDRAWN" }).where(and(eq(teamInvites.eventId, team.eventId), eq(teamInvites.invitedUserId, player.id), eq(teamInvites.status, "PENDING")));
    return "ADDED" as const;
  });
  if (result === "TEAM_UNAVAILABLE") redirect(teamOpsFeedback(team.eventId, "error", "战队状态已变化，请刷新后重试"));
  if (result === "ROSTER_FULL") redirect(teamOpsFeedback(team.eventId, "error", "战队人数已达到上限"));
  if (result === "PLAYER_ROLE_REQUIRED") redirect(teamOpsFeedback(team.eventId, "error", "该选手的赛事身份已失效或账号已停用"));
  if (result === "REFEREE_CONFLICT") redirect(teamOpsFeedback(team.eventId, "error", "该选手仍被指派执裁本战队的未结束比赛，请先取消指派"));
  if (result === "ALREADY_MEMBER") redirect(teamOpsFeedback(team.eventId, "error", "该选手已经属于本赛事的一支战队"));
  await notify(player.id, "赛事方已完成编队", `你已加入 ${team.name}`, "/me/teams");
  await audit({ eventId: team.eventId, actorId: actor.id, action: "TEAM_MEMBER_ADDED_BY_MANAGER", entityType: "team", entityId: teamId, detail: { userId: player.id } });
  revalidatePath(`/ops/${team.eventId}/teams`);
  revalidatePath("/events");
  redirect(teamOpsFeedback(team.eventId, "success", "选手已加入战队"));
}

export async function adminRemoveTeamMember(formData: FormData) {
  const memberId = formString(formData, "memberId");
  const [row] = await db.select({ member: teamMembers, team: teams }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(eq(teamMembers.id, memberId)).limit(1);
  if (!row) redirect(invalidAction("战队成员不存在或已被移出"));
  const actor = await manager(row.team.eventId);
  if (row.team.locked) redirect(teamOpsFeedback(row.team.eventId, "error", "名单已锁定；请先填写原因并解锁，再调整成员"));
  const roster = await db.select().from(teamMembers).where(eq(teamMembers.teamId, row.team.id));
  const successor = row.member.role === "CAPTAIN" ? roster.find((member) => member.id !== memberId && member.role === "VICE_CAPTAIN") ?? roster.find((member) => member.id !== memberId) : null;
  await db.transaction(async (tx) => {
    if (row.member.role === "CAPTAIN" && !successor) {
      await tx.update(teams).set({ status: "WITHDRAWN", locked: true, reviewReason: "赛事管理员移出最后一名成员", updatedAt: new Date() }).where(eq(teams.id, row.team.id));
    } else if (successor) {
      await tx.update(teamMembers).set({ role: "CAPTAIN" }).where(eq(teamMembers.id, successor.id));
      await tx.update(teams).set({ captainId: successor.userId, updatedAt: new Date() }).where(eq(teams.id, row.team.id));
    }
    await tx.delete(teamMembers).where(eq(teamMembers.id, memberId));
  });
  await notify(row.member.userId, "你已被移出战队", `赛事管理员已将你移出 ${row.team.name}`, "/me/teams");
  if (successor) await notify(successor.userId, "你已成为队长", `赛事管理员调整阵容后，你接任 ${row.team.name} 队长`, "/me/teams");
  await audit({ eventId: row.team.eventId, actorId: actor.id, action: "TEAM_MEMBER_REMOVED_BY_MANAGER", entityType: "team", entityId: row.team.id, detail: { userId: row.member.userId, successorId: successor?.userId } });
  revalidatePath(`/ops/${row.team.eventId}/teams`);
  revalidatePath("/events");
  redirect(teamOpsFeedback(row.team.eventId, "success", successor ? "成员已移出；队长职务已自动交接" : "成员已移出"));
}

export async function adminDissolveTeam(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const reason = formString(formData, "reason").slice(0, 300) || "赛事管理员解散战队";
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) redirect(invalidAction("战队不存在或已被删除"));
  const actor = await manager(team.eventId);
  const unfinishedMatchCount = await db.$count(matches, and(
    eq(matches.eventId, team.eventId),
    or(eq(matches.teamAId, teamId), eq(matches.teamBId, teamId)),
    ne(matches.status, "PUBLISHED")
  ));
  const dissolutionError = teamDissolutionError({ unfinishedMatchCount });
  if (dissolutionError) redirect(teamOpsFeedback(team.eventId, "error", dissolutionError));
  const members = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
  await db.transaction(async (tx) => {
    await tx.update(teams).set({ status: "WITHDRAWN", locked: true, reviewReason: reason, updatedAt: new Date() }).where(eq(teams.id, teamId));
    await tx.update(teamJoinRequests).set({ status: "WITHDRAWN", reviewReason: "战队已解散", reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(teamJoinRequests.teamId, teamId), eq(teamJoinRequests.status, "PENDING")));
    await tx.update(teamInvites).set({ status: "WITHDRAWN" }).where(and(eq(teamInvites.teamId, teamId), eq(teamInvites.status, "PENDING")));
    await tx.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
  });
  await Promise.all(members.map(({ userId }) => notify(userId, "战队已由赛事方解散", `${team.name} 已解散`, "/me/teams")));
  await audit({ eventId: team.eventId, actorId: actor.id, action: "TEAM_DISSOLVED_BY_MANAGER", entityType: "team", entityId: teamId, detail: { reason } });
  revalidatePath(`/ops/${team.eventId}/teams`);
  revalidatePath("/events");
  redirect(teamOpsFeedback(team.eventId, "success", "战队已解散，成员已释放"));
}

export async function setTeamRosterLock(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const nextLocked = formString(formData, "locked") === "true";
  const reason = formString(formData, "reason").slice(0, 300);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) redirect(invalidAction("战队不存在或已被删除"));
  const actor = await manager(team.eventId);
  if (team.status !== "APPROVED") redirect(teamOpsFeedback(team.eventId, "error", "只有已通过审核的战队可以调整名单锁定状态"));
  if (team.locked === nextLocked) redirect(teamOpsFeedback(team.eventId, "error", nextLocked ? "该战队名单已经锁定" : "该战队名单已经处于可编辑状态"));
  if (!reason) redirect(teamOpsFeedback(team.eventId, "error", `${nextLocked ? "锁定" : "解锁"}名单必须填写原因`));
  const updated = await db.update(teams).set({ locked: nextLocked, updatedAt: new Date() }).where(and(eq(teams.id, teamId), eq(teams.locked, !nextLocked))).returning({ id: teams.id });
  if (!updated.length) redirect(teamOpsFeedback(team.eventId, "error", "名单状态已变化，请刷新后重试"));
  const members = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
  await Promise.all(members.map(({ userId }) => notify(userId, nextLocked ? "战队名单已锁定" : "战队名单已临时解锁", `${team.name}：${reason}`, "/me/teams")));
  await audit({ eventId: team.eventId, actorId: actor.id, action: nextLocked ? "TEAM_ROSTER_LOCKED" : "TEAM_ROSTER_UNLOCKED", entityType: "team", entityId: teamId, detail: { reason } });
  revalidatePath(`/ops/${team.eventId}/teams`);
  revalidatePath("/me/teams");
  redirect(teamOpsFeedback(team.eventId, "success", `${team.name} 名单已${nextLocked ? "锁定" : "解锁"}`));
}

export async function createIndividualMatch(_state: OpsState, formData: FormData): Promise<OpsState> {
  const eventId = formString(formData, "eventId");
  const actor = await manager(eventId);
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || event.mode !== "INDIVIDUAL") return { error: "只有个人报名赛制可以按场次分配选手" };
  const sideA = formData.getAll("sideA").map(String);
  const sideB = formData.getAll("sideB").map(String);
  const rosterError = individualMatchRosterError(sideA.length, sideB.length, new Set([...sideA, ...sideB]).size);
  if (rosterError) return { error: rosterError };
  const bestOf = Number(formString(formData, "bestOf"));
  if (![1, 3, 5].includes(bestOf)) return { error: "比赛局数只能是 BO1、BO3 或 BO5" };
  const scheduledAtRaw = formString(formData, "scheduledAt");
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return { error: "开赛时间格式不正确" };
  let match: typeof matches.$inferSelect;
  try {
    match = await db.transaction(async (tx) => {
      const participantIds = [...sideA, ...sideB].sort();
      for (const userId of participantIds) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${userId}`}))`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-user:${eventId}:${userId}`}))`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${eventId}:${userId}:PLAYER`}))`);
      }
      const approved = await tx.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants)
        .innerJoin(users, eq(users.id, eventRoleGrants.userId))
        .where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.role, "PLAYER"), inArray(eventRoleGrants.userId, participantIds), eq(users.disabled, false)));
      if (approved.length !== participantIds.length) throw new Error("PLAYER_ROLE_REQUIRED");
      const [created] = await tx.insert(matches).values({ eventId, roundLabel: formString(formData, "roundLabel").slice(0, 80) || "手动排赛", sideALabel: formString(formData, "sideALabel").slice(0, 40) || "A 组", sideBLabel: formString(formData, "sideBLabel").slice(0, 40) || "B 组", bestOf, scheduledAt, status: "SCHEDULED" }).returning();
      await tx.insert(matchParticipants).values([...sideA.map((userId, slotIndex) => ({ matchId: created.id, eventId, userId, side: "A" as const, slotIndex })), ...sideB.map((userId, slotIndex) => ({ matchId: created.id, eventId, userId, side: "B" as const, slotIndex }))]);
      return created;
    });
  } catch (error) {
    return { error: error instanceof Error && error.message === "PLAYER_ROLE_REQUIRED" ? "参赛名单包含未通过审核或已停用的用户" : "比赛创建失败，请刷新后重试" };
  }
  await Promise.all([...sideA, ...sideB].map((userId) => notify(userId, "你已被安排比赛", `${event.name}：${match.roundLabel}`, `/events/${event.slug}/schedule`)));
  await audit({ eventId, actorId: actor.id, action: "INDIVIDUAL_MATCH_CREATED", entityType: "match", entityId: match.id, detail: { sideA, sideB } });
  revalidatePath(`/ops/${eventId}/matches`);
  revalidatePath("/events");
  return { success: "比赛已创建并通知双方选手" };
}

export async function createManualTeamMatch(_state: OpsState, formData: FormData): Promise<OpsState> {
  const stageId = formString(formData, "stageId");
  const teamAId = formString(formData, "teamAId");
  const teamBId = formString(formData, "teamBId");
  const [stage] = await db.select().from(stages).where(eq(stages.id, stageId)).limit(1);
  if (!stage || stage.type !== "MANUAL") return { error: "手动阶段不存在" };
  const actor = await manager(stage.eventId);
  if (stage.status === "COMPLETED") return { error: "该阶段已经完成；如需补排比赛，请先填写原因重新开启阶段" };
  const [event] = await db.select({ slug: events.slug }).from(events).where(eq(events.id, stage.eventId)).limit(1);
  if (!event) return { error: "赛事不存在" };
  if (!teamAId || !teamBId || teamAId === teamBId) return { error: "请选择两支不同的战队" };
  const selectedTeams = await db.select({ id: teams.id, name: teams.name }).from(teams).where(and(eq(teams.eventId, stage.eventId), eq(teams.status, "APPROVED"), inArray(teams.id, [teamAId, teamBId])));
  if (selectedTeams.length !== 2) return { error: "比赛双方必须是本赛事已通过审核的战队" };
  const bestOf = Number(formString(formData, "bestOf"));
  if (![1, 3, 5].includes(bestOf)) return { error: "请选择有效的比赛局数" };
  const scheduledRaw = formString(formData, "scheduledAt");
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return { error: "比赛时间格式无效" };
  let match: typeof matches.$inferSelect;
  try {
    match = await db.transaction(async (tx) => {
      await tx.execute(sql`select ${stages.id} from ${stages} where ${stages.id} = ${stageId} for update`);
      const [currentStage] = await tx.select({ status: stages.status }).from(stages).where(eq(stages.id, stageId)).limit(1);
      if (!currentStage || currentStage.status === "COMPLETED") throw new Error("该阶段已经完成；请先重新开启阶段");
      const [created] = await tx.insert(matches).values({
        eventId: stage.eventId, stageId, roundLabel: formString(formData, "roundLabel").slice(0, 80) || stage.name,
        teamAId, teamBId, bestOf, scheduledAt, status: "SCHEDULED"
      }).returning();
      await tx.update(stages).set({ status: "ACTIVE" }).where(and(eq(stages.id, stageId), eq(stages.status, "DRAFT")));
      await tx.update(teams).set({ locked: true, updatedAt: new Date() }).where(and(eq(teams.eventId, stage.eventId), eq(teams.status, "APPROVED")));
      return created;
    });
  } catch (error) {
    return { error: error instanceof Error && error.message === "该阶段已经完成；请先重新开启阶段" ? error.message : "手动比赛创建失败，请刷新后重试" };
  }
  const members = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, [teamAId, teamBId]));
  await Promise.all(members.map(({ userId }) => notify(userId, "新比赛已排期", `${selectedTeams[0].name} 对 ${selectedTeams[1].name} · ${match.roundLabel}`, `/events/${event.slug}/schedule`)));
  await audit({ eventId: stage.eventId, actorId: actor.id, action: "MANUAL_MATCH_CREATED", entityType: "match", entityId: match.id, detail: { stageId, teamAId, teamBId } });
  revalidatePath(`/ops/${stage.eventId}/workflow`);
  revalidatePath(`/ops/${stage.eventId}/matches`);
  return { success: "手动比赛已创建并通知双方队员" };
}

export async function createStage(_state: OpsState, formData: FormData): Promise<OpsState> {
  const eventId = formString(formData, "eventId");
  const actor = await manager(eventId);
  const [event] = await db.select({ mode: events.mode }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || event.mode === "INDIVIDUAL") return { error: "个人报名赛制请直接逐场安排选手" };
  const type = formString(formData, "type") as "ROUND_ROBIN" | "SINGLE_ELIMINATION" | "MANUAL";
  const name = formString(formData, "name").slice(0, 120);
  if (!name || !["ROUND_ROBIN", "SINGLE_ELIMINATION", "MANUAL"].includes(type)) return { error: "阶段信息不完整" };
  const advanceCount = Number(formString(formData, "advanceCount"));
  if (!Number.isInteger(advanceCount) || advanceCount < 1 || advanceCount > 64) return { error: "晋级数量应为 1–64 的整数" };
  const stage = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`stage-order:${eventId}`}))`);
    const [{ maxOrder }] = await tx.select({ maxOrder: sql<number>`coalesce(max(${stages.orderIndex}), 0)::int` }).from(stages).where(eq(stages.eventId, eventId));
    const [created] = await tx.insert(stages).values({ eventId, name: name.slice(0, 80), type, orderIndex: maxOrder + 1, advanceCount }).returning();
    return created;
  });
  await audit({ eventId, actorId: actor.id, action: "STAGE_CREATED", entityType: "stage", entityId: stage.id, detail: { type } });
  revalidatePath(`/ops/${eventId}/workflow`);
  return { success: "阶段已添加" };
}

export async function generateStageMatches(formData: FormData) {
  const stageId = formString(formData, "stageId");
  const [stage] = await db.select().from(stages).where(eq(stages.id, stageId)).limit(1);
  if (!stage) redirect(invalidAction("阶段不存在或已被删除"));
  const actor = await manager(stage.eventId);
  const [event] = await db.select({ mode: events.mode, name: events.name, slug: events.slug, defaultBestOf: events.defaultBestOf }).from(events).where(eq(events.id, stage.eventId)).limit(1);
  const feedback = (type: "error" | "success", message: string) => `/ops/${stage.eventId}/workflow?${new URLSearchParams({ [type]: message }).toString()}`;
  if (!event || event.mode === "INDIVIDUAL") redirect(feedback("error", "个人赛制不能自动生成战队赛程"));
  const approvedTeams = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.eventId, stage.eventId), eq(teams.status, "APPROVED"))).orderBy(asc(teams.createdAt), asc(teams.id));
  const existing = await db.$count(matches, eq(matches.stageId, stage.id));
  if (stage.status !== "DRAFT") redirect(feedback("error", "该阶段已经激活"));
  if (existing) redirect(feedback("error", "该阶段已经存在比赛，不能重复生成"));
  if (approvedTeams.length < 2) redirect(feedback("error", "至少需要两支已通过审核的战队"));
  const ids = approvedTeams.map((team) => team.id);
  const pairings = stage.type === "ROUND_ROBIN" ? roundRobinPairings(ids) : stage.type === "SINGLE_ELIMINATION" ? singleEliminationBracket(ids) : [];
  const totalRounds = pairings.reduce((highest, pairing) => Math.max(highest, pairing.round), 0);
  const matchValues = pairings.map((pairing) => ({
    eventId: stage.eventId,
    stageId: stage.id,
    roundLabel: stage.type === "SINGLE_ELIMINATION" ? pairing.round === totalRounds ? "决赛" : pairing.round === totalRounds - 1 ? "半决赛" : `淘汰赛第 ${pairing.round} 轮` : `第 ${pairing.round} 轮`,
    bracketRound: stage.type === "SINGLE_ELIMINATION" ? pairing.round : null,
    bracketIndex: pairing.index,
    teamAId: pairing.teamA,
    teamBId: pairing.teamB,
    bestOf: event.defaultBestOf,
    status: pairing.teamA && pairing.teamB ? "SCHEDULED" as const : "DRAFT" as const
  }));
  const generated = await db.transaction(async (tx) => {
    const activated = await tx.update(stages).set({ status: "ACTIVE" }).where(and(eq(stages.id, stage.id), eq(stages.status, "DRAFT"))).returning({ id: stages.id });
    if (!activated.length) return [];
    const inserted = matchValues.length ? await tx.insert(matches).values(matchValues).returning() : [];
    await tx.update(teams).set({ locked: true, updatedAt: new Date() }).where(and(eq(teams.eventId, stage.eventId), eq(teams.status, "APPROVED")));
    return inserted;
  });
  if (!generated.length) redirect(feedback("error", "阶段状态已由其他管理员更新，请刷新后重试"));
  const scheduled = generated.filter((match) => match.teamAId && match.teamBId);
  const scheduledTeamIds = [...new Set(scheduled.flatMap((match) => [match.teamAId, match.teamBId]).filter((id): id is string => Boolean(id)))];
  if (scheduledTeamIds.length) {
    const recipients = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, scheduledTeamIds));
    await Promise.all([...new Set(recipients.map(({ userId }) => userId))].map((userId) => notify(userId, "赛事阶段赛程已生成", `${event.name} · ${stage.name}，请查看对阵安排`, `/events/${event.slug}/schedule`)));
  }
  await audit({ eventId: stage.eventId, actorId: actor.id, action: "STAGE_MATCHES_GENERATED", entityType: "stage", entityId: stage.id, detail: { count: pairings.length } });
  revalidatePath(`/ops/${stage.eventId}/workflow`);
  revalidatePath(`/ops/${stage.eventId}/matches`);
  redirect(feedback("success", `已生成 ${generated.length} 个对阵档案，其中 ${scheduled.length} 场可立即排期；轮空与后续对阵将自动推进`));
}

export async function updateDraftStage(formData: FormData) {
  const stageId = formString(formData, "stageId");
  const [stage] = await db.select().from(stages).where(eq(stages.id, stageId)).limit(1);
  if (!stage) redirect(invalidAction("阶段不存在或已被删除"));
  const actor = await manager(stage.eventId);
  const feedback = (type: "error" | "success", message: string) => `/ops/${stage.eventId}/workflow?${new URLSearchParams({ [type]: message }).toString()}`;
  if (stage.status !== "DRAFT") redirect(feedback("error", "只有草稿阶段可以修改"));
  const name = formString(formData, "name").slice(0, 120);
  const advanceCount = Number(formString(formData, "advanceCount"));
  if (!name || advanceCount < 1) redirect(feedback("error", "阶段名称和晋级数量不正确"));
  const updated = await db.update(stages).set({ name: name.slice(0, 80), advanceCount }).where(and(eq(stages.id, stageId), eq(stages.status, "DRAFT"))).returning({ id: stages.id });
  if (!updated.length) redirect(feedback("error", "阶段状态已变化，请刷新后重试"));
  await audit({ eventId: stage.eventId, actorId: actor.id, action: "STAGE_UPDATED", entityType: "stage", entityId: stageId, detail: { name, advanceCount } });
  revalidatePath(`/ops/${stage.eventId}/workflow`);
  redirect(feedback("success", "阶段设置已更新"));
}

export async function deleteDraftStage(formData: FormData) {
  const stageId = formString(formData, "stageId");
  const [stage] = await db.select().from(stages).where(eq(stages.id, stageId)).limit(1);
  if (!stage) redirect(invalidAction("阶段不存在或已被删除"));
  const actor = await manager(stage.eventId);
  const feedback = (type: "error" | "success", message: string) => `/ops/${stage.eventId}/workflow?${new URLSearchParams({ [type]: message }).toString()}`;
  const matchCount = await db.$count(matches, eq(matches.stageId, stageId));
  if (stage.status !== "DRAFT" || matchCount > 0) redirect(feedback("error", "只有尚未生成比赛的草稿阶段可以删除"));
  const removed = await db.delete(stages).where(and(eq(stages.id, stageId), eq(stages.status, "DRAFT"))).returning({ id: stages.id });
  if (!removed.length) redirect(feedback("error", "阶段状态已变化，请刷新后重试"));
  await audit({ eventId: stage.eventId, actorId: actor.id, action: "STAGE_DELETED", entityType: "stage", entityId: stageId, detail: { name: stage.name } });
  revalidatePath(`/ops/${stage.eventId}/workflow`);
  redirect(feedback("success", `已删除阶段“${stage.name}”`));
}

export async function reopenCompletedManualStage(formData: FormData) {
  const stageId = formString(formData, "stageId");
  const reason = formString(formData, "reason").slice(0, 300);
  const [stage] = await db.select().from(stages).where(eq(stages.id, stageId)).limit(1);
  if (!stage) redirect(invalidAction("阶段不存在或已被删除"));
  const actor = await manager(stage.eventId);
  const feedback = (type: "error" | "success", message: string) => `/ops/${stage.eventId}/workflow?${new URLSearchParams({ [type]: message }).toString()}`;
  if (stage.type !== "MANUAL" || stage.status !== "COMPLETED") redirect(feedback("error", "只有已经完成的手动阶段可以重新开启"));
  if (!reason) redirect(feedback("error", "重新开启阶段必须填写原因"));
  const reopened = await db.update(stages).set({ status: "ACTIVE" }).where(and(eq(stages.id, stageId), eq(stages.status, "COMPLETED"), eq(stages.type, "MANUAL"))).returning({ id: stages.id });
  if (!reopened.length) redirect(feedback("error", "阶段状态已变化，请刷新后重试"));
  await audit({ eventId: stage.eventId, actorId: actor.id, action: "STAGE_REOPENED", entityType: "stage", entityId: stageId, detail: { reason } });
  revalidatePath(`/ops/${stage.eventId}/workflow`);
  revalidatePath(`/events`);
  redirect(feedback("success", `已重新开启“${stage.name}”，现在可以补排比赛`));
}

export async function createEvent(_state: OpsState, formData: FormData): Promise<OpsState> {
  const actor = await requireAdmin();
  const slug = slugSchema.safeParse(formString(formData, "slug"));
  const name = formString(formData, "name").slice(0, 120);
  const mode = formString(formData, "mode") as "PLAYER_TEAMS" | "ADMIN_TEAMS" | "INDIVIDUAL";
  if (!slug.success || name.length < 2) return { error: "赛事名称或网址标识不正确" };
  if (!["PLAYER_TEAMS", "ADMIN_TEAMS", "INDIVIDUAL"].includes(mode)) return { error: "请选择有效的赛事编制方式" };
  const minRoster = mode === "INDIVIDUAL" ? 1 : Number(formString(formData, "minRoster")) || 5;
  const maxRoster = mode === "INDIVIDUAL" ? 1 : Number(formString(formData, "maxRoster")) || 7;
  if (minRoster < 1 || maxRoster < minRoster || maxRoster > 20) return { error: "队伍人数设置不正确" };
  const [event] = await db.insert(events).values({
    slug: slug.data, name, tagline: formString(formData, "tagline").slice(0, 160), description: formString(formData, "description").slice(0, 3000),
    status: "REGISTRATION", mode, minRoster, maxRoster,
    createdBy: actor.id, eventStart: optionalDate(formData, "eventStart")
  }).returning().catch(() => []);
  if (!event) return { error: "网址标识已存在" };
  await audit({ eventId: event.id, actorId: actor.id, action: "EVENT_CREATED", entityType: "event", entityId: event.id });
  revalidatePath("/admin/events");
  return { success: "赛事已创建" };
}

function optionalDate(formData: FormData, key: string) {
  const raw = formString(formData, key);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function updateEventSettings(_state: OpsState, formData: FormData): Promise<OpsState> {
  const eventId = formString(formData, "eventId");
  const actor = await manager(eventId, { allowCompleted: true });
  const name = formString(formData, "name").slice(0, 120);
  const status = formString(formData, "status") as EventStatus;
  const defaultBestOf = Number(formString(formData, "defaultBestOf"));
  const transitionReason = formString(formData, "transitionReason").slice(0, 300);
  if (name.length < 2) return { error: "赛事名称至少需要 2 个字符" };
  if (!["DRAFT", "REGISTRATION", "ACTIVE", "COMPLETED"].includes(status)) return { error: "赛事状态无效；归档请前往全局赛事管理" };
  if (![1, 3, 5].includes(defaultBestOf)) return { error: "默认局数只能是 BO1、BO3 或 BO5" };
  const registrationStart = optionalDate(formData, "registrationStart");
  const registrationEnd = optionalDate(formData, "registrationEnd");
  const eventStart = optionalDate(formData, "eventStart");
  const eventEnd = optionalDate(formData, "eventEnd");
  if (registrationStart && registrationEnd && registrationStart >= registrationEnd) return { error: "报名结束时间必须晚于开始时间" };
  if (eventStart && eventEnd && eventStart >= eventEnd) return { error: "赛事结束时间必须晚于开始时间" };
  const result = await db.transaction(async (tx) => {
    // All event-level mutations share one lock. PostgreSQL timestamps keep
    // microseconds while JavaScript Date only keeps milliseconds, so using
    // updated_at as an equality-based CAS can reject an unchanged row.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${eventId}`}))`);
    const [event] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return { error: "赛事不存在" };
    const minRoster = event.mode === "INDIVIDUAL" ? 1 : Number(formString(formData, "minRoster"));
    const maxRoster = event.mode === "INDIVIDUAL" ? 1 : Number(formString(formData, "maxRoster"));
    if (minRoster < 1 || maxRoster < minRoster || maxRoster > 20) return { error: "战队人数范围设置不正确" };
    const [{ count: unfinishedMatchCount }] = await tx.select({ count: sql<number>`count(*)::int` }).from(matches).where(and(eq(matches.eventId, eventId), ne(matches.status, "PUBLISHED")));
    const transitionError = eventStatusTransitionError({ current: event.status, next: status, reason: transitionReason, registrationEnd, unfinishedMatchCount });
    if (transitionError) return { error: transitionError };
    if (event.mode !== "INDIVIDUAL") {
      const rosterSizes = await tx.select({ teamId: teams.id, count: sql<number>`count(${teamMembers.id})::int` }).from(teams).leftJoin(teamMembers, eq(teamMembers.teamId, teams.id)).where(and(eq(teams.eventId, eventId), inArray(teams.status, ["PENDING", "APPROVED"]))).groupBy(teams.id);
      const largestRoster = Math.max(0, ...rosterSizes.map((item) => item.count));
      if (maxRoster < largestRoster) return { error: `已有战队包含 ${largestRoster} 名队员，最多人数不能低于现有阵容` };
      if (["ACTIVE", "COMPLETED"].includes(status)) {
        const approvedSizes = await tx.select({ teamId: teams.id, count: sql<number>`count(${teamMembers.id})::int` }).from(teams).leftJoin(teamMembers, eq(teamMembers.teamId, teams.id)).where(and(eq(teams.eventId, eventId), eq(teams.status, "APPROVED"))).groupBy(teams.id);
        const undersized = approvedSizes.find((item) => item.count < minRoster);
        if (undersized) return { error: `存在仅 ${undersized.count} 名队员的已审核战队，不能以当前最少人数进入该状态` };
      }
    }
    const changed = await tx.update(events).set({
      name, tagline: formString(formData, "tagline").slice(0, 160), description: formString(formData, "description").slice(0, 3000),
      status, minRoster, maxRoster, defaultBestOf, registrationStart, registrationEnd, eventStart, eventEnd, updatedAt: new Date()
    }).where(eq(events.id, eventId)).returning({ id: events.id });
    if (!changed.length) return { error: "赛事不存在或刚刚已被删除，请刷新后重试" };
    if (["ACTIVE", "COMPLETED"].includes(status)) await tx.update(teams).set({ locked: true, updatedAt: new Date() }).where(and(eq(teams.eventId, eventId), eq(teams.status, "APPROVED")));
    await tx.insert(auditLogs).values({ eventId, actorId: actor.id, action: "EVENT_SETTINGS_UPDATED", entityType: "event", entityId: eventId, detail: { previousStatus: event.status, status, transitionReason: transitionReason || null } });
    return { event, minRoster, maxRoster };
  });
  if ("error" in result) return { error: result.error };
  revalidatePath(`/ops/${eventId}`);
  revalidatePath("/events");
  revalidatePath(`/events/${result.event.slug}`);
  return { success: status === "DRAFT" ? "赛事设置已保存；草稿状态不会显示在公开赛事列表" : "赛事设置已保存并同步到公开页面" };
}

export async function setEventArchived(formData: FormData) {
  const actor = await requireAdmin();
  const eventId = formString(formData, "eventId");
  const archived = formString(formData, "archived") === "true";
  const reason = formString(formData, "reason").slice(0, 300);
  const returnTo = safeNextPath(formString(formData, "returnTo"), "/admin/events");
  const feedback = (type: "error" | "success", message: string) => `${returnTo}${returnTo.includes("?") ? "&" : "?"}${new URLSearchParams({ [type]: message }).toString()}`;
  if (!reason) redirect(feedback("error", `${archived ? "归档" : "恢复"}赛事必须填写原因`));
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) redirect(feedback("error", "赛事不存在或状态已变化"));
  if (archived && event.status === "ARCHIVED") redirect(feedback("error", "该赛事已经归档"));
  if (!archived && event.status !== "ARCHIVED") redirect(feedback("error", "只有已归档赛事可以恢复"));
  const nextStatus = archived ? "ARCHIVED" as const : "DRAFT" as const;
  const changed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${eventId}`}))`);
    const rows = await tx.update(events).set({ status: nextStatus, updatedAt: new Date() }).where(and(eq(events.id, eventId), eq(events.status, event.status))).returning({ id: events.id });
    if (!rows.length) return false;
    if (archived) await tx.update(teams).set({ locked: true, updatedAt: new Date() }).where(and(eq(teams.eventId, eventId), eq(teams.status, "APPROVED")));
    await tx.insert(auditLogs).values({ eventId, actorId: actor.id, action: archived ? "EVENT_ARCHIVED" : "EVENT_RESTORED", entityType: "event", entityId: eventId, detail: { previousStatus: event.status, status: nextStatus, reason } });
    return true;
  });
  if (!changed) redirect(feedback("error", "赛事状态已由其他管理员更新，请刷新后重试"));
  const managers = await db.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.role, "EVENT_MANAGER")));
  await Promise.all(managers.filter(({ userId }) => userId !== actor.id).map(({ userId }) => notify(userId, archived ? "赛事已归档" : "赛事已恢复为草稿", `${event.name}：${reason}`, `/ops/${eventId}`)));
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath(`/events/${event.slug}`);
  revalidatePath(`/ops/${eventId}`);
  redirect(feedback("success", archived ? `已归档“${event.name}”，公开入口现已关闭` : `已将“${event.name}”恢复为草稿，可进入工作台继续编辑`));
}

export async function setGameCharacterEnabled(formData: FormData) {
  const actor = await requireAdmin();
  const key = formString(formData, "key");
  const enabled = formString(formData, "enabled") === "true";
  const [character] = await db.update(gameCharacters).set({ enabled }).where(eq(gameCharacters.key, key)).returning({ key: gameCharacters.key, name: gameCharacters.name });
  if (!character) redirect("/admin/catalog?error=" + encodeURIComponent("角色不存在或目录已更新"));
  await audit({ actorId: actor.id, action: enabled ? "GAME_CHARACTER_ENABLED" : "GAME_CHARACTER_DISABLED", entityType: "game_character", entityId: character.key, detail: { name: character.name } });
  revalidatePath("/admin/catalog");
  redirect(`/admin/catalog?success=${encodeURIComponent(`已${enabled ? "启用" : "停用"}角色“${character.name}”`)}`);
}

export async function grantEventManager(formData: FormData) {
  const actor = await requireAdmin();
  const eventId = formString(formData, "eventId");
  const username = formString(formData, "username").toLowerCase();
  const returnTo = safeNextPath(formString(formData, "returnTo"), "/admin/events");
  const feedback = (type: "error" | "success", message: string) => `${returnTo}${returnTo.includes("?") ? "&" : "?"}${new URLSearchParams({ [type]: message }).toString()}`;
  const [event] = await db.select({ name: events.name, status: events.status }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) redirect(feedback("error", "赛事不存在或已被移除"));
  if (event.status === "ARCHIVED") redirect(feedback("error", "已归档赛事不能新增管理授权；如需继续运营，请先恢复赛事"));
  const [user] = await db.select().from(users).where(and(eq(users.username, username), eq(users.disabled, false))).limit(1);
  if (!user) redirect(feedback("error", "用户不存在或账号已停用"));
  const inserted = await db.insert(eventRoleGrants).values({ eventId, userId: user.id, role: "EVENT_MANAGER", grantedBy: actor.id }).onConflictDoNothing().returning({ userId: eventRoleGrants.userId });
  if (!inserted.length) redirect(feedback("error", `${user.displayName} 已是该赛事的赛事管理员`));
  await notify(user.id, "你已成为赛事管理员", "全局管理员已授予赛事管理权限", `/ops/${eventId}`);
  await audit({ eventId, actorId: actor.id, action: "EVENT_MANAGER_GRANTED", entityType: "user", entityId: user.id });
  revalidatePath("/admin/events");
  revalidatePath(`/ops/${eventId}`);
  redirect(feedback("success", `已授权 ${user.displayName} 管理“${event.name}”`));
}

export async function revokeEventManager(formData: FormData) {
  const actor = await requireAdmin();
  const eventId = formString(formData, "eventId");
  const userId = formString(formData, "userId");
  const returnTo = safeNextPath(formString(formData, "returnTo"), "/admin/events");
  const feedback = (type: "error" | "success", message: string) => `${returnTo}${returnTo.includes("?") ? "&" : "?"}${new URLSearchParams({ [type]: message }).toString()}`;
  const [grant] = await db.select({ userId: eventRoleGrants.userId, displayName: users.displayName }).from(eventRoleGrants).innerJoin(users, eq(users.id, eventRoleGrants.userId)).where(and(
    eq(eventRoleGrants.eventId, eventId),
    eq(eventRoleGrants.userId, userId),
    eq(eventRoleGrants.role, "EVENT_MANAGER")
  )).limit(1);
  if (!grant) redirect(feedback("error", "该赛事管理员授权已取消或不存在"));
  await db.delete(eventRoleGrants).where(and(
    eq(eventRoleGrants.eventId, eventId),
    eq(eventRoleGrants.userId, userId),
    eq(eventRoleGrants.role, "EVENT_MANAGER")
  ));
  await notify(userId, "赛事管理员权限已取消", "全局管理员已取消你在该赛事的管理权限；其他赛事身份不受影响。", `/events`);
  await audit({ eventId, actorId: actor.id, action: "EVENT_MANAGER_REVOKED", entityType: "user", entityId: userId });
  revalidatePath("/admin/events");
  revalidatePath(`/ops/${eventId}`);
  revalidatePath("/me");
  redirect(feedback("success", `已取消 ${grant.displayName} 的赛事管理员权限`));
}

function matchOpsFeedback(eventId: string, type: "error" | "success", message: string) {
  return `/ops/${eventId}/matches?${new URLSearchParams({ [type]: message }).toString()}`;
}

export async function assignMatchStaff(formData: FormData) {
  const matchId = formString(formData, "matchId");
  const fallbackEventId = formString(formData, "eventId");
  const username = formString(formData, "username").toLowerCase();
  const role = formString(formData, "role") as "REFEREE" | "COMMENTATOR";
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match || !["REFEREE", "COMMENTATOR"].includes(role)) redirect(matchOpsFeedback(fallbackEventId, "error", "比赛或工作人员身份无效"));
  if (!username) redirect(matchOpsFeedback(match.eventId, "error", `请先选择要指派的${role === "REFEREE" ? "裁判" : "解说"}`));
  if (match.bracketRound && (!match.teamAId || !match.teamBId)) redirect(matchOpsFeedback(match.eventId, "error", "该淘汰赛对阵仍在等待上一轮胜者，暂不能指派工作人员"));
  const actor = await manager(match.eventId);
  if (!canManageMatchStaff(match.status)) redirect(matchOpsFeedback(match.eventId, "error", "比赛结果已经发布，工作人员记录已锁定，不能再新增指派"));
  const [assignee] = await db.select().from(users).where(and(eq(users.username, username), eq(users.disabled, false))).limit(1);
  if (!assignee) redirect(matchOpsFeedback(match.eventId, "error", "工作人员账号不存在或已停用"));
  const [grant] = await db.select().from(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, match.eventId), eq(eventRoleGrants.userId, assignee.id), eq(eventRoleGrants.role, role))).limit(1);
  if (!grant) redirect(matchOpsFeedback(match.eventId, "error", `该用户尚未获得本赛事${role === "REFEREE" ? "裁判" : "解说"}身份`));
  const [event] = await db.select({ slug: events.slug }).from(events).where(eq(events.id, match.eventId)).limit(1);
  if (role === "REFEREE" && (await isOnTeam(assignee.id, match.eventId, match.teamAId) || await isOnTeam(assignee.id, match.eventId, match.teamBId))) redirect(matchOpsFeedback(match.eventId, "error", "裁判不能执裁本人战队比赛"));
  const [individualParticipant] = await db.select({ userId: matchParticipants.userId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, assignee.id))).limit(1);
  if (role === "REFEREE" && individualParticipant) redirect(matchOpsFeedback(match.eventId, "error", "参赛选手不能执裁本人参与的比赛"));
  const assignResult = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${assignee.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-user:${match.eventId}:${assignee.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${match.eventId}:${assignee.id}:${role}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`match-staff:${matchId}`}))`);
    const [currentAssignee] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, assignee.id), eq(users.disabled, false))).limit(1);
    const [currentGrant] = await tx.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, match.eventId), eq(eventRoleGrants.userId, assignee.id), eq(eventRoleGrants.role, role))).limit(1);
    if (!currentAssignee || !currentGrant) return "ROLE_REQUIRED" as const;
    const [currentMatch] = await tx.select({ status: matches.status, teamAId: matches.teamAId, teamBId: matches.teamBId }).from(matches).where(eq(matches.id, matchId)).limit(1);
    if (!currentMatch || !canManageMatchStaff(currentMatch.status)) return "MATCH_LOCKED" as const;
    const [currentConflict] = await tx.select({ role: matchAssignments.role }).from(matchAssignments).where(and(eq(matchAssignments.matchId, matchId), eq(matchAssignments.userId, assignee.id))).limit(1);
    const staffIssue = matchStaffAssignmentError({ role, sameUserRole: currentConflict?.role ?? null });
    if (staffIssue) return staffIssue;
    if (role === "REFEREE") {
      const [participant] = await tx.select({ userId: matchParticipants.userId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, assignee.id))).limit(1);
      const [membership] = await tx.select({ teamId: teamMembers.teamId }).from(teamMembers).where(and(eq(teamMembers.eventId, match.eventId), eq(teamMembers.userId, assignee.id), or(eq(teamMembers.teamId, currentMatch.teamAId ?? "00000000-0000-0000-0000-000000000000"), eq(teamMembers.teamId, currentMatch.teamBId ?? "00000000-0000-0000-0000-000000000000")))).limit(1);
      if (participant || membership) return "SELF_MATCH" as const;
    }
    const inserted = await tx.insert(matchAssignments).values({ matchId, userId: assignee.id, role, assignedBy: actor.id }).onConflictDoNothing().returning({ userId: matchAssignments.userId });
    return inserted.length ? "ASSIGNED" as const : "STALE" as const;
  });
  if (assignResult !== "ASSIGNED") {
    const message = assignResult === "ROLE_REQUIRED" ? `该用户的本赛事${role === "REFEREE" ? "裁判" : "解说"}身份已失效或账号已停用`
      : assignResult === "MATCH_LOCKED" ? "比赛状态已变化，工作人员记录已经锁定"
        : assignResult === "SAME_ASSIGNMENT" ? "该工作人员已被指派此任务"
          : assignResult === "CROSS_ROLE" ? "同一场比赛不能同时担任解说和裁判"
            : assignResult === "SELF_MATCH" ? "参赛选手或参赛战队成员不能执裁本人比赛"
              : "任务已被其他管理员指派，请刷新查看";
    redirect(matchOpsFeedback(match.eventId, "error", message));
  }
  await notify(assignee.id, "收到比赛工作指派", `你被指派为本场${role === "REFEREE" ? "裁判" : "解说"}`, event ? `/events/${event.slug}/schedule` : "/me/assignments");
  await audit({ eventId: match.eventId, actorId: actor.id, action: "MATCH_STAFF_ASSIGNED", entityType: "match", entityId: matchId, detail: { assignee: assignee.id, role } });
  revalidatePath(`/ops/${match.eventId}/matches`);
  revalidatePath("/me/assignments");
  redirect(matchOpsFeedback(match.eventId, "success", `已指派 ${assignee.displayName} 担任${role === "REFEREE" ? "裁判" : "解说"}`));
}

export async function unassignMatchStaff(formData: FormData) {
  const matchId = formString(formData, "matchId");
  const userId = formString(formData, "userId");
  const role = formString(formData, "role") as "REFEREE" | "COMMENTATOR";
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) redirect(invalidAction("比赛不存在或已被撤销"));
  const actor = await manager(match.eventId);
  if (!canManageMatchStaff(match.status)) redirect(matchOpsFeedback(match.eventId, "error", "比赛结果已经发布，工作人员记录已锁定，不能再取消指派"));
  const [assignment] = await db.select({ assignment: matchAssignments, assignee: users }).from(matchAssignments).innerJoin(users, eq(users.id, matchAssignments.userId)).where(and(eq(matchAssignments.matchId, matchId), eq(matchAssignments.userId, userId), eq(matchAssignments.role, role))).limit(1);
  if (!assignment) redirect(matchOpsFeedback(match.eventId, "error", "该工作指派已被取消或不存在"));
  const removed = await db.delete(matchAssignments).where(and(eq(matchAssignments.matchId, matchId), eq(matchAssignments.userId, userId), eq(matchAssignments.role, role))).returning({ userId: matchAssignments.userId });
  if (!removed.length) redirect(matchOpsFeedback(match.eventId, "error", "指派状态已变化，请刷新后重试"));
  await notify(userId, "比赛工作指派已取消", `你不再担任本场${role === "REFEREE" ? "裁判" : "解说"}。`, `/me/assignments`);
  await audit({ eventId: match.eventId, actorId: actor.id, action: "MATCH_STAFF_UNASSIGNED", entityType: "match", entityId: matchId, detail: { assignee: userId, role } });
  revalidatePath(`/ops/${match.eventId}/matches`);
  revalidatePath("/me/assignments");
  redirect(matchOpsFeedback(match.eventId, "success", `已取消 ${assignment.assignee.displayName} 的${role === "REFEREE" ? "裁判" : "解说"}指派`));
}

async function matchRecipients(match: typeof matches.$inferSelect) {
  const teamIds = [match.teamAId, match.teamBId].filter((id): id is string => Boolean(id));
  const [members, participants, staff] = await Promise.all([
    teamIds.length ? db.select({ userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)) : Promise.resolve([]),
    db.select({ userId: matchParticipants.userId }).from(matchParticipants).where(eq(matchParticipants.matchId, match.id)),
    db.select({ userId: matchAssignments.userId }).from(matchAssignments).where(eq(matchAssignments.matchId, match.id))
  ]);
  return [...new Set([...members, ...participants, ...staff].map(({ userId }) => userId))];
}

export async function updateScheduledMatch(formData: FormData) {
  const matchId = formString(formData, "matchId");
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) redirect(invalidAction("比赛不存在或已被撤销"));
  const actor = await manager(match.eventId);
  if (match.bracketRound && (!match.teamAId || !match.teamBId)) redirect(matchOpsFeedback(match.eventId, "error", "该对阵仍在等待上一轮胜者，暂不能排期"));
  if (!["DRAFT", "SCHEDULED"].includes(match.status)) redirect(matchOpsFeedback(match.eventId, "error", "比赛已有结果，不能直接修改排期"));
  const roundLabel = formString(formData, "roundLabel").slice(0, 80);
  const bestOf = Number(formString(formData, "bestOf"));
  const scheduledRaw = formString(formData, "scheduledAt");
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
  if (!roundLabel) redirect(matchOpsFeedback(match.eventId, "error", "比赛名称不能为空"));
  if (![1, 3, 5].includes(bestOf)) redirect(matchOpsFeedback(match.eventId, "error", "比赛局数只能是 BO1、BO3 或 BO5"));
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) redirect(matchOpsFeedback(match.eventId, "error", "比赛时间格式无效"));
  const updated = await db.update(matches).set({ roundLabel, bestOf, scheduledAt, updatedAt: new Date() }).where(and(eq(matches.id, matchId), inArray(matches.status, ["DRAFT", "SCHEDULED"]))).returning({ id: matches.id });
  if (!updated.length) redirect(matchOpsFeedback(match.eventId, "error", "比赛状态已变化，请刷新后重试"));
  const [event, recipients] = await Promise.all([
    db.select({ slug: events.slug }).from(events).where(eq(events.id, match.eventId)).limit(1).then((rows) => rows[0]),
    matchRecipients(match)
  ]);
  if (event) await Promise.all(recipients.map((userId) => notify(userId, "比赛排期已调整", `${roundLabel}${scheduledAt ? ` · ${scheduledAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}` : " · 时间待定"}`, `/events/${event.slug}/schedule`)));
  await audit({ eventId: match.eventId, actorId: actor.id, action: "MATCH_SCHEDULE_UPDATED", entityType: "match", entityId: matchId, detail: { previousRoundLabel: match.roundLabel, roundLabel, previousScheduledAt: match.scheduledAt, scheduledAt, previousBestOf: match.bestOf, bestOf } });
  revalidatePath(`/ops/${match.eventId}/matches`);
  revalidatePath("/events");
  redirect(matchOpsFeedback(match.eventId, "success", `已更新“${roundLabel}”的排期`));
}

export async function deleteScheduledMatch(formData: FormData) {
  const matchId = formString(formData, "matchId");
  const reason = formString(formData, "reason").slice(0, 300);
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) redirect(invalidAction("比赛不存在或已被撤销"));
  const actor = await manager(match.eventId);
  if (match.bracketRound) redirect(matchOpsFeedback(match.eventId, "error", "淘汰树中的比赛不能单独撤销，以免破坏晋级关系"));
  if (!reason) redirect(matchOpsFeedback(match.eventId, "error", "撤销比赛必须填写原因"));
  if (!["DRAFT", "SCHEDULED"].includes(match.status)) redirect(matchOpsFeedback(match.eventId, "error", "比赛已有结果，不能撤销；请通过结果修订流程处理"));
  const roundCount = await db.$count(gameRounds, eq(gameRounds.matchId, matchId));
  if (roundCount > 0) redirect(matchOpsFeedback(match.eventId, "error", "该比赛已有局级数据，不能直接撤销"));
  const [event, recipients] = await Promise.all([
    db.select({ slug: events.slug }).from(events).where(eq(events.id, match.eventId)).limit(1).then((rows) => rows[0]),
    matchRecipients(match)
  ]);
  const removal = await db.transaction(async (tx) => {
    const removed = await tx.delete(matches).where(and(eq(matches.id, matchId), inArray(matches.status, ["DRAFT", "SCHEDULED"]))).returning({ id: matches.id });
    if (!removed.length) return null;
    let stageReset = false;
    if (match.stageId) {
      const [stage] = await tx.select({ type: stages.type }).from(stages).where(eq(stages.id, match.stageId)).limit(1);
      const remainingStageMatches = await tx.$count(matches, eq(matches.stageId, match.stageId));
      const nextStageStatus = stage ? stageStatusAfterLastMatchRemoved({ stageType: stage.type, remainingStageMatches }) : null;
      if (nextStageStatus) {
        await tx.update(stages).set({ status: nextStageStatus }).where(eq(stages.id, match.stageId));
        stageReset = true;
      }
    }
    const remainingEventMatches = await tx.$count(matches, eq(matches.eventId, match.eventId));
    if (remainingEventMatches === 0) {
      await tx.update(teams).set({ locked: false, updatedAt: new Date() }).where(and(eq(teams.eventId, match.eventId), eq(teams.status, "APPROVED")));
    }
    return { stageReset, rostersUnlocked: remainingEventMatches === 0 };
  });
  if (!removal) redirect(matchOpsFeedback(match.eventId, "error", "比赛状态已变化，请刷新后重试"));
  if (event) await Promise.all(recipients.map((userId) => notify(userId, "比赛已撤销", `${match.roundLabel}：${reason}`, `/events/${event.slug}/schedule`)));
  await audit({ eventId: match.eventId, actorId: actor.id, action: "MATCH_SCHEDULE_CANCELLED", entityType: "match", entityId: matchId, detail: { reason, roundLabel: match.roundLabel, ...removal } });
  revalidatePath(`/ops/${match.eventId}/matches`);
  revalidatePath(`/ops/${match.eventId}/workflow`);
  revalidatePath(`/ops/${match.eventId}/teams`);
  revalidatePath("/events");
  redirect(matchOpsFeedback(match.eventId, "success", `已撤销“${match.roundLabel}”`));
}

function parseBp(raw: string) {
  return raw.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean).map((item, index) => {
    const [scopeRaw, actionRaw, ...target] = item.split(/[:：|]/).map((part) => part.trim());
    const normalizedScope = scopeRaw?.toUpperCase();
    const normalizedAction = actionRaw?.toUpperCase();
    const targetKey = target.join(":");
    if (!["MAP", "FACTION", "CHARACTER"].includes(normalizedScope) || !["BAN", "PICK"].includes(normalizedAction) || !targetKey) throw new Error("BP 数据格式不正确");
    return { scope: normalizedScope as "MAP" | "FACTION" | "CHARACTER", action: normalizedAction as "BAN" | "PICK", targetKey, orderIndex: index + 1 };
  });
}

function parseLineup(raw: string) {
  return raw.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean).map((item) => {
    const [username, ...character] = item.split(/[=＝]/).map((part) => part.trim());
    if (!username || !character.length) throw new Error("出场阵容格式应为：用户名=角色名");
    const characterKey = character.join("=");
    if (!characterKey) throw new Error("出场阵容格式应为：用户名=角色名");
    return { username: username.toLowerCase(), characterKey };
  });
}

export async function saveMatchResult(_state: OpsState, formData: FormData): Promise<OpsState> {
  const matchId = formString(formData, "matchId");
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { error: "比赛不存在或已被撤销" };
  const usesTeams = Boolean(match.teamAId && match.teamBId);
  if (Boolean(match.teamAId) !== Boolean(match.teamBId)) return { error: "比赛双方配置不完整，请返回赛程重新设置" };
  const teamAId = match.teamAId;
  const teamBId = match.teamBId;
  const actor = await manager(match.eventId);
  let roundPayloads: Array<{ index: number; mapKey: string; firstSurvivor: "A" | "B"; escapes1: number; escapes2: number; bp1: ReturnType<typeof parseBp>; bp2: ReturnType<typeof parseBp>; survivor1: ReturnType<typeof parseLineup>; hunter1: ReturnType<typeof parseLineup>; survivor2: ReturnType<typeof parseLineup>; hunter2: ReturnType<typeof parseLineup> }>;
  try {
    roundPayloads = Array.from({ length: match.bestOf }, (_, offset) => {
      const index = offset + 1;
      const mapKey = formString(formData, `map_${index}`);
      if (!mapKey) return null;
      const firstSurvivor = formString(formData, `first_survivor_${index}`) === "B" ? "B" : "A";
      const escapes1 = Number(formString(formData, `escapes_1_${index}`));
      const escapes2 = Number(formString(formData, `escapes_2_${index}`));
      if (![0,1,2,3,4].includes(escapes1) || ![0,1,2,3,4].includes(escapes2)) throw new Error("逃脱人数必须是 0–4");
      return { index, mapKey: mapKey.slice(0, 120), firstSurvivor, escapes1, escapes2, bp1: parseBp(formString(formData, `bp_1_${index}`).slice(0, 3000)), bp2: parseBp(formString(formData, `bp_2_${index}`).slice(0, 3000)), survivor1: parseLineup(formString(formData, `survivor_lineup_1_${index}`).slice(0, 3000)), hunter1: parseLineup(formString(formData, `hunter_lineup_1_${index}`).slice(0, 1000)), survivor2: parseLineup(formString(formData, `survivor_lineup_2_${index}`).slice(0, 3000)), hunter2: parseLineup(formString(formData, `hunter_lineup_2_${index}`).slice(0, 1000)) };
    }).filter(Boolean) as typeof roundPayloads;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { error: ["逃脱人数必须是 0–4", "出场阵容格式应为：用户名=角色名", "BP 数据格式不正确"].includes(message) ? message : "比赛数据格式不正确" };
  }
  if (!roundPayloads.length) return { error: "至少填写一局结果" };
  if (roundPayloads.some((round, offset) => round.index !== offset + 1)) return { error: "比赛对局必须从第一局开始连续录入，不能跳过中间对局" };
  if (roundPayloads.some((round) => round.survivor1.length !== 4 || round.survivor2.length !== 4 || round.hunter1.length !== 1 || round.hunter2.length !== 1)) return { error: "每个半场需填写 4 名求生者和 1 名监管者出场" };
  const [currentRoster, catalogMaps, catalogCharacters] = await Promise.all([
    usesTeams
      ? db.select({ userId: users.id, username: users.username, teamId: teamMembers.teamId, side: sql<"A" | "B">`case when ${teamMembers.teamId} = ${teamAId} then 'A' else 'B' end` }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(inArray(teamMembers.teamId, [teamAId!, teamBId!]))
      : db.select({ userId: users.id, username: users.username, teamId: sql<string | null>`null`, side: matchParticipants.side }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).where(eq(matchParticipants.matchId, matchId)),
    db.select({ key: gameMaps.key, name: gameMaps.name }).from(gameMaps),
    db.select({ key: gameCharacters.key, name: gameCharacters.name, faction: gameCharacters.faction }).from(gameCharacters)
  ]);
  const mapKeys = new Set(catalogMaps.flatMap((item) => [item.key, item.name]));
  const characterByKey = new Map(catalogCharacters.flatMap((item) => [[item.key, item] as const, [item.name, item] as const]));
  const factionTargets = new Set(["SURVIVOR", "HUNTER", "求生者", "监管者"]);
  for (const round of roundPayloads) {
    if (!mapKeys.has(round.mapKey)) return { error: `第 ${round.index} 局选择了不存在的地图` };
    for (const [entries, faction, label] of [
      [round.survivor1, "SURVIVOR", "上半场求生者"], [round.hunter1, "HUNTER", "上半场监管者"],
      [round.survivor2, "SURVIVOR", "下半场求生者"], [round.hunter2, "HUNTER", "下半场监管者"]
    ] as const) {
      if (new Set(entries.map((entry) => entry.username)).size !== entries.length) return { error: `第 ${round.index} 局${label}阵容存在重复选手` };
      if (entries.some((entry) => characterByKey.get(entry.characterKey)?.faction !== faction)) return { error: `第 ${round.index} 局${label}选择了不存在或阵营不符的角色` };
    }
    for (const entry of [...round.bp1, ...round.bp2]) {
      const validTarget = entry.scope === "MAP" ? mapKeys.has(entry.targetKey) : entry.scope === "CHARACTER" ? characterByKey.has(entry.targetKey) : factionTargets.has(entry.targetKey);
      if (!validTarget) return { error: `第 ${round.index} 局 BP 包含不存在或类型不符的目标` };
    }
  }
  const roundWinners = roundPayloads.map((round) => scoreRoundBySide(round.firstSurvivor, round.escapes1, round.escapes2).winnerSide);
  const seriesError = seriesCompletionError(match.bestOf, roundWinners);
  if (seriesError) return { error: seriesError };
  const historicalRoster = await db.select({ userId: users.id, username: users.username, teamId: appearances.teamId, side: appearances.side })
    .from(appearances)
    .innerJoin(users, eq(users.id, appearances.userId))
    .innerJoin(halfResults, eq(halfResults.id, appearances.halfId))
    .innerJoin(gameRounds, eq(gameRounds.id, halfResults.roundId))
    .where(eq(gameRounds.matchId, matchId));
  const roster = [...currentRoster];
  for (const member of historicalRoster) {
    if (roster.some((item) => item.userId === member.userId)) continue;
    const side = member.side ?? (member.teamId === teamBId ? "B" as const : "A" as const);
    roster.push({ ...member, side });
  }
  if (!usesTeams && (!roster.some((member) => member.side === "A") || !roster.some((member) => member.side === "B"))) return { error: "个人比赛双方尚未完成选手分配" };
  const rosterByUsername = new Map(roster.map((member) => [member.username.toLowerCase(), member]));
  const manualReason = formString(formData, "manualReason").slice(0, 1000);
  const requestedManualWinner = formString(formData, "manualWinnerSide");
  const manualWinner = requestedManualWinner === "A" || requestedManualWinner === "B" ? requestedManualWinner : null;
  let downstreamRecipientIds: string[] = [];
  let revisedDownstreamMatchId: string | null = null;
  if (match.status === "PUBLISHED" && match.stageId && match.bracketRound) {
    const [next] = await db.select().from(matches).where(and(
      eq(matches.stageId, match.stageId),
      eq(matches.bracketRound, match.bracketRound + 1),
      eq(matches.bracketIndex, Math.floor(match.bracketIndex / 2))
    )).limit(1);
    if (next) downstreamRecipientIds = await matchRecipients(next);
  }
  let winsA = 0, winsB = 0, totalA = 0, totalB = 0;
  try { await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${match.eventId}`}))`);
    const [currentEvent] = await tx.select({ status: events.status }).from(events).where(eq(events.id, match.eventId)).limit(1);
    if (!currentEvent || ["COMPLETED", "ARCHIVED"].includes(currentEvent.status)) throw new Error("赛事已结束或归档，不能修改比赛结果");
    await tx.execute(sql`select ${matches.id} from ${matches} where ${matches.id} = ${matchId} for update`);
    const [currentMatch] = await tx.select({ status: matches.status }).from(matches).where(eq(matches.id, matchId)).limit(1);
    if (!currentMatch || currentMatch.status !== match.status) throw new Error("比赛状态已由其他管理员更新，请刷新后重试");
    if (match.status === "PUBLISHED" && match.stageId) {
      await tx.update(stages).set({ status: "ACTIVE" }).where(and(eq(stages.id, match.stageId), eq(stages.status, "COMPLETED")));
      if (match.bracketRound) {
        const [next] = await tx.select().from(matches).where(and(
          eq(matches.stageId, match.stageId),
          eq(matches.bracketRound, match.bracketRound + 1),
          eq(matches.bracketIndex, Math.floor(match.bracketIndex / 2))
        )).limit(1);
        if (next) {
          await tx.execute(sql`select ${matches.id} from ${matches} where ${matches.id} = ${next.id} for update`);
          const [currentDownstream] = await tx.select().from(matches).where(eq(matches.id, next.id)).limit(1);
          if (!currentDownstream) throw new Error("下一轮比赛已被撤销，请刷新赛程后重试");
          const downstreamRoundCount = await tx.$count(gameRounds, eq(gameRounds.matchId, next.id));
          const revisionError = publishedResultRevisionError({ sourceStatus: match.status, downstreamStatus: currentDownstream.status, downstreamRoundCount });
          if (revisionError) throw new Error(revisionError);
          const winnerGoesToA = match.bracketIndex % 2 === 0;
          await tx.update(matches).set({
            teamAId: winnerGoesToA ? null : currentDownstream.teamAId,
            teamBId: winnerGoesToA ? currentDownstream.teamBId : null,
            status: "DRAFT",
            updatedAt: new Date()
          }).where(eq(matches.id, next.id));
          revisedDownstreamMatchId = next.id;
        }
      }
    }
    await tx.delete(gameRounds).where(eq(gameRounds.matchId, matchId));
    for (const round of roundPayloads) {
      const first = pointsForEscapes(round.escapes1);
      const second = pointsForEscapes(round.escapes2);
      const { scoreA, scoreB, winnerSide } = scoreRoundBySide(round.firstSurvivor, round.escapes1, round.escapes2);
      totalA += scoreA; totalB += scoreB;
      if (scoreA > scoreB) winsA++; else if (scoreB > scoreA) winsB++;
      const [game] = await tx.insert(gameRounds).values({ matchId, roundIndex: round.index, mapKey: round.mapKey, scoreA, scoreB, winnerTeamId: usesTeams ? winnerSide === "A" ? teamAId : winnerSide === "B" ? teamBId : null : null, winnerSide }).returning();
      const firstSurvivorSide = round.firstSurvivor;
      const firstHunterSide = round.firstSurvivor === "A" ? "B" as const : "A" as const;
      const firstSurvivorId = usesTeams ? firstSurvivorSide === "A" ? teamAId : teamBId : null;
      const firstHunterId = usesTeams ? firstHunterSide === "A" ? teamAId : teamBId : null;
      const insertedHalves = await tx.insert(halfResults).values([
        { roundId: game.id, halfIndex: 1, survivorTeamId: firstSurvivorId, hunterTeamId: firstHunterId, survivorSide: firstSurvivorSide, hunterSide: firstHunterSide, escapes: round.escapes1, survivorPoints: first.survivor, hunterPoints: first.hunter },
        { roundId: game.id, halfIndex: 2, survivorTeamId: firstHunterId, hunterTeamId: firstSurvivorId, survivorSide: firstHunterSide, hunterSide: firstSurvivorSide, escapes: round.escapes2, survivorPoints: second.survivor, hunterPoints: second.hunter }
      ]).returning();
      const lineupGroups = [
        { halfId: insertedHalves[0].id, teamId: firstSurvivorId, side: firstSurvivorSide, faction: "SURVIVOR" as const, entries: round.survivor1 },
        { halfId: insertedHalves[0].id, teamId: firstHunterId, side: firstHunterSide, faction: "HUNTER" as const, entries: round.hunter1 },
        { halfId: insertedHalves[1].id, teamId: firstHunterId, side: firstHunterSide, faction: "SURVIVOR" as const, entries: round.survivor2 },
        { halfId: insertedHalves[1].id, teamId: firstSurvivorId, side: firstSurvivorSide, faction: "HUNTER" as const, entries: round.hunter2 }
      ];
      for (const group of lineupGroups) {
        const values = group.entries.map((entry) => {
          const member = rosterByUsername.get(entry.username);
          if (!member || member.side !== group.side) throw new Error(`出场用户 ${entry.username} 不属于对应参赛方`);
          return { halfId: group.halfId, teamId: group.teamId, side: group.side, userId: member.userId, faction: group.faction, characterKey: entry.characterKey };
        });
        await tx.insert(appearances).values(values);
      }
      const entries = [...round.bp1.map((entry) => ({ ...entry, roundId: game.id, halfIndex: 1 })), ...round.bp2.map((entry) => ({ ...entry, roundId: game.id, halfIndex: 2, orderIndex: entry.orderIndex }))];
      if (entries.length) await tx.insert(bpEntries).values(entries);
    }
    const automaticWinner = winnerSideFromScores(winsA, winsB);
    const winnerSide = automaticWinner ?? manualWinner;
    if (!automaticWinner && (!winnerSide || !manualReason)) throw new Error("双方局胜数相同，请选择人工裁定胜方并填写公开说明");
    await tx.update(matches).set({ scoreA: winsA, scoreB: winsB, winnerTeamId: usesTeams ? winnerSide === "A" ? teamAId : winnerSide === "B" ? teamBId : null : null, winnerSide, manualReason: manualReason || null, status: "RESULT_DRAFT", publishedAt: null, updatedAt: new Date() }).where(eq(matches.id, matchId));
  }); } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeMessage = [
      "比赛状态已由其他管理员更新，请刷新后重试",
      "赛事已结束或归档，不能修改比赛结果",
      "下一轮比赛已被撤销，请刷新赛程后重试",
      "双方局胜数相同，请选择人工裁定胜方并填写公开说明"
    ].includes(message) || message.startsWith("出场用户 ") ? message : "结果保存失败，请检查出场名单与角色";
    return { error: safeMessage };
  }
  await audit({ eventId: match.eventId, actorId: actor.id, action: match.status === "PUBLISHED" ? "MATCH_RESULT_REVISION_SAVED" : "MATCH_RESULT_SAVED", entityType: "match", entityId: matchId, detail: { winsA, winsB, totalA, totalB, previousStatus: match.status } });
  if (revisedDownstreamMatchId) {
    await Promise.all(downstreamRecipientIds.map((userId) => notify(userId, "上一轮结果正在修订", "下一轮对阵暂待重新确认，请留意后续赛程通知。", "/me/notifications")));
  }
  revalidatePath(`/ops/${match.eventId}/matches/${matchId}`);
  revalidatePath(`/ops/${match.eventId}/matches`);
  revalidatePath(`/ops/${match.eventId}/workflow`);
  if (match.status === "PUBLISHED") {
    const [event] = await db.select({ slug: events.slug }).from(events).where(eq(events.id, match.eventId)).limit(1);
    revalidatePath(`/matches/${matchId}`);
    if (event) {
      revalidatePath(`/events/${event.slug}`);
      revalidatePath(`/events/${event.slug}/schedule`);
      revalidatePath(`/events/${event.slug}/standings`);
    }
  }
  return { success: "比赛结果已保存为草稿" };
}

export async function discardMatchResultDraft(formData: FormData) {
  const matchId = formString(formData, "matchId");
  const reason = formString(formData, "reason").slice(0, 300);
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) redirect(invalidAction("比赛不存在或已被撤销"));
  const actor = await manager(match.eventId);
  const detailPath = (type: "error" | "success", message: string) => `/ops/${match.eventId}/matches/${matchId}?${new URLSearchParams({ [type]: message }).toString()}`;
  if (!canDiscardResultDraft(match.status)) redirect(detailPath("error", "只有尚未发布的结果草稿可以放弃"));
  if (!reason) redirect(detailPath("error", "放弃结果草稿必须填写原因"));
  const [event, recipients] = await Promise.all([
    db.select({ slug: events.slug }).from(events).where(eq(events.id, match.eventId)).limit(1).then((rows) => rows[0]),
    matchRecipients(match)
  ]);
  const discarded = await db.transaction(async (tx) => {
    await tx.execute(sql`select ${matches.id} from ${matches} where ${matches.id} = ${matchId} for update`);
    const changed = await tx.update(matches).set({
      status: "SCHEDULED", scoreA: 0, scoreB: 0, winnerTeamId: null, winnerSide: null,
      manualReason: null, publishedAt: null, updatedAt: new Date()
    }).where(and(eq(matches.id, matchId), eq(matches.status, "RESULT_DRAFT"))).returning({ id: matches.id });
    if (!changed.length) return false;
    await tx.delete(gameRounds).where(eq(gameRounds.matchId, matchId));
    await tx.insert(auditLogs).values({ eventId: match.eventId, actorId: actor.id, action: "MATCH_RESULT_DRAFT_DISCARDED", entityType: "match", entityId: matchId, detail: { reason } });
    return true;
  });
  if (!discarded) redirect(detailPath("error", "结果状态已变化，请刷新后重试"));
  await Promise.all(recipients.map((userId) => notify(userId, "比赛结果草稿已撤销", `${match.roundLabel}：${reason}`, event ? `/events/${event.slug}/schedule` : "/me/notifications")));
  revalidatePath(`/ops/${match.eventId}/matches/${matchId}`);
  revalidatePath(`/ops/${match.eventId}/matches`);
  revalidatePath(`/ops/${match.eventId}/workflow`);
  if (event) {
    revalidatePath(`/events/${event.slug}`);
    revalidatePath(`/events/${event.slug}/schedule`);
    revalidatePath(`/events/${event.slug}/standings`);
  }
  redirect(detailPath("success", "结果草稿已放弃，比赛已恢复为待录入状态"));
}

export async function publishMatchResult(formData: FormData) {
  const matchId = formString(formData, "matchId");
  let [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) redirect(invalidAction("比赛不存在或已被撤销"));
  const actor = await manager(match.eventId);
  const detailPath = (type: "error" | "success", message: string) => `/ops/${match.eventId}/matches/${matchId}?${new URLSearchParams({ [type]: message }).toString()}`;
  if (match.status !== "RESULT_DRAFT") redirect(detailPath("error", "只有结果草稿可以发布"));
  let advancedMatchId: string | null = null;
  let completedStage = false;
  try {
    const outcome = await db.transaction(async (tx) => {
      // Serialize result changes with event status changes and other publications.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${match.eventId}`}))`);
      const [currentEvent] = await tx.select({ status: events.status }).from(events).where(eq(events.id, match.eventId)).limit(1);
      if (!currentEvent || ["COMPLETED", "ARCHIVED"].includes(currentEvent.status)) throw new Error("赛事已结束或归档，不能发布比赛结果");
      const [currentMatch] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
      if (!currentMatch || currentMatch.status !== "RESULT_DRAFT") throw new Error("结果状态已变化，请刷新后重试");
      match = currentMatch;
      const isParticipant = await tx.$count(matchParticipants, and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, actor.id))) > 0;
      const teamIds = [match.teamAId, match.teamBId].filter((id): id is string => Boolean(id));
      const isTeamMember = teamIds.length > 0 && await tx.$count(teamMembers, and(eq(teamMembers.eventId, match.eventId), eq(teamMembers.userId, actor.id), inArray(teamMembers.teamId, teamIds))) > 0;
      if (isParticipant || isTeamMember) throw new Error("参与本场比赛的赛事管理员不能发布结果");
      if (match.scoreA === match.scoreB && (!match.winnerSide || !match.manualReason)) throw new Error("同分时必须选择人工裁定胜方并填写公开说明");
      if (match.scoreA !== match.scoreB && !match.winnerSide) throw new Error("比赛胜方数据不完整，请重新保存结果草稿");
      if (match.bracketRound && !match.winnerTeamId) throw new Error("淘汰赛必须确定获胜战队后才能推进");
      const published = await tx.update(matches).set({ status: "PUBLISHED", publishedAt: new Date(), updatedAt: new Date() }).where(and(eq(matches.id, matchId), eq(matches.status, "RESULT_DRAFT"))).returning({ id: matches.id });
      if (!published.length) throw new Error("结果状态已变化，请刷新后重试");
      if (!match.stageId) return { nextMatchId: null, completed: false };
      const [stage] = await tx.select().from(stages).where(eq(stages.id, match.stageId)).limit(1);
      if (!stage) return { nextMatchId: null, completed: false };
      if (stage.type === "SINGLE_ELIMINATION" && match.bracketRound && match.winnerTeamId) {
        const [next] = await tx.select().from(matches).where(and(eq(matches.stageId, stage.id), eq(matches.bracketRound, match.bracketRound + 1), eq(matches.bracketIndex, Math.floor(match.bracketIndex / 2)))).limit(1).for("update");
        if (!next) {
          await tx.update(stages).set({ status: "COMPLETED" }).where(eq(stages.id, stage.id));
          return { nextMatchId: null, completed: true };
        }
        const winnerGoesToA = match.bracketIndex % 2 === 0;
        const occupied = winnerGoesToA ? next.teamAId : next.teamBId;
        if (occupied && occupied !== match.winnerTeamId) throw new Error("下一轮对阵已被其他结果占用，请联系全局管理员核查淘汰树");
        const teamAId = winnerGoesToA ? match.winnerTeamId : next.teamAId;
        const teamBId = winnerGoesToA ? next.teamBId : match.winnerTeamId;
        await tx.update(matches).set({ teamAId, teamBId, status: teamAId && teamBId ? "SCHEDULED" : "DRAFT", updatedAt: new Date() }).where(eq(matches.id, next.id));
        return { nextMatchId: next.id, completed: false };
      }
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(matches).where(and(eq(matches.stageId, stage.id), ne(matches.status, "PUBLISHED")));
      if (count === 0) await tx.update(stages).set({ status: "COMPLETED" }).where(eq(stages.id, stage.id));
      return { nextMatchId: null, completed: count === 0 };
    });
    advancedMatchId = outcome.nextMatchId;
    completedStage = outcome.completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeMessage = [
      "结果状态已变化，请刷新后重试",
      "赛事已结束或归档，不能发布比赛结果",
      "参与本场比赛的赛事管理员不能发布结果",
      "同分时必须选择人工裁定胜方并填写公开说明",
      "比赛胜方数据不完整，请重新保存结果草稿",
      "淘汰赛必须确定获胜战队后才能推进",
      "下一轮对阵已被其他结果占用，请联系全局管理员核查淘汰树"
    ].includes(message) ? message : "发布结果失败，请刷新后重试";
    redirect(detailPath("error", safeMessage));
  }
  const [event, recipients] = await Promise.all([
    db.select({ name: events.name, slug: events.slug }).from(events).where(eq(events.id, match.eventId)).limit(1).then((rows) => rows[0]),
    matchRecipients(match)
  ]);
  if (event) await Promise.all(recipients.map((userId) => notify(userId, "比赛结果已发布", `${event.name} · ${match.roundLabel} · ${match.scoreA}:${match.scoreB}`, `/matches/${matchId}`)));
  if (advancedMatchId && event) {
    const [nextMatch] = await db.select().from(matches).where(eq(matches.id, advancedMatchId)).limit(1);
    if (nextMatch?.teamAId && nextMatch.teamBId) {
      const nextRecipients = await matchRecipients(nextMatch);
      await Promise.all(nextRecipients.map((userId) => notify(userId, "下一轮对阵已确定", `${event.name} · ${nextMatch.roundLabel}`, `/events/${event.slug}/schedule`)));
    }
  }
  await audit({ eventId: match.eventId, actorId: actor.id, action: "MATCH_RESULT_PUBLISHED", entityType: "match", entityId: matchId, detail: { advancedMatchId, completedStage } });
  revalidatePath(`/ops/${match.eventId}/matches/${matchId}`);
  revalidatePath(`/ops/${match.eventId}/matches`);
  revalidatePath(`/ops/${match.eventId}/workflow`);
  revalidatePath(`/matches/${matchId}`);
  if (event) {
    revalidatePath(`/events/${event.slug}`);
    revalidatePath(`/events/${event.slug}/schedule`);
    revalidatePath(`/events/${event.slug}/standings`);
  }
  redirect(detailPath("success", "比赛结果已发布到公开档案"));
}

function adminUserFeedbackPath(userId: string, type: "error" | "success", message: string) {
  return `/admin/users/${userId}?${new URLSearchParams({ [type]: message }).toString()}`;
}

export async function updateUserProfileByAdmin(formData: FormData) {
  const actor = await requireAdmin();
  const userId = formString(formData, "userId");
  const usernameResult = usernameSchema.safeParse(formString(formData, "username"));
  const username = usernameResult.success ? usernameResult.data.toLowerCase() : "";
  const displayName = formString(formData, "displayName");
  const gameNickname = formString(formData, "gameNickname");
  const gameUid = formString(formData, "gameUid");
  const survivorRank = formString(formData, "survivorRank");
  const hunterRank = formString(formData, "hunterRank");
  const usernameChangeReason = formString(formData, "usernameChangeReason").slice(0, 300);
  if (!usernameResult.success) redirect(adminUserFeedbackPath(userId, "error", usernameResult.error.issues[0].message));
  if (displayName.length < 2 || displayName.length > 32 || gameNickname.length > 32) {
    redirect(adminUserFeedbackPath(userId, "error", "用户昵称应为 2–32 字，游戏昵称不能超过 32 字"));
  }
  if (gameUid && !/^\d{5,20}$/.test(gameUid)) redirect(adminUserFeedbackPath(userId, "error", "游戏 UID 留空或填写 5–20 位数字"));
  if ((survivorRank && !isValidRank("SURVIVOR", survivorRank)) || (hunterRank && !isValidRank("HUNTER", hunterRank))) {
    redirect(adminUserFeedbackPath(userId, "error", "段位留空或选择有效段位"));
  }
  const [target] = await db.select({ id: users.id, username: users.username, gameNickname: users.gameNickname }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) redirect("/admin/users?error=" + encodeURIComponent("账号不存在"));
  const usernameChanged = username !== target.username;
  if (usernameChanged && actor.id === userId) redirect(adminUserFeedbackPath(userId, "error", "不能在当前管理员会话中修改自己的登录用户名"));
  if (usernameChanged && !usernameChangeReason) redirect(adminUserFeedbackPath(userId, "error", "修改登录用户名必须填写原因"));
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${userId}`}))`);
      const updated = await tx.update(users).set({ username, displayName, gameNickname, gameUid: gameUid || null, survivorRank, hunterRank, updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.username, target.username))).returning({ id: users.id });
      if (!updated.length) throw new Error("账号资料已变化，请刷新后重试");
      if (gameNickname !== target.gameNickname) await tx.update(teamMembers).set({ gameNickname }).where(eq(teamMembers.userId, userId));
      if (usernameChanged) await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "USER_PROFILE_CORRECTED", entityType: "user", entityId: userId, detail: { previousUsername: target.username, username, usernameChangeReason: usernameChanged ? usernameChangeReason : null, displayName, gameUid, survivorRank, hunterRank } });
    });
  } catch (error) {
    const message = error instanceof Error && (error.message.includes("users_username_unique") || error.message.includes("duplicate key"))
      ? "该登录用户名已被使用"
      : error instanceof Error && error.message === "账号资料已变化，请刷新后重试"
        ? error.message
        : "账号资料更新失败，请刷新后重试";
    redirect(adminUserFeedbackPath(userId, "error", message));
  }
  if (actor.id !== userId) await notify(userId, usernameChanged ? "登录用户名已由管理员修改" : "账号资料已由管理员修正", usernameChanged ? `新的登录用户名为 @${username}，原登录会话已注销。` : "如内容与实际情况不符，请在个人资料中重新更新。", usernameChanged ? "/login" : "/me/profile");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/events");
  redirect(adminUserFeedbackPath(userId, "success", usernameChanged ? "账号资料与登录用户名已更新，原会话已注销" : "账号与竞技资料已更新"));
}

export async function setUserDisabled(formData: FormData) {
  const actor = await requireAdmin();
  const userId = formString(formData, "userId");
  const decision = formString(formData, "decision");
  const reason = formString(formData, "reason").slice(0, 300);
  const nextDisabled = decision === "disable";
  if (!["disable", "enable"].includes(decision)) redirect(adminUserFeedbackPath(userId, "error", "账号状态操作无效"));
  if (nextDisabled && !reason) redirect(adminUserFeedbackPath(userId, "error", "停用账号时必须填写原因"));
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('active-admin-policy'))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${userId}`}))`);
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { error: "账号不存在" };
    if (target.disabled === nextDisabled) return { error: nextDisabled ? "该账号已经停用" : "该账号已经恢复" };
    const activeAdminCount = await tx.$count(users, and(eq(users.role, "ADMIN"), eq(users.disabled, false)));
    const policyError = accountMutationError({ actorId: actor.id, targetId: target.id, targetRole: target.role, targetDisabled: target.disabled, nextDisabled, activeAdminCount });
    if (policyError) return { error: policyError };
    if (nextDisabled) {
      const [[assignment], [participant], [membership]] = await Promise.all([
        tx.select({ count: sql<number>`count(*)::int` }).from(matchAssignments).innerJoin(matches, eq(matches.id, matchAssignments.matchId)).where(and(eq(matchAssignments.userId, userId), inArray(matches.status, ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT"]))),
        tx.select({ count: sql<number>`count(*)::int` }).from(matchParticipants).innerJoin(matches, eq(matches.id, matchParticipants.matchId)).where(and(eq(matchParticipants.userId, userId), inArray(matches.status, ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT"]))),
        tx.select({ count: sql<number>`count(*)::int` }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).innerJoin(events, eq(events.id, teamMembers.eventId)).where(and(eq(teamMembers.userId, userId), inArray(events.status, ["DRAFT", "REGISTRATION", "ACTIVE"]), inArray(teams.status, ["PENDING", "APPROVED"])))
      ]);
      const suspensionError = accountSuspensionError({ unfinishedAssignmentCount: assignment.count, unfinishedParticipantCount: participant.count, activeMembershipCount: membership.count });
      if (suspensionError) return { error: suspensionError };
    }
    const changed = await tx.update(users).set({ disabled: nextDisabled, updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.disabled, target.disabled))).returning({ id: users.id });
    if (!changed.length) return { error: "账号状态已变化，请刷新后重试" };
    if (nextDisabled) await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.insert(auditLogs).values({ actorId: actor.id, action: nextDisabled ? "USER_DISABLED" : "USER_ENABLED", entityType: "user", entityId: userId, detail: { reason } });
    return { target };
  });
  const error = "error" in result ? result.error : null;
  if (error) redirect(adminUserFeedbackPath(userId, "error", error));
  if (!nextDisabled) await notify(userId, "账号已恢复", "全局管理员已恢复你的账号访问权限。", "/me");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  redirect(adminUserFeedbackPath(userId, "success", nextDisabled ? "账号已停用，所有会话已失效" : "账号已恢复，可正常登录"));
}

export async function setUserGlobalRole(formData: FormData) {
  const actor = await requireAdmin();
  const userId = formString(formData, "userId");
  const nextRole = formString(formData, "role") as "USER" | "ADMIN";
  const reason = formString(formData, "reason").slice(0, 300);
  if (!["USER", "ADMIN"].includes(nextRole)) redirect(adminUserFeedbackPath(userId, "error", "全局身份设置无效"));
  if (nextRole === "USER" && !reason) redirect(adminUserFeedbackPath(userId, "error", "移除管理员权限时必须填写原因"));
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('active-admin-policy'))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${userId}`}))`);
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { error: "账号不存在" };
    if (target.role === nextRole) return { error: "该账号已经拥有此全局身份" };
    const activeAdminCount = await tx.$count(users, and(eq(users.role, "ADMIN"), eq(users.disabled, false)));
    const policyError = accountMutationError({ actorId: actor.id, targetId: target.id, targetRole: target.role, targetDisabled: target.disabled, nextRole, activeAdminCount });
    if (policyError) return { error: policyError };
    const changed = await tx.update(users).set({ role: nextRole, updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.role, target.role))).returning({ id: users.id });
    if (!changed.length) return { error: "管理员权限已变化，请刷新后重试" };
    if (nextRole === "USER") await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.insert(auditLogs).values({ actorId: actor.id, action: "USER_GLOBAL_ROLE_CHANGED", entityType: "user", entityId: userId, detail: { from: target.role, to: nextRole, reason } });
    return { target };
  });
  const error = "error" in result ? result.error : null;
  if (error) redirect(adminUserFeedbackPath(userId, "error", error));
  await notify(userId, nextRole === "ADMIN" ? "你已成为全局管理员" : "全局管理员权限已移除", nextRole === "ADMIN" ? "你现在可以进入全局管理中枢。" : "你的赛事身份与普通账号资料不受影响。", "/me");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  redirect(adminUserFeedbackPath(userId, "success", nextRole === "ADMIN" ? "已授予全局管理员权限" : "已移除全局管理员权限并注销其会话"));
}

export async function revokeUserSessions(formData: FormData) {
  const actor = await requireAdmin();
  const userId = formString(formData, "userId");
  if (actor.id === userId) redirect(adminUserFeedbackPath(userId, "error", "请使用退出登录管理自己的当前会话"));
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) redirect("/admin/users?error=" + encodeURIComponent("账号不存在"));
  const removed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${userId}`}))`);
    return tx.delete(sessions).where(eq(sessions.userId, userId)).returning({ tokenHash: sessions.tokenHash });
  });
  await audit({ actorId: actor.id, action: "USER_SESSIONS_REVOKED", entityType: "user", entityId: userId, detail: { count: removed.length } });
  revalidatePath(`/admin/users/${userId}`);
  redirect(adminUserFeedbackPath(userId, "success", removed.length ? `已注销 ${removed.length} 个登录会话` : "该账号当前没有有效会话"));
}

export async function resetUserPassword(formData: FormData) {
  const actor = await requireAdmin();
  const userId = formString(formData, "userId");
  if (actor.id === userId) redirect(adminUserFeedbackPath(userId, "error", "请在账号安全页修改自己的密码，不能为当前账号设置临时密码"));
  const nextPassword = formRawString(formData, "newPassword");
  const parsedPassword = passwordSchema.safeParse(nextPassword);
  if (!parsedPassword.success) redirect(adminUserFeedbackPath(userId, "error", parsedPassword.error.issues[0].message));
  if (nextPassword !== formRawString(formData, "confirmPassword")) redirect(adminUserFeedbackPath(userId, "error", "两次输入的临时密码不一致"));
  const [target] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) redirect("/admin/users?error=" + encodeURIComponent("账号不存在"));
  if (await argon2.verify(target.passwordHash, nextPassword).catch(() => false)) redirect(adminUserFeedbackPath(userId, "error", "临时密码不能与账号当前密码相同"));
  const nextPasswordHash = await argon2.hash(nextPassword, { type: argon2.argon2id });
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${userId}`}))`);
      const [currentTarget] = await tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
      if (!currentTarget) throw new Error("账号不存在");
      if (await argon2.verify(currentTarget.passwordHash, nextPassword).catch(() => false)) throw new Error("临时密码不能与账号当前密码相同");
      await tx.update(users).set({ passwordHash: nextPasswordHash, mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.insert(notifications).values({ userId, title: "账号密码已由管理员重置", body: "请使用管理员提供的临时密码登录，并立即设置新密码。", href: "/me/security" });
    });
  } catch (error) {
    const message = error instanceof Error && ["账号不存在", "临时密码不能与账号当前密码相同"].includes(error.message)
      ? error.message
      : "密码重置失败，请刷新后重试";
    redirect(adminUserFeedbackPath(userId, "error", message));
  }
  await audit({ actorId: actor.id, action: "USER_PASSWORD_RESET", entityType: "user", entityId: userId });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  redirect(adminUserFeedbackPath(userId, "success", "临时密码已设置，原会话已注销；用户下次登录后必须改密"));
}

export async function revokeUserEventRole(formData: FormData) {
  const actor = await requireAdmin();
  const userId = formString(formData, "userId");
  const eventId = formString(formData, "eventId");
  const role = formString(formData, "role") as RevocableEventRole;
  const reason = formString(formData, "reason").slice(0, 300);
  if (!reason) redirect(adminUserFeedbackPath(userId, "error", "撤销赛事身份必须填写原因"));
  if (!["PLAYER", "COMMENTATOR", "REFEREE", "EVENT_MANAGER"].includes(role)) redirect(adminUserFeedbackPath(userId, "error", "赛事身份无效"));
  const [grant] = await db.select({ eventName: events.name, eventSlug: events.slug, eventStatus: events.status, displayName: users.displayName })
    .from(eventRoleGrants)
    .innerJoin(events, eq(events.id, eventRoleGrants.eventId))
    .innerJoin(users, eq(users.id, eventRoleGrants.userId))
    .where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.userId, userId), eq(eventRoleGrants.role, role)))
    .limit(1);
  if (!grant) redirect(adminUserFeedbackPath(userId, "error", "该赛事身份已被撤销或不存在"));

  const removed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${eventId}:${userId}:${role}`}))`);
    const [currentGrant] = await tx.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.userId, userId), eq(eventRoleGrants.role, role))).limit(1);
    if (!currentGrant) return "赛事身份状态已变化，请刷新后重试";
    let membershipCount = 0;
    let participantCount = 0;
    let unfinishedAssignmentCount = 0;
    if (role === "PLAYER") {
      if (["DRAFT", "REGISTRATION", "ACTIVE"].includes(grant.eventStatus)) {
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(teamMembers)
          .innerJoin(teams, eq(teams.id, teamMembers.teamId))
          .where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, userId), inArray(teams.status, ["PENDING", "APPROVED"])));
        membershipCount = count;
      }
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(matchParticipants)
        .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
        .where(and(eq(matchParticipants.eventId, eventId), eq(matchParticipants.userId, userId), inArray(matches.status, ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT"])));
      participantCount = count;
    } else if (role === "COMMENTATOR" || role === "REFEREE") {
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(matchAssignments)
        .innerJoin(matches, eq(matches.id, matchAssignments.matchId))
        .where(and(eq(matchAssignments.userId, userId), eq(matchAssignments.role, role), eq(matches.eventId, eventId), inArray(matches.status, ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT"])));
      unfinishedAssignmentCount = count;
    }
    const policyError = eventRoleRevocationError({ role, membershipCount, participantCount, unfinishedAssignmentCount });
    if (policyError) return policyError;
    const deleted = await tx.delete(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.userId, userId), eq(eventRoleGrants.role, role))).returning({ userId: eventRoleGrants.userId });
    if (!deleted.length) return "赛事身份状态已变化，请刷新后重试";
    if (role !== "EVENT_MANAGER") await tx.update(eventRoleApplications).set({ status: "WITHDRAWN", reviewReason: `管理员撤销：${reason}`, reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(eventRoleApplications.eventId, eventId), eq(eventRoleApplications.userId, userId), eq(eventRoleApplications.role, role)));
    return true;
  });
  if (removed !== true) redirect(adminUserFeedbackPath(userId, "error", removed));
  const roleLabel = role === "PLAYER" ? "选手" : role === "COMMENTATOR" ? "解说" : role === "REFEREE" ? "裁判" : "赛事管理员";
  await notify(userId, "赛事身份已撤销", `${grant.eventName} · ${roleLabel}：${reason}`, `/events/${grant.eventSlug}`);
  await audit({ eventId, actorId: actor.id, action: "EVENT_ROLE_REVOKED", entityType: "user", entityId: userId, detail: { role, reason } });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/events");
  revalidatePath(`/ops/${eventId}/applications`);
  revalidatePath("/me", "layout");
  redirect(adminUserFeedbackPath(userId, "success", `已撤销 ${grant.displayName} 在“${grant.eventName}”中的${roleLabel}身份`));
}
