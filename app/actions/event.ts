"use server";

import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { eventRoleApplications, eventRoleGrants, events, matchAssignments, matchParticipants, matches, teamInvites, teamJoinRequests, teamMembers, teams, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { hasEventRole } from "@/lib/permissions";
import { audit, notify } from "@/lib/audit";
import { formString } from "@/lib/validation";
import { canCancelTeamInvite, canLeaveTeam, canManageTeamLeadership, canRequestTeamMembership, canResubmitTeamApplication, canReviewTeamJoinRequest, canWithdrawTeamApplication, teamDissolutionError } from "@/lib/team-policy";
import { canWithdrawApplication } from "@/lib/application-policy";
import { isEventRegistrationOpen } from "@/lib/event-policy";
import { eventRoleRevocationError } from "@/lib/event-role-policy";
import { canDeclineMatchAssignment } from "@/lib/match-lifecycle-policy";

export type ActionState = { error?: string; success?: string };

async function eventOversightRecipients(eventId: string, excludeUserId: string) {
  const managers = await db.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants)
    .innerJoin(users, eq(users.id, eventRoleGrants.userId))
    .where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.role, "EVENT_MANAGER"), ne(eventRoleGrants.userId, excludeUserId), eq(users.disabled, false)));
  if (managers.length) return managers;
  return db.select({ userId: users.id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.disabled, false), ne(users.id, excludeUserId)));
}

export async function applyForRole(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const eventId = formString(formData, "eventId");
  const role = formString(formData, "role") as "PLAYER" | "COMMENTATOR" | "REFEREE";
  if (!eventId || !["PLAYER", "COMMENTATOR", "REFEREE"].includes(role)) return { error: "申请信息不完整" };
  const [event] = await db.select({ status: events.status, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || !isEventRegistrationOpen(event)) return { error: "该赛事当前不在报名时间内" };
  if (await hasEventRole(user.id, eventId, role)) return { error: "你已经拥有该身份" };
  const [existing] = await db.select({ status: eventRoleApplications.status }).from(eventRoleApplications).where(and(eq(eventRoleApplications.eventId, eventId), eq(eventRoleApplications.userId, user.id), eq(eventRoleApplications.role, role))).limit(1);
  if (existing?.status === "PENDING") return { error: "该身份正在审核中；如需修改，请先撤销当前申请" };
  const profile: Record<string, string> = role === "PLAYER"
    ? { gameNickname: user.gameNickname, gameUid: user.gameUid ?? "", survivorRank: user.survivorRank, hunterRank: user.hunterRank, rankScreenshotAssetId: user.rankScreenshotAssetId ?? "" }
    : role === "COMMENTATOR"
      ? { experience: formString(formData, "experience").slice(0, 1200), portfolioUrl: formString(formData, "portfolioUrl").slice(0, 500) }
      : { experience: formString(formData, "experience").slice(0, 1200), availability: formString(formData, "availability").slice(0, 500) };
  if (Object.values(profile).some((value) => !value)) return { error: "请完整填写申请资料" };
  if (role === "COMMENTATOR" && !/^https?:\/\//i.test(profile.portfolioUrl)) return { error: "作品链接必须是完整的 HTTP(S) 地址" };
  await db.insert(eventRoleApplications).values({ eventId, userId: user.id, role, profile }).onConflictDoUpdate({
    target: [eventRoleApplications.eventId, eventRoleApplications.userId, eventRoleApplications.role],
    set: { profile, status: "PENDING", reviewReason: null, reviewedAt: null, reviewedBy: null, updatedAt: new Date() }
  });
  await audit({ eventId, actorId: user.id, action: "ROLE_APPLICATION_SUBMITTED", entityType: "role_application", entityId: `${user.id}:${role}`, detail: { role } });
  revalidatePath("/me/applications");
  return { success: "申请已提交" };
}

export async function withdrawRoleApplication(formData: FormData) {
  const user = await requireUser();
  const applicationId = formString(formData, "applicationId");
  const [application] = await db.select().from(eventRoleApplications).where(and(eq(eventRoleApplications.id, applicationId), eq(eventRoleApplications.userId, user.id))).limit(1);
  if (!application) redirect("/me/applications?error=" + encodeURIComponent("申请不存在或不属于当前账号"));
  if (!canWithdrawApplication(application.status)) redirect("/me/applications?error=" + encodeURIComponent("只有待审核申请可以撤销"));
  const withdrawn = await db.update(eventRoleApplications).set({ status: "WITHDRAWN", reviewReason: null, reviewedBy: null, reviewedAt: null, updatedAt: new Date() }).where(and(eq(eventRoleApplications.id, application.id), eq(eventRoleApplications.status, "PENDING"))).returning({ id: eventRoleApplications.id });
  if (!withdrawn.length) redirect("/me/applications?error=" + encodeURIComponent("申请已被处理，请刷新后查看最新状态"));
  await audit({ eventId: application.eventId, actorId: user.id, action: "ROLE_APPLICATION_WITHDRAWN", entityType: "role_application", entityId: application.id, detail: { role: application.role } });
  revalidatePath("/me/applications");
  revalidatePath(`/ops/${application.eventId}/applications`);
  redirect("/me/applications?success=" + encodeURIComponent("申请已撤销；修改资料后可以重新提交"));
}

export async function relinquishEventRole(formData: FormData) {
  const user = await requireUser();
  const applicationId = formString(formData, "applicationId");
  const [application] = await db.select({ application: eventRoleApplications, event: events })
    .from(eventRoleApplications)
    .innerJoin(events, eq(events.id, eventRoleApplications.eventId))
    .where(and(eq(eventRoleApplications.id, applicationId), eq(eventRoleApplications.userId, user.id)))
    .limit(1);
  if (!application) redirect("/me/applications?error=" + encodeURIComponent("申请不存在或不属于当前账号"));
  if (application.application.status !== "APPROVED" || application.application.role === "EVENT_MANAGER") {
    redirect("/me/applications?error=" + encodeURIComponent("只有已通过的选手、解说或裁判身份可以主动退出"));
  }

  const result: { error: string } | { success: true } = await db.transaction(async (tx) => {
    const role = application.application.role as "PLAYER" | "COMMENTATOR" | "REFEREE";
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${application.application.eventId}:${user.id}:${role}`}))`);
    const [current] = await tx.select({ status: eventRoleApplications.status })
      .from(eventRoleApplications)
      .where(and(eq(eventRoleApplications.id, applicationId), eq(eventRoleApplications.userId, user.id)))
      .limit(1);
    const [grant] = await tx.select({ userId: eventRoleGrants.userId })
      .from(eventRoleGrants)
      .where(and(
        eq(eventRoleGrants.eventId, application.application.eventId),
        eq(eventRoleGrants.userId, user.id),
        eq(eventRoleGrants.role, role)
      ))
      .limit(1);
    if (!current || current.status !== "APPROVED" || !grant) return { error: "身份状态已变化，请刷新后查看最新结果" };

    let membershipCount = 0;
    let participantCount = 0;
    let unfinishedAssignmentCount = 0;
    if (role === "PLAYER") {
      if (["DRAFT", "REGISTRATION", "ACTIVE"].includes(application.event.status)) {
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(teamMembers)
          .innerJoin(teams, eq(teams.id, teamMembers.teamId))
          .where(and(
            eq(teamMembers.eventId, application.application.eventId),
            eq(teamMembers.userId, user.id),
            inArray(teams.status, ["PENDING", "APPROVED"])
          ));
        membershipCount = count;
      }
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
        .from(matchParticipants)
        .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
        .where(and(
          eq(matchParticipants.eventId, application.application.eventId),
          eq(matchParticipants.userId, user.id),
          inArray(matches.status, ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT"])
        ));
      participantCount = count;
    } else {
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
        .from(matchAssignments)
        .innerJoin(matches, eq(matches.id, matchAssignments.matchId))
        .where(and(
          eq(matchAssignments.userId, user.id),
          eq(matchAssignments.role, role),
          eq(matches.eventId, application.application.eventId),
          inArray(matches.status, ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT"])
        ));
      unfinishedAssignmentCount = count;
    }
    const policyError = eventRoleRevocationError({ role, membershipCount, participantCount, unfinishedAssignmentCount });
    if (policyError) return { error: policyError };

    const removed = await tx.delete(eventRoleGrants).where(and(
      eq(eventRoleGrants.eventId, application.application.eventId),
      eq(eventRoleGrants.userId, user.id),
      eq(eventRoleGrants.role, role)
    )).returning({ userId: eventRoleGrants.userId });
    if (!removed.length) return { error: "身份状态已变化，请刷新后查看最新结果" };
    await tx.update(eventRoleApplications).set({
      status: "WITHDRAWN",
      reviewReason: "用户主动退出已通过身份",
      reviewedBy: null,
      reviewedAt: new Date(),
      updatedAt: new Date()
    }).where(and(eq(eventRoleApplications.id, applicationId), eq(eventRoleApplications.status, "APPROVED")));
    return { success: true };
  });

  if ("error" in result) redirect("/me/applications?error=" + encodeURIComponent(result.error));
  await audit({ eventId: application.application.eventId, actorId: user.id, action: "EVENT_ROLE_RELINQUISHED", entityType: "role_application", entityId: applicationId, detail: { role: application.application.role } });
  const managers = await eventOversightRecipients(application.application.eventId, user.id);
  await Promise.all(managers.map(({ userId }) => notify(userId, "用户退出赛事身份", `${user.displayName} 已退出“${application.event.name}”的${application.application.role === "PLAYER" ? "选手" : application.application.role === "COMMENTATOR" ? "解说" : "裁判"}身份`, `/ops/${application.application.eventId}/applications`)));
  revalidatePath("/me/applications");
  revalidatePath(`/ops/${application.application.eventId}/applications`);
  revalidatePath(`/admin/users/${user.id}`);
  revalidatePath("/me", "layout");
  redirect("/me/applications?success=" + encodeURIComponent("已退出该赛事身份；历史比赛记录会继续保留"));
}

export async function declineMatchAssignment(formData: FormData) {
  const user = await requireUser();
  const matchId = formString(formData, "matchId");
  const role = formString(formData, "role") as "REFEREE" | "COMMENTATOR";
  if (!matchId || !["REFEREE", "COMMENTATOR"].includes(role)) redirect("/me/assignments?error=" + encodeURIComponent("工作指派信息无效"));
  const [row] = await db.select({ assignment: matchAssignments, match: matches, event: events })
    .from(matchAssignments)
    .innerJoin(matches, eq(matches.id, matchAssignments.matchId))
    .innerJoin(events, eq(events.id, matches.eventId))
    .where(and(eq(matchAssignments.matchId, matchId), eq(matchAssignments.userId, user.id), eq(matchAssignments.role, role)))
    .limit(1);
  if (!row) redirect("/me/assignments?error=" + encodeURIComponent("该工作指派已取消或不存在"));
  if (!canDeclineMatchAssignment(row.match.status)) redirect("/me/assignments?error=" + encodeURIComponent("比赛已开始或进入结果处理阶段，请直接联系赛事管理员调整工作人员"));
  const declined = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-user:${row.match.eventId}:${user.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${row.match.eventId}:${user.id}:${role}`}))`);
    const [currentMatch] = await tx.select({ status: matches.status }).from(matches).where(eq(matches.id, matchId)).limit(1);
    if (!currentMatch || !canDeclineMatchAssignment(currentMatch.status)) return false;
    const removed = await tx.delete(matchAssignments).where(and(eq(matchAssignments.matchId, matchId), eq(matchAssignments.userId, user.id), eq(matchAssignments.role, role))).returning({ userId: matchAssignments.userId });
    return removed.length > 0;
  });
  if (!declined) redirect("/me/assignments?error=" + encodeURIComponent("指派或比赛状态已变化，请刷新后重试"));
  const managers = await eventOversightRecipients(row.match.eventId, user.id);
  await Promise.all(managers.map(({ userId }) => notify(userId, "工作人员已谢绝比赛指派", `${user.displayName} 已谢绝“${row.match.roundLabel}”的${role === "REFEREE" ? "裁判" : "解说"}任务，请重新指派`, `/ops/${row.match.eventId}/matches`)));
  await audit({ eventId: row.match.eventId, actorId: user.id, action: "MATCH_STAFF_DECLINED", entityType: "match", entityId: matchId, detail: { role } });
  revalidatePath("/me/assignments");
  revalidatePath(`/ops/${row.match.eventId}/matches`);
  revalidatePath("/me", "layout");
  redirect("/me/assignments?success=" + encodeURIComponent(`已谢绝“${row.match.roundLabel}”的${role === "REFEREE" ? "裁判" : "解说"}任务，赛事管理员将收到通知`));
}

export async function createTeam(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const eventId = formString(formData, "eventId");
  const name = formString(formData, "name").slice(0, 40);
  const abbreviation = formString(formData, "abbreviation").toUpperCase();
  const slogan = formString(formData, "slogan").slice(0, 100);
  if (name.length < 2 || abbreviation.length < 2 || abbreviation.length > 6) return { error: "战队名称至少 2 字，缩写应为 2–6 个字符" };
  const [event] = await db.select({ mode: events.mode, status: events.status, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || event.mode !== "PLAYER_TEAMS") return { error: "该赛事不允许玩家自行创建战队" };
  if (!isEventRegistrationOpen(event)) return { error: "该赛事当前不在组队报名时间内" };
  if (!await hasEventRole(user.id, eventId, "PLAYER")) return { error: "通过该赛事的选手审核后才能建队" };
  const [existing] = await db.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, user.id))).limit(1);
  if (existing) return { error: "你已经属于该赛事的一支战队" };
  const [pendingJoin] = await db.select({ id: teamJoinRequests.id }).from(teamJoinRequests).where(and(eq(teamJoinRequests.eventId, eventId), eq(teamJoinRequests.userId, user.id), eq(teamJoinRequests.status, "PENDING"))).limit(1);
  if (pendingJoin) return { error: "请先等待或处理当前赛事的入队申请，再提交建队申请" };
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${user.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-user:${eventId}:${user.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${eventId}:${user.id}:PLAYER`}))`);
    const [currentGrant] = await tx.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.userId, user.id), eq(eventRoleGrants.role, "PLAYER"))).limit(1);
    if (!currentGrant) throw new Error("PLAYER_ROLE_REQUIRED");
    const [currentMembership] = await tx.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, user.id))).limit(1);
    if (currentMembership) throw new Error("ALREADY_MEMBER");
    const [team] = await tx.insert(teams).values({ eventId, name, abbreviation, slogan, captainId: user.id }).returning();
    await tx.insert(teamMembers).values({ eventId, teamId: team.id, userId: user.id, role: "CAPTAIN", specialty: "FLEX" });
    return team;
  }).catch((error) => error instanceof Error ? error.message : "UNKNOWN");
  if (typeof result === "string") {
    if (result === "PLAYER_ROLE_REQUIRED") return { error: "你的赛事选手身份已失效，请重新申请并通过审核后再建队" };
    if (result === "ALREADY_MEMBER") return { error: "你已经属于该赛事的一支战队" };
    return { error: "战队名称或缩写已存在" };
  }
  await audit({ eventId, actorId: user.id, action: "TEAM_CREATION_APPLIED", entityType: "team", entityId: result.id });
  revalidatePath("/me/teams");
  return { success: "建队申请已提交，审核通过后会出现在公开战队列表" };
}

export async function withdrawTeamApplication(formData: FormData) {
  const actor = await requireUser();
  const teamId = formString(formData, "teamId");
  const [row] = await db.select({ team: teams, member: teamMembers })
    .from(teams)
    .innerJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, actor.id)))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row || !canWithdrawTeamApplication(row.team.status, row.member.role) || row.team.captainId !== actor.id) {
    redirect(teamFeedbackPath("error", "只有队长可以撤销待审核的建队申请"));
  }
  const withdrawn = await db.transaction(async (tx) => {
    const updated = await tx.update(teams).set({
      status: "WITHDRAWN",
      locked: true,
      reviewReason: "申请人主动撤销",
      updatedAt: new Date()
    }).where(and(eq(teams.id, teamId), eq(teams.status, "PENDING"))).returning({ id: teams.id });
    if (!updated.length) return false;
    await tx.update(teamInvites).set({ status: "WITHDRAWN" }).where(and(eq(teamInvites.teamId, teamId), eq(teamInvites.status, "PENDING")));
    await tx.update(teamJoinRequests).set({ status: "WITHDRAWN", reviewReason: "建队申请已撤销", updatedAt: new Date() }).where(and(eq(teamJoinRequests.teamId, teamId), eq(teamJoinRequests.status, "PENDING")));
    await tx.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
    return true;
  });
  if (!withdrawn) redirect(teamFeedbackPath("error", "申请状态已变化，请刷新后查看最新结果"));
  await audit({ eventId: row.team.eventId, actorId: actor.id, action: "TEAM_APPLICATION_WITHDRAWN", entityType: "team", entityId: teamId });
  revalidatePath("/me/teams");
  revalidatePath(`/ops/${row.team.eventId}/teams`);
  redirect(teamFeedbackPath("success", "建队申请已撤销，你现在可以重新建队或申请加入其他战队"));
}

export async function resubmitTeamApplication(formData: FormData) {
  const actor = await requireUser();
  const teamId = formString(formData, "teamId");
  const name = formString(formData, "name").slice(0, 40);
  const abbreviation = formString(formData, "abbreviation").toUpperCase();
  const slogan = formString(formData, "slogan").slice(0, 100);
  if (name.length < 2 || abbreviation.length < 2 || abbreviation.length > 6) {
    redirect(teamFeedbackPath("error", "战队名称至少 2 字，缩写应为 2–6 个字符"));
  }
  const [row] = await db.select({ team: teams, member: teamMembers })
    .from(teams)
    .innerJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, actor.id)))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row || !canResubmitTeamApplication(row.team.status, row.member.role) || row.team.captainId !== actor.id) {
    redirect(teamFeedbackPath("error", "只有队长可以修改并重新提交被拒绝的建队申请"));
  }
  const [event] = await db.select({ mode: events.mode, status: events.status, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd })
    .from(events).where(eq(events.id, row.team.eventId)).limit(1);
  if (!event || event.mode !== "PLAYER_TEAMS" || !isEventRegistrationOpen(event)) {
    redirect(teamFeedbackPath("error", "该赛事当前不开放玩家建队申请"));
  }
  if (!await hasEventRole(actor.id, row.team.eventId, "PLAYER")) {
    redirect(teamFeedbackPath("error", "你的赛事选手身份已失效，暂不能重新提交"));
  }
  const updated = await db.update(teams).set({
    name,
    abbreviation,
    slogan,
    status: "PENDING",
    locked: false,
    reviewReason: null,
    updatedAt: new Date()
  }).where(and(eq(teams.id, teamId), eq(teams.status, "REJECTED"))).returning({ id: teams.id }).catch(() => []);
  if (!updated.length) redirect(teamFeedbackPath("error", "战队名称或缩写已被使用，或申请状态已经变化"));
  await audit({ eventId: row.team.eventId, actorId: actor.id, action: "TEAM_APPLICATION_RESUBMITTED", entityType: "team", entityId: teamId, detail: { name, abbreviation } });
  revalidatePath("/me/teams");
  revalidatePath(`/ops/${row.team.eventId}/teams`);
  redirect(teamFeedbackPath("success", "建队资料已重新提交，等待赛事方审核"));
}

export async function inviteTeamMember(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const teamId = formString(formData, "teamId");
  const username = formString(formData, "username").toLowerCase();
  const [team] = await db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.captainId, user.id))).limit(1);
  if (!team || team.status !== "APPROVED" || team.locked) return { error: "战队尚未通过审核、无权操作或名单已锁定" };
  const [event] = await db.select({ mode: events.mode, status: events.status, maxRoster: events.maxRoster, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd }).from(events).where(eq(events.id, team.eventId)).limit(1);
  if (!event || event.mode !== "PLAYER_TEAMS") return { error: "该赛事由管理员统一编队" };
  if (!isEventRegistrationOpen(event)) return { error: "该赛事当前不在组队报名时间内" };
  const memberCount = await db.$count(teamMembers, eq(teamMembers.teamId, team.id));
  if (memberCount >= event.maxRoster) return { error: "战队人数已达到赛事上限" };
  const [invitee] = await db.select().from(users).where(and(eq(users.username, username), eq(users.disabled, false))).limit(1);
  if (!invitee || !await hasEventRole(invitee.id, team.eventId, "PLAYER")) return { error: "该用户不存在或尚未通过选手审核" };
  const [member] = await db.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.eventId, team.eventId), eq(teamMembers.userId, invitee.id))).limit(1);
  if (member) return { error: "该用户已加入本赛事其他战队" };
  await db.insert(teamInvites).values({ eventId: team.eventId, teamId, invitedUserId: invitee.id, invitedBy: user.id }).onConflictDoUpdate({ target: [teamInvites.teamId, teamInvites.invitedUserId], set: { status: "PENDING", createdAt: new Date() } });
  await notify(invitee.id, "收到战队邀请", `${team.name} 邀请你加入赛事战队`, "/me/teams");
  revalidatePath("/me/teams");
  return { success: "邀请已发送" };
}

export async function respondTeamInvite(formData: FormData) {
  const user = await requireUser();
  const inviteId = formString(formData, "inviteId");
  const decision = formString(formData, "decision");
  const accept = decision === "accept";
  if (!["accept", "reject"].includes(decision)) redirect(teamFeedbackPath("error", "邀请操作无效"));
  const [invite] = await db.select().from(teamInvites).where(and(eq(teamInvites.id, inviteId), eq(teamInvites.invitedUserId, user.id), eq(teamInvites.status, "PENDING"))).limit(1);
  if (!invite) redirect(teamFeedbackPath("error", "该邀请已处理、已撤销或不存在"));
  const [team] = await db.select().from(teams).where(eq(teams.id, invite.teamId)).limit(1);
  if (!team) redirect(teamFeedbackPath("error", "战队不存在或已被删除"));
  const [event] = await db.select({ mode: events.mode, status: events.status, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd }).from(events).where(eq(events.id, team.eventId)).limit(1);
  if (accept && (!event || event.mode !== "PLAYER_TEAMS")) redirect(teamFeedbackPath("error", "该赛事由管理员统一编队"));
  if (accept && (team.status !== "APPROVED" || team.locked || !event || !isEventRegistrationOpen(event))) redirect(teamFeedbackPath("error", "报名窗口已关闭或战队名单已经锁定"));
  const completed = await db.transaction(async (tx) => {
    if (accept) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${user.id}`}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-user:${invite.eventId}:${user.id}`}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${invite.eventId}:${user.id}:PLAYER`}))`);
    }
    await tx.execute(sql`select ${teams.id} from ${teams} where ${teams.id} = ${team.id} for update`);
    const [currentInvite] = await tx.select().from(teamInvites).where(and(eq(teamInvites.id, invite.id), eq(teamInvites.status, "PENDING"))).limit(1);
    const [currentTeam] = await tx.select().from(teams).where(eq(teams.id, team.id)).limit(1);
    const [currentEvent] = await tx.select().from(events).where(eq(events.id, team.eventId)).limit(1);
    if (!currentInvite) throw new Error("STALE_INVITE");
    if (accept) {
      if (!currentTeam || currentTeam.status !== "APPROVED" || currentTeam.locked || !currentEvent || currentEvent.mode !== "PLAYER_TEAMS" || !isEventRegistrationOpen(currentEvent)) throw new Error("ROSTER_CLOSED");
      const [playerGrant] = await tx.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, invite.eventId), eq(eventRoleGrants.userId, user.id), eq(eventRoleGrants.role, "PLAYER"))).limit(1);
      if (!playerGrant) throw new Error("PLAYER_ROLE_REQUIRED");
      const [refereeConflict] = await tx.select({ userId: matchAssignments.userId }).from(matchAssignments)
        .innerJoin(matches, eq(matches.id, matchAssignments.matchId))
        .where(and(eq(matchAssignments.userId, user.id), eq(matchAssignments.role, "REFEREE"), eq(matches.eventId, invite.eventId), inArray(matches.status, ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT"]), or(eq(matches.teamAId, invite.teamId), eq(matches.teamBId, invite.teamId))))
        .limit(1);
      if (refereeConflict) throw new Error("REFEREE_CONFLICT");
      const memberCount = await tx.$count(teamMembers, eq(teamMembers.teamId, invite.teamId));
      if (memberCount >= currentEvent.maxRoster) throw new Error("ROSTER_FULL");
      await tx.insert(teamMembers).values({ eventId: invite.eventId, teamId: invite.teamId, userId: user.id });
      const updated = await tx.update(teamInvites).set({ status: "APPROVED" }).where(and(eq(teamInvites.id, invite.id), eq(teamInvites.status, "PENDING"))).returning({ id: teamInvites.id });
      if (!updated.length) throw new Error("STALE_INVITE");
      await tx.update(teamInvites).set({ status: "WITHDRAWN" }).where(and(eq(teamInvites.eventId, invite.eventId), eq(teamInvites.invitedUserId, user.id), eq(teamInvites.status, "PENDING")));
      await tx.update(teamJoinRequests).set({ status: "WITHDRAWN", reviewReason: "已接受其他战队邀请", updatedAt: new Date() }).where(and(eq(teamJoinRequests.eventId, invite.eventId), eq(teamJoinRequests.userId, user.id), eq(teamJoinRequests.status, "PENDING")));
    } else {
      const updated = await tx.update(teamInvites).set({ status: "REJECTED" }).where(and(eq(teamInvites.id, invite.id), eq(teamInvites.status, "PENDING"))).returning({ id: teamInvites.id });
      if (!updated.length) throw new Error("STALE_INVITE");
    }
    return true;
  }).catch((error) => error instanceof Error ? error.message : "UNKNOWN");
  if (completed !== true) {
    const message = completed === "ROSTER_FULL" ? "战队人数已达到赛事上限"
      : completed === "PLAYER_ROLE_REQUIRED" ? "你的赛事选手身份已失效，不能接受邀请"
        : completed === "REFEREE_CONFLICT" ? "你仍被指派执裁该战队的未结束比赛，请先联系赛事管理员取消指派"
        : completed === "ROSTER_CLOSED" ? "报名窗口已关闭或战队名单已经锁定"
          : accept ? "邀请状态已变化，或你已加入本赛事其他战队" : "邀请状态已变化，请刷新后重试";
    redirect(teamFeedbackPath("error", message));
  }
  await notify(team.captainId, accept ? "选手已接受战队邀请" : "选手已拒绝战队邀请", `${user.displayName}${accept ? "已加入" : "未接受加入"} ${team.name}`, "/me/teams");
  await audit({ eventId: team.eventId, actorId: user.id, action: accept ? "TEAM_INVITE_ACCEPTED" : "TEAM_INVITE_REJECTED", entityType: "team_invite", entityId: invite.id, detail: { teamId: team.id } });
  revalidatePath("/me/teams");
  revalidatePath("/events");
  redirect(teamFeedbackPath("success", accept ? `已加入 ${team.name}` : `已拒绝 ${team.name} 的邀请`));
}

export async function cancelTeamInvite(formData: FormData) {
  const actor = await requireUser();
  const inviteId = formString(formData, "inviteId");
  const [row] = await db.select({ invite: teamInvites, team: teams, invitee: users }).from(teamInvites).innerJoin(teams, eq(teams.id, teamInvites.teamId)).innerJoin(users, eq(users.id, teamInvites.invitedUserId)).where(and(eq(teamInvites.id, inviteId), eq(teamInvites.status, "PENDING"))).limit(1);
  if (!row) redirect(teamFeedbackPath("error", "该邀请已处理或不存在"));
  const [operator] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, row.team.id), eq(teamMembers.userId, actor.id))).limit(1);
  if (!canCancelTeamInvite(operator?.role)) redirect(teamFeedbackPath("error", "只有队长或副队长可以撤销邀请"));
  const cancelled = await db.update(teamInvites).set({ status: "WITHDRAWN" }).where(and(eq(teamInvites.id, inviteId), eq(teamInvites.status, "PENDING"))).returning({ id: teamInvites.id });
  if (!cancelled.length) redirect(teamFeedbackPath("error", "邀请状态已变化，请刷新后重试"));
  await notify(row.invitee.id, "战队邀请已撤销", `${row.team.name} 已撤销此前的入队邀请。`, "/me/teams");
  await audit({ eventId: row.team.eventId, actorId: actor.id, action: "TEAM_INVITE_WITHDRAWN", entityType: "team_invite", entityId: inviteId, detail: { teamId: row.team.id, userId: row.invitee.id } });
  revalidatePath("/me/teams");
  redirect(teamFeedbackPath("success", `已撤销对 ${row.invitee.displayName} 的邀请`));
}

export async function withdrawTeamJoinRequest(formData: FormData) {
  const actor = await requireUser();
  const requestId = formString(formData, "requestId");
  const [row] = await db.select({ request: teamJoinRequests, team: teams }).from(teamJoinRequests).innerJoin(teams, eq(teams.id, teamJoinRequests.teamId)).where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.userId, actor.id))).limit(1);
  if (!row) redirect(teamFeedbackPath("error", "入队申请不存在"));
  const withdrawn = await db.update(teamJoinRequests).set({ status: "WITHDRAWN", reviewReason: null, reviewedBy: null, reviewedAt: null, updatedAt: new Date() }).where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.status, "PENDING"))).returning({ id: teamJoinRequests.id });
  if (!withdrawn.length) redirect(teamFeedbackPath("error", "只有待审核的入队申请可以撤销"));
  await audit({ eventId: row.team.eventId, actorId: actor.id, action: "TEAM_JOIN_REQUEST_WITHDRAWN", entityType: "team_join_request", entityId: requestId, detail: { teamId: row.team.id } });
  revalidatePath("/me/teams");
  redirect(teamFeedbackPath("success", `已撤销加入 ${row.team.name} 的申请`));
}

export async function leaveTeam(formData: FormData) {
  const actor = await requireUser();
  const memberId = formString(formData, "memberId");
  const [row] = await db.select({ member: teamMembers, team: teams }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(and(eq(teamMembers.id, memberId), eq(teamMembers.userId, actor.id))).limit(1);
  if (!row) redirect(teamFeedbackPath("error", "战队成员记录不存在"));
  const [event] = await db.select({ status: events.status, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd }).from(events).where(eq(events.id, row.team.eventId)).limit(1);
  if (!event || !isEventRegistrationOpen(event)) redirect(teamFeedbackPath("error", "报名窗口已关闭，战队名单不能再由选手调整"));
  if (!canLeaveTeam(row.member.role, row.team.locked)) redirect(teamFeedbackPath("error", row.member.role === "CAPTAIN" ? "队长需先转移队长身份或解散战队" : "名单已锁定，暂不能退出战队"));
  const leaders = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.teamId, row.team.id), ne(teamMembers.role, "MEMBER")));
  const removed = await db.delete(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.userId, actor.id))).returning({ id: teamMembers.id });
  if (!removed.length) redirect(teamFeedbackPath("error", "成员状态已变化，请刷新后重试"));
  await Promise.all(leaders.filter(({ userId }) => userId !== actor.id).map(({ userId }) => notify(userId, "成员退出战队", `${actor.displayName} 已退出 ${row.team.name}`, "/me/teams")));
  await audit({ eventId: row.team.eventId, actorId: actor.id, action: "TEAM_MEMBER_LEFT", entityType: "team", entityId: row.team.id, detail: { userId: actor.id } });
  revalidatePath("/me/teams");
  revalidatePath("/events");
  redirect(teamFeedbackPath("success", `已退出 ${row.team.name}`));
}

export async function applyToJoinTeam(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const teamId = formString(formData, "teamId");
  const message = formString(formData, "message").slice(0, 300);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return { error: "战队不存在" };
  const [event] = await db.select({ mode: events.mode, status: events.status, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd }).from(events).where(eq(events.id, team.eventId)).limit(1);
  if (!event || event.mode !== "PLAYER_TEAMS") return { error: "该赛事由管理员统一编队，不开放入队申请" };
  if (!isEventRegistrationOpen(event)) return { error: "该赛事当前不在组队报名时间内" };
  const [membership, pendingRequest] = await Promise.all([
    db.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.eventId, team.eventId), eq(teamMembers.userId, user.id))).limit(1),
    db.select({ id: teamJoinRequests.id }).from(teamJoinRequests).where(and(eq(teamJoinRequests.eventId, team.eventId), eq(teamJoinRequests.userId, user.id), eq(teamJoinRequests.status, "PENDING"))).limit(1)
  ]);
  const hasPlayerRole = await hasEventRole(user.id, team.eventId, "PLAYER");
  if (!canRequestTeamMembership({ teamStatus: team.status, locked: team.locked, hasPlayerRole, hasMembership: Boolean(membership[0]), hasPendingRequest: Boolean(pendingRequest[0]) })) {
    if (!hasPlayerRole) return { error: "通过该赛事的选手审核后才能申请加入战队" };
    if (membership[0]) return { error: "你已经属于该赛事的一支战队" };
    if (pendingRequest[0]) return { error: "你在该赛事已有一条待处理的加入申请" };
    return { error: "该战队尚未开放招募或名单已锁定" };
  }
  const [request] = await db.insert(teamJoinRequests).values({ eventId: team.eventId, teamId, userId: user.id, message }).onConflictDoUpdate({
    target: [teamJoinRequests.teamId, teamJoinRequests.userId],
    set: { status: "PENDING", message, reviewReason: null, reviewedBy: null, reviewedAt: null, updatedAt: new Date() }
  }).returning().catch(() => []);
  if (!request) return { error: "你在该赛事已有待处理申请，请勿重复提交" };
  const reviewers = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), ne(teamMembers.role, "MEMBER")));
  await Promise.all(reviewers.map(({ userId }) => notify(userId, "收到入队申请", `${user.displayName} 申请加入 ${team.name}`, "/me/teams")));
  await audit({ eventId: team.eventId, actorId: user.id, action: "TEAM_JOIN_REQUESTED", entityType: "team_join_request", entityId: request.id, detail: { teamId } });
  revalidatePath("/me/teams");
  revalidatePath("/events");
  return { success: "加入申请已提交，等待队长或副队长审核" };
}

function teamFeedbackPath(type: "error" | "success", message: string) {
  return `/me/teams?${new URLSearchParams({ [type]: message }).toString()}`;
}

export async function reviewTeamJoinRequest(formData: FormData) {
  const actor = await requireUser();
  const requestId = formString(formData, "requestId");
  const decision = formString(formData, "decision") as "APPROVED" | "REJECTED";
  const reason = formString(formData, "reason").slice(0, 300);
  const [row] = await db.select({ request: teamJoinRequests, team: teams }).from(teamJoinRequests).innerJoin(teams, eq(teams.id, teamJoinRequests.teamId)).where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.status, "PENDING"))).limit(1);
  if (!row) redirect(teamFeedbackPath("error", "该申请已处理或不存在"));
  if (row.team.status !== "APPROVED") redirect(teamFeedbackPath("error", "战队当前不可处理入队申请"));
  const [operator] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, row.team.id), eq(teamMembers.userId, actor.id))).limit(1);
  if (!canReviewTeamJoinRequest(operator?.role)) redirect(teamFeedbackPath("error", "只有队长或副队长可以处理入队申请"));
  if (row.team.locked) redirect(teamFeedbackPath("error", "战队名单已锁定，暂不能处理入队申请"));
  if (!['APPROVED', 'REJECTED'].includes(decision)) redirect(teamFeedbackPath("error", "审核操作无效"));
  if (decision === "REJECTED" && !reason) redirect(teamFeedbackPath("error", "拒绝申请时必须填写原因"));
  try {
    await db.transaction(async (tx) => {
      if (decision === "APPROVED") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${row.request.userId}`}))`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-user:${row.team.eventId}:${row.request.userId}`}))`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-role:${row.team.eventId}:${row.request.userId}:PLAYER`}))`);
      }
      await tx.execute(sql`select ${teams.id} from ${teams} where ${teams.id} = ${row.team.id} for update`);
      const [currentRequest] = await tx.select().from(teamJoinRequests).where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.status, "PENDING"))).limit(1);
      const [currentTeam] = await tx.select().from(teams).where(eq(teams.id, row.team.id)).limit(1);
      if (!currentRequest) throw new Error("STALE_REQUEST");
      if (!currentTeam || currentTeam.status !== "APPROVED" || currentTeam.locked) throw new Error("ROSTER_CLOSED");
      if (decision === "APPROVED") {
        const [event] = await tx.select().from(events).where(eq(events.id, row.team.eventId)).limit(1);
        if (!event || event.mode !== "PLAYER_TEAMS" || !isEventRegistrationOpen(event)) throw new Error("ROSTER_CLOSED");
        const [applicant] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, row.request.userId), eq(users.disabled, false))).limit(1);
        const [playerGrant] = await tx.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, row.team.eventId), eq(eventRoleGrants.userId, row.request.userId), eq(eventRoleGrants.role, "PLAYER"))).limit(1);
        if (!applicant || !playerGrant) throw new Error("PLAYER_ROLE_REQUIRED");
        const [refereeConflict] = await tx.select({ userId: matchAssignments.userId }).from(matchAssignments)
          .innerJoin(matches, eq(matches.id, matchAssignments.matchId))
          .where(and(eq(matchAssignments.userId, row.request.userId), eq(matchAssignments.role, "REFEREE"), eq(matches.eventId, row.team.eventId), inArray(matches.status, ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT"]), or(eq(matches.teamAId, row.team.id), eq(matches.teamBId, row.team.id))))
          .limit(1);
        if (refereeConflict) throw new Error("REFEREE_CONFLICT");
        const count = await tx.$count(teamMembers, eq(teamMembers.teamId, row.team.id));
        if (count >= event.maxRoster) throw new Error("ROSTER_FULL");
        const updated = await tx.update(teamJoinRequests).set({ status: "APPROVED", reviewReason: null, reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.status, "PENDING"))).returning({ id: teamJoinRequests.id });
        if (!updated.length) throw new Error("STALE_REQUEST");
        await tx.insert(teamMembers).values({ eventId: row.team.eventId, teamId: row.team.id, userId: row.request.userId });
        await tx.update(teamJoinRequests).set({ status: "WITHDRAWN", reviewReason: "已加入其他战队", updatedAt: new Date() }).where(and(eq(teamJoinRequests.eventId, row.team.eventId), eq(teamJoinRequests.userId, row.request.userId), eq(teamJoinRequests.status, "PENDING"), ne(teamJoinRequests.id, requestId)));
        await tx.update(teamInvites).set({ status: "WITHDRAWN" }).where(and(eq(teamInvites.eventId, row.team.eventId), eq(teamInvites.invitedUserId, row.request.userId), eq(teamInvites.status, "PENDING")));
      } else {
        const updated = await tx.update(teamJoinRequests).set({ status: "REJECTED", reviewReason: reason, reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.status, "PENDING"))).returning({ id: teamJoinRequests.id });
        if (!updated.length) throw new Error("STALE_REQUEST");
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const message = code === "ROSTER_FULL" ? "战队人数已达到赛事上限"
      : code === "PLAYER_ROLE_REQUIRED" ? "申请人的选手身份已失效或账号已停用"
        : code === "REFEREE_CONFLICT" ? "申请人仍被指派执裁本战队的未结束比赛，请先由赛事管理员取消指派"
        : code === "ROSTER_CLOSED" ? "报名窗口已关闭或战队名单已经锁定"
          : code === "STALE_REQUEST" ? "申请状态已变化，请刷新后重试" : "申请人已加入其他战队，无法重复加入";
    redirect(teamFeedbackPath("error", message));
  }
  await notify(row.request.userId, decision === "APPROVED" ? "入队申请已通过" : "入队申请未通过", reason || `你已加入 ${row.team.name}`, "/me/teams");
  await audit({ eventId: row.team.eventId, actorId: actor.id, action: `TEAM_JOIN_REQUEST_${decision}`, entityType: "team_join_request", entityId: requestId, detail: { teamId: row.team.id, reason } });
  revalidatePath("/me/teams");
  revalidatePath("/events");
  redirect(teamFeedbackPath("success", decision === "APPROVED" ? "已同意该选手加入战队" : "已拒绝该入队申请"));
}

export async function setViceCaptain(formData: FormData) {
  const actor = await requireUser();
  const teamId = formString(formData, "teamId");
  const memberId = formString(formData, "memberId");
  const decision = formString(formData, "decision");
  if (!['set', 'remove'].includes(decision)) redirect(teamFeedbackPath("error", "副队长设置操作无效"));
  const remove = decision === "remove";
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  const [actorMember] = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actor.id))).limit(1);
  const [event] = team ? await db.select({ status: events.status, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd }).from(events).where(eq(events.id, team.eventId)).limit(1) : [];
  if (!event || !isEventRegistrationOpen(event)) redirect(teamFeedbackPath("error", "报名窗口已关闭，不能再调整战队职务"));
  if (!team || team.status !== "APPROVED" || team.locked || !canManageTeamLeadership(actorMember?.role) || team.captainId !== actor.id) redirect(teamFeedbackPath("error", "只有已通过审核且名单未锁定战队的队长可以设置副队长"));
  let targetUserId: string | null = null;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select ${teams.id} from ${teams} where ${teams.id} = ${teamId} for update`);
    await tx.update(teamMembers).set({ role: "MEMBER" }).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "VICE_CAPTAIN")));
    if (!remove) {
      const [target] = await tx.select().from(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId))).limit(1);
      if (!target || target.userId === actor.id) throw new Error("INVALID_TARGET");
      targetUserId = target.userId;
      await tx.update(teamMembers).set({ role: "VICE_CAPTAIN" }).where(eq(teamMembers.id, target.id));
    }
  }).catch(() => redirect(teamFeedbackPath("error", "请选择本队其他成员担任副队长")));
  if (targetUserId) await notify(targetUserId, "你已成为副队长", `你现在可以处理 ${team.name} 的入队申请`, "/me/teams");
  await audit({ eventId: team.eventId, actorId: actor.id, action: remove ? "TEAM_VICE_CAPTAIN_REMOVED" : "TEAM_VICE_CAPTAIN_SET", entityType: "team", entityId: teamId, detail: { targetUserId } });
  revalidatePath("/me/teams");
  revalidatePath("/events");
  redirect(teamFeedbackPath("success", remove ? "已取消副队长职务" : "副队长已设置"));
}

export async function transferTeamCaptain(formData: FormData) {
  const actor = await requireUser();
  const teamId = formString(formData, "teamId");
  const memberId = formString(formData, "memberId");
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  const [actorMember] = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actor.id))).limit(1);
  const [event] = team ? await db.select({ status: events.status, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd }).from(events).where(eq(events.id, team.eventId)).limit(1) : [];
  if (!event || !isEventRegistrationOpen(event)) redirect(teamFeedbackPath("error", "报名窗口已关闭，不能再转移队长身份"));
  if (!team || team.status !== "APPROVED" || team.locked || !canManageTeamLeadership(actorMember?.role) || team.captainId !== actor.id) redirect(teamFeedbackPath("error", "只有已通过审核且名单未锁定战队的队长可以转移队长身份"));
  let targetUserId = "";
  await db.transaction(async (tx) => {
    await tx.execute(sql`select ${teams.id} from ${teams} where ${teams.id} = ${teamId} for update`);
    const [target] = await tx.select().from(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId))).limit(1);
    if (!target || target.userId === actor.id) throw new Error("INVALID_TARGET");
    targetUserId = target.userId;
    await tx.update(teamMembers).set({ role: "MEMBER" }).where(eq(teamMembers.id, actorMember.id));
    await tx.update(teamMembers).set({ role: "CAPTAIN" }).where(eq(teamMembers.id, target.id));
    await tx.update(teams).set({ captainId: target.userId, updatedAt: new Date() }).where(eq(teams.id, teamId));
  }).catch(() => redirect(teamFeedbackPath("error", "请选择本队其他成员接任队长")));
  await notify(targetUserId, "队长身份已转移给你", `你现在是 ${team.name} 的队长`, "/me/teams");
  await audit({ eventId: team.eventId, actorId: actor.id, action: "TEAM_CAPTAIN_TRANSFERRED", entityType: "team", entityId: teamId, detail: { fromUserId: actor.id, toUserId: targetUserId } });
  revalidatePath("/me/teams");
  revalidatePath("/events");
  redirect(teamFeedbackPath("success", "队长身份已成功转移"));
}

export async function dissolveOwnTeam(formData: FormData) {
  const actor = await requireUser();
  const teamId = formString(formData, "teamId");
  const reason = formString(formData, "reason").slice(0, 300);
  const [team] = await db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.captainId, actor.id))).limit(1);
  if (!team || team.status === "WITHDRAWN") redirect(teamFeedbackPath("error", "只有当前队长可以解散战队"));
  const [event] = await db.select({ status: events.status, registrationStart: events.registrationStart, registrationEnd: events.registrationEnd }).from(events).where(eq(events.id, team.eventId)).limit(1);
  if (!event || event.status === "ARCHIVED") redirect(teamFeedbackPath("error", "赛事已归档，战队资料处于只读状态"));
  if (team.status === "APPROVED" && !isEventRegistrationOpen(event)) redirect(teamFeedbackPath("error", "报名窗口已关闭，已审核战队只能由赛事管理员处理"));
  const unfinishedMatchCount = await db.$count(matches, and(
    eq(matches.eventId, team.eventId),
    or(eq(matches.teamAId, teamId), eq(matches.teamBId, teamId)),
    ne(matches.status, "PUBLISHED")
  ));
  const dissolutionError = teamDissolutionError({ unfinishedMatchCount });
  if (dissolutionError) redirect(teamFeedbackPath("error", dissolutionError));
  const members = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
  await db.transaction(async (tx) => {
    await tx.update(teams).set({ status: "WITHDRAWN", locked: true, reviewReason: reason || "队长主动解散", updatedAt: new Date() }).where(eq(teams.id, teamId));
    await tx.update(teamJoinRequests).set({ status: "WITHDRAWN", reviewReason: "战队已解散", reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(teamJoinRequests.teamId, teamId), eq(teamJoinRequests.status, "PENDING")));
    await tx.update(teamInvites).set({ status: "WITHDRAWN" }).where(and(eq(teamInvites.teamId, teamId), eq(teamInvites.status, "PENDING")));
    await tx.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
  });
  await Promise.all(members.filter(({ userId }) => userId !== actor.id).map(({ userId }) => notify(userId, "战队已解散", `${team.name} 已由队长解散`, "/me/teams")));
  await audit({ eventId: team.eventId, actorId: actor.id, action: "TEAM_DISSOLVED_BY_CAPTAIN", entityType: "team", entityId: teamId, detail: { reason } });
  revalidatePath("/me/teams");
  revalidatePath("/events");
  redirect(teamFeedbackPath("success", "战队已解散，所有成员已恢复为未编队状态"));
}
