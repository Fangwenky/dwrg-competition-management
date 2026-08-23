"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLogs, events, teamMembers, teams, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/permissions";
import { formString } from "@/lib/validation";
import { isValidRank } from "@/lib/ranks";
import { removeAssetIfUnused, storeImage } from "@/lib/media";
import { publicErrorMessage } from "@/lib/public-error";

export type MediaState = { error?: string; success?: string };

function formFile(formData: FormData) {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function updateAvatar(_state: MediaState, formData: FormData): Promise<MediaState> {
  const user = await requireUser();
  const file = formFile(formData);
  if (!file) return { error: "请选择头像图片" };
  let asset: Awaited<ReturnType<typeof storeImage>> | null = null;
  try {
    asset = await storeImage({ file, purpose: "PLAYER_AVATAR", uploadedBy: user.id });
    await db.transaction(async (tx) => {
      const updated = await tx.update(users).set({ avatarAssetId: asset!.id, updatedAt: new Date() }).where(and(
        eq(users.id, user.id),
        user.avatarAssetId ? eq(users.avatarAssetId, user.avatarAssetId) : isNull(users.avatarAssetId)
      )).returning({ id: users.id });
      if (!updated.length) throw new Error("头像已被其他操作更新，请刷新后重试");
      await tx.insert(auditLogs).values({ actorId: user.id, action: "PLAYER_AVATAR_UPDATED", entityType: "user", entityId: user.id, detail: { previousAssetId: user.avatarAssetId, assetId: asset!.id } });
    });
    await removeAssetIfUnused(user.avatarAssetId).catch(() => undefined);
    revalidatePath("/me");
    return { success: "头像已更新" };
  } catch (error) {
    if (asset) await removeAssetIfUnused(asset.id).catch(() => undefined);
    return { error: publicErrorMessage(error, "头像上传失败，请检查图片后重试") };
  }
}

export async function removeAvatar(): Promise<MediaState> {
  const user = await requireUser();
  if (!user.avatarAssetId) return { error: "当前没有可移除的头像" };
  const removed = await db.transaction(async (tx) => {
    const rows = await tx.update(users).set({ avatarAssetId: null, updatedAt: new Date() }).where(and(eq(users.id, user.id), eq(users.avatarAssetId, user.avatarAssetId!))).returning({ id: users.id });
    if (!rows.length) return false;
    await tx.insert(auditLogs).values({ actorId: user.id, action: "PLAYER_AVATAR_REMOVED", entityType: "user", entityId: user.id, detail: { assetId: user.avatarAssetId } });
    return true;
  });
  if (!removed) return { error: "头像状态已变化，请刷新后重试" };
  await removeAssetIfUnused(user.avatarAssetId).catch(() => undefined);
  revalidatePath("/me");
  return { success: "头像已移除，现已恢复昵称首字占位" };
}

export async function updatePlayerProfile(_state: MediaState, formData: FormData): Promise<MediaState> {
  const user = await requireUser();
  const displayName = formString(formData, "displayName").slice(0, 32);
  const gameNickname = formString(formData, "gameNickname").slice(0, 32);
  const gameUid = formString(formData, "gameUid");
  const survivorRank = formString(formData, "survivorRank").slice(0, 32);
  const hunterRank = formString(formData, "hunterRank").slice(0, 32);
  if (displayName.length < 2 || !gameNickname || !/^\d{5,20}$/.test(gameUid) || !isValidRank("SURVIVOR", survivorRank) || !isValidRank("HUNTER", hunterRank)) return { error: "请填写完整资料并选择有效的双阵营最高段位" };
  const file = formFile(formData);
  let screenshotAssetId = user.rankScreenshotAssetId;
  let newAsset: Awaited<ReturnType<typeof storeImage>> | null = null;
  try {
    if (file) {
      newAsset = await storeImage({ file, purpose: "RANK_SCREENSHOT", uploadedBy: user.id });
      screenshotAssetId = newAsset.id;
    }
    if (!screenshotAssetId) return { error: "请上传能够显示段位或战绩的游戏界面截图" };
    await db.transaction(async (tx) => {
      const profileCondition = file
        ? and(eq(users.id, user.id), user.rankScreenshotAssetId ? eq(users.rankScreenshotAssetId, user.rankScreenshotAssetId) : isNull(users.rankScreenshotAssetId))
        : eq(users.id, user.id);
      const updated = await tx.update(users).set({ displayName, gameNickname, gameUid, survivorRank, hunterRank, rankScreenshotAssetId: screenshotAssetId, updatedAt: new Date() }).where(profileCondition).returning({ id: users.id });
      if (!updated.length) throw new Error("资料已被其他操作更新，请刷新后重试");
      await tx.update(teamMembers).set({ gameNickname }).where(eq(teamMembers.userId, user.id));
      await tx.insert(auditLogs).values({ actorId: user.id, action: "PLAYER_PROFILE_UPDATED", entityType: "user", entityId: user.id, detail: file ? { previousAssetId: user.rankScreenshotAssetId, assetId: screenshotAssetId } : {} });
    });
    if (file) await removeAssetIfUnused(user.rankScreenshotAssetId).catch(() => undefined);
    revalidatePath("/me");
    revalidatePath("/me/profile");
    revalidatePath("/me/applications");
    return { success: "个人竞技资料已保存，后续报名将自动使用这些信息" };
  } catch (error) {
    if (newAsset) await removeAssetIfUnused(newAsset.id).catch(() => undefined);
    return { error: error instanceof Error && error.message.includes("users_game_uid_unique") ? "该游戏 UID 已被其他账号使用" : publicErrorMessage(error, "个人资料保存失败，请刷新后重试") };
  }
}

export async function updateTeamProfile(_state: MediaState, formData: FormData): Promise<MediaState> {
  const user = await requireUser();
  const teamId = formString(formData, "teamId");
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team || (team.captainId !== user.id && !await canManageEvent(user, team.eventId))) return { error: "无权修改该战队资料" };
  const [event] = await db.select({ status: events.status }).from(events).where(eq(events.id, team.eventId)).limit(1);
  if (!event || ["COMPLETED", "ARCHIVED"].includes(event.status)) return { error: "赛事已结束或归档，战队资料处于只读状态" };
  const file = formFile(formData);
  let assetId = team.logoAssetId;
  let newAsset: Awaited<ReturnType<typeof storeImage>> | null = null;
  try {
    if (file) {
      newAsset = await storeImage({ file, purpose: "TEAM_LOGO", uploadedBy: user.id });
      assetId = newAsset.id;
    }
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${team.eventId}`}))`);
      const [currentEvent] = await tx.select({ status: events.status }).from(events).where(eq(events.id, team.eventId)).limit(1);
      if (!currentEvent || ["COMPLETED", "ARCHIVED"].includes(currentEvent.status)) throw new Error("赛事已结束或归档，战队资料处于只读状态");
      const teamCondition = file
        ? and(eq(teams.id, teamId), eq(teams.eventId, team.eventId), team.logoAssetId ? eq(teams.logoAssetId, team.logoAssetId) : isNull(teams.logoAssetId))
        : and(eq(teams.id, teamId), eq(teams.eventId, team.eventId));
      const updated = await tx.update(teams).set({
        logoAssetId: assetId,
        description: formString(formData, "description").slice(0, 600),
        slogan: formString(formData, "slogan").slice(0, 100),
        updatedAt: new Date()
      }).where(teamCondition).returning({ id: teams.id });
      if (!updated.length) throw new Error("战队资料已被其他操作更新，请刷新后重试");
      await tx.insert(auditLogs).values({ eventId: team.eventId, actorId: user.id, action: "TEAM_PROFILE_UPDATED", entityType: "team", entityId: team.id, detail: file ? { previousAssetId: team.logoAssetId, assetId } : {} });
    });
    if (file) await removeAssetIfUnused(team.logoAssetId).catch(() => undefined);
    revalidatePath("/me/teams");
    revalidatePath(`/events`);
    return { success: "战队公开资料已更新" };
  } catch (error) {
    if (newAsset) await removeAssetIfUnused(newAsset.id).catch(() => undefined);
    return { error: publicErrorMessage(error, "战队资料更新失败，请刷新后重试") };
  }
}

export async function removeTeamLogo(_state: MediaState, formData: FormData): Promise<MediaState> {
  const user = await requireUser();
  const teamId = formString(formData, "teamId");
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team || (team.captainId !== user.id && !await canManageEvent(user, team.eventId))) return { error: "无权修改该战队资料" };
  const [event] = await db.select({ status: events.status }).from(events).where(eq(events.id, team.eventId)).limit(1);
  if (!event || ["COMPLETED", "ARCHIVED"].includes(event.status)) return { error: "赛事已结束或归档，战队资料处于只读状态" };
  if (!team.logoAssetId) return { error: "当前没有可移除的队徽" };
  const removed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${team.eventId}`}))`);
    const [currentEvent] = await tx.select({ status: events.status }).from(events).where(eq(events.id, team.eventId)).limit(1);
    if (!currentEvent || ["COMPLETED", "ARCHIVED"].includes(currentEvent.status)) return false;
    const rows = await tx.update(teams).set({ logoAssetId: null, updatedAt: new Date() }).where(and(eq(teams.id, teamId), eq(teams.logoAssetId, team.logoAssetId!))).returning({ id: teams.id });
    if (!rows.length) return false;
    await tx.insert(auditLogs).values({ eventId: team.eventId, actorId: user.id, action: "TEAM_LOGO_REMOVED", entityType: "team", entityId: team.id, detail: { assetId: team.logoAssetId } });
    return true;
  });
  if (!removed) return { error: "队徽状态已变化，请刷新后重试" };
  await removeAssetIfUnused(team.logoAssetId).catch(() => undefined);
  revalidatePath("/me/teams");
  revalidatePath("/events");
  return { success: "队徽已移除，现已恢复战队缩写占位" };
}

export async function updateMemberProfile(_state: MediaState, formData: FormData): Promise<MediaState> {
  const user = await requireUser();
  const memberId = formString(formData, "memberId");
  const { teamMembers } = await import("@/lib/db/schema");
  const [member] = await db.select().from(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.userId, user.id))).limit(1);
  if (!member) return { error: "未找到赛事成员档案" };
  const [event] = await db.select({ status: events.status }).from(events).where(eq(events.id, member.eventId)).limit(1);
  if (!event || ["COMPLETED", "ARCHIVED"].includes(event.status)) return { error: "赛事已结束或归档，成员档案处于只读状态" };
  const specialty = formString(formData, "specialty") as "SURVIVOR" | "HUNTER" | "FLEX";
  if (!["SURVIVOR", "HUNTER", "FLEX"].includes(specialty)) return { error: "请选择有效的阵营专长" };
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${member.eventId}`}))`);
      const [currentEvent] = await tx.select({ status: events.status }).from(events).where(eq(events.id, member.eventId)).limit(1);
      if (!currentEvent || ["COMPLETED", "ARCHIVED"].includes(currentEvent.status)) throw new Error("赛事已结束或归档，成员档案处于只读状态");
      await tx.update(teamMembers).set({
        gameNickname: formString(formData, "gameNickname").slice(0, 32),
        publicBio: formString(formData, "publicBio").slice(0, 300),
        specialty
      }).where(eq(teamMembers.id, memberId));
      await tx.insert(auditLogs).values({ eventId: member.eventId, actorId: user.id, action: "MEMBER_PUBLIC_PROFILE_UPDATED", entityType: "user", entityId: user.id, detail: { memberId, teamId: member.teamId } });
    });
  } catch (error) {
    return { error: publicErrorMessage(error, "成员档案更新失败，请刷新后重试") };
  }
  revalidatePath("/me/teams");
  return { success: "赛事公开档案已更新" };
}

export async function updateEventHero(_state: MediaState, formData: FormData): Promise<MediaState> {
  const user = await requireUser();
  const eventId = formString(formData, "eventId");
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || !await canManageEvent(user, eventId)) return { error: "无权修改该赛事封面" };
  if (["COMPLETED", "ARCHIVED"].includes(event.status)) return { error: "赛事已结束或归档，赛事封面处于只读状态" };
  const file = formFile(formData);
  if (!file) return { error: "请选择赛事封面图片" };
  const creditText = formString(formData, "creditText").slice(0, 200);
  if (!creditText || formString(formData, "rightsConfirmed") !== "yes") return { error: "请填写素材署名并确认拥有使用权" };
  const sourceUrl = formString(formData, "sourceUrl").slice(0, 500);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return { error: "素材来源必须是完整的 HTTP(S) 地址" };
  let asset: Awaited<ReturnType<typeof storeImage>> | null = null;
  try {
    asset = await storeImage({ file, purpose: "EVENT_HERO", uploadedBy: user.id, creditText, sourceUrl });
    const focalX = Math.min(100, Math.max(0, Number(formString(formData, "focalX")) || 50));
    const focalY = Math.min(100, Math.max(0, Number(formString(formData, "focalY")) || 50));
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${eventId}`}))`);
      const [currentEvent] = await tx.select({ status: events.status }).from(events).where(eq(events.id, eventId)).limit(1);
      if (!currentEvent || ["COMPLETED", "ARCHIVED"].includes(currentEvent.status)) throw new Error("赛事已结束或归档，赛事封面处于只读状态");
      const updated = await tx.update(events).set({ heroAssetId: asset!.id, heroFocalX: focalX, heroFocalY: focalY, updatedAt: new Date() }).where(and(
        eq(events.id, eventId),
        event.heroAssetId ? eq(events.heroAssetId, event.heroAssetId) : isNull(events.heroAssetId)
      )).returning({ id: events.id });
      if (!updated.length) throw new Error("赛事封面已被其他操作更新，请刷新后重试");
      await tx.insert(auditLogs).values({ eventId, actorId: user.id, action: "EVENT_HERO_UPDATED", entityType: "event", entityId: eventId, detail: { creditText, sourceUrl, previousAssetId: event.heroAssetId, assetId: asset!.id } });
    });
    await removeAssetIfUnused(event.heroAssetId).catch(() => undefined);
    revalidatePath(`/events/${event.slug}`);
    revalidatePath(`/ops/${eventId}`);
    return { success: "赛事封面已更新" };
  } catch (error) {
    if (asset) await removeAssetIfUnused(asset.id).catch(() => undefined);
    return { error: publicErrorMessage(error, "赛事封面上传失败，请检查图片后重试") };
  }
}

export async function removeEventHero(_state: MediaState, formData: FormData): Promise<MediaState> {
  const user = await requireUser();
  const eventId = formString(formData, "eventId");
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || !await canManageEvent(user, eventId)) return { error: "无权修改该赛事封面" };
  if (["COMPLETED", "ARCHIVED"].includes(event.status)) return { error: "赛事已结束或归档，赛事封面处于只读状态" };
  if (!event.heroAssetId) return { error: "当前没有可移除的赛事封面" };
  const removed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${eventId}`}))`);
    const [currentEvent] = await tx.select({ status: events.status }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!currentEvent || ["COMPLETED", "ARCHIVED"].includes(currentEvent.status)) return false;
    const rows = await tx.update(events).set({ heroAssetId: null, heroFocalX: 50, heroFocalY: 50, updatedAt: new Date() }).where(and(eq(events.id, eventId), eq(events.heroAssetId, event.heroAssetId!))).returning({ id: events.id });
    if (!rows.length) return false;
    await tx.insert(auditLogs).values({ eventId, actorId: user.id, action: "EVENT_HERO_REMOVED", entityType: "event", entityId: eventId, detail: { assetId: event.heroAssetId } });
    return true;
  });
  if (!removed) return { error: "赛事封面状态已变化，请刷新后重试" };
  await removeAssetIfUnused(event.heroAssetId).catch(() => undefined);
  revalidatePath(`/events/${event.slug}`);
  revalidatePath(`/ops/${eventId}`);
  return { success: "赛事封面已移除，现已恢复默认原创纹理" };
}
