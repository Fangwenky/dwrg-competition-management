import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLogs, events, teams, users } from "@/lib/db/schema";
import { canManageEvent } from "@/lib/permissions";
import { mediaUrl, privateMediaUrl, removeAssetIfUnused, storeImage, type MediaPurpose } from "@/lib/media";
import { publicErrorMessage } from "@/lib/public-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (user.mustChangePassword) return Response.json({ error: "必须先修改临时密码" }, { status: 403 });
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL;
  if (expected && origin !== expected) return Response.json({ error: "来源校验失败" }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 6 * 1024 * 1024) return Response.json({ error: "上传内容不能超过 6MB" }, { status: 413 });

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "上传内容无法解析" }, { status: 400 });
  const file = form.get("file");
  const purpose = form.get("purpose") as MediaPurpose | null;
  if (!(file instanceof File)) return Response.json({ error: "未找到文件" }, { status: 400 });
  if (!purpose || !["EVENT_HERO", "TEAM_LOGO", "PLAYER_AVATAR", "RANK_SCREENSHOT"].includes(purpose)) return Response.json({ error: "缺少有效的图片用途" }, { status: 400 });

  const eventId = String(form.get("eventId") ?? "");
  const teamId = String(form.get("teamId") ?? "");
  const sourceUrl = String(form.get("sourceUrl") ?? "").trim();
  const creditText = String(form.get("creditText") ?? "").trim();
  let previousAssetId: string | null = null;
  let eventSlug: string | null = null;
  let targetEventId: string | null = null;

  if (purpose === "EVENT_HERO") {
    const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event || !await canManageEvent(user, eventId)) return Response.json({ error: "无权上传赛事封面" }, { status: 403 });
    if (["COMPLETED", "ARCHIVED"].includes(event.status)) return Response.json({ error: "赛事已结束或归档，赛事封面处于只读状态" }, { status: 409 });
    if (!creditText || form.get("rightsConfirmed") !== "yes") return Response.json({ error: "请填写素材署名并确认使用权" }, { status: 400 });
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return Response.json({ error: "素材来源必须是完整的 HTTP(S) 地址" }, { status: 400 });
    previousAssetId = event.heroAssetId;
    eventSlug = event.slug;
    targetEventId = event.id;
  } else if (purpose === "TEAM_LOGO") {
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team || (team.captainId !== user.id && !await canManageEvent(user, team.eventId))) return Response.json({ error: "无权上传战队队徽" }, { status: 403 });
    const [event] = await db.select({ status: events.status }).from(events).where(eq(events.id, team.eventId)).limit(1);
    if (!event || ["COMPLETED", "ARCHIVED"].includes(event.status)) return Response.json({ error: "赛事已结束或归档，战队资料处于只读状态" }, { status: 409 });
    previousAssetId = team.logoAssetId;
    targetEventId = team.eventId;
  } else {
    previousAssetId = purpose === "PLAYER_AVATAR" ? user.avatarAssetId : user.rankScreenshotAssetId;
  }

  let asset: Awaited<ReturnType<typeof storeImage>> | null = null;
  try {
    asset = await storeImage({ file, purpose, uploadedBy: user.id, creditText, sourceUrl });
    await db.transaction(async (tx) => {
      if (targetEventId) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-write:${targetEventId}`}))`);
        const [currentEvent] = await tx.select({ status: events.status }).from(events).where(eq(events.id, targetEventId)).limit(1);
        if (!currentEvent || ["COMPLETED", "ARCHIVED"].includes(currentEvent.status)) throw new Error("赛事已结束或归档，图片处于只读状态");
      }
      const expected = <T,>(column: T) => previousAssetId
        ? eq(column as Parameters<typeof eq>[0], previousAssetId)
        : isNull(column as Parameters<typeof isNull>[0]);
      let updated: Array<{ id: string }> = [];
      if (purpose === "PLAYER_AVATAR") updated = await tx.update(users).set({ avatarAssetId: asset!.id, updatedAt: new Date() }).where(and(eq(users.id, user.id), expected(users.avatarAssetId))).returning({ id: users.id });
      if (purpose === "RANK_SCREENSHOT") updated = await tx.update(users).set({ rankScreenshotAssetId: asset!.id, updatedAt: new Date() }).where(and(eq(users.id, user.id), expected(users.rankScreenshotAssetId))).returning({ id: users.id });
      if (purpose === "TEAM_LOGO") updated = await tx.update(teams).set({ logoAssetId: asset!.id, updatedAt: new Date() }).where(and(eq(teams.id, teamId), expected(teams.logoAssetId))).returning({ id: teams.id });
      if (purpose === "EVENT_HERO") updated = await tx.update(events).set({ heroAssetId: asset!.id, updatedAt: new Date() }).where(and(eq(events.id, eventId), expected(events.heroAssetId))).returning({ id: events.id });
      if (!updated.length) throw new Error("图片已被其他操作更新，请刷新页面后重试");
      await tx.insert(auditLogs).values({
        eventId: targetEventId,
        actorId: user.id,
        action: `${purpose}_UPDATED`,
        entityType: purpose === "EVENT_HERO" ? "event" : purpose === "TEAM_LOGO" ? "team" : "user",
        entityId: purpose === "EVENT_HERO" ? eventId : purpose === "TEAM_LOGO" ? teamId : user.id,
        detail: { previousAssetId, assetId: asset!.id }
      });
    });
    await removeAssetIfUnused(previousAssetId).catch(() => undefined);
    revalidatePath("/me", "layout");
    if (eventSlug) revalidatePath(`/events/${eventSlug}`);
    if (targetEventId) revalidatePath(`/ops/${targetEventId}`);
    return Response.json({ id: asset.id, url: purpose === "RANK_SCREENSHOT" ? privateMediaUrl(asset.id) : mediaUrl(asset.storageKey), width: asset.width, height: asset.height }, { status: 201 });
  } catch (error) {
    if (asset) await removeAssetIfUnused(asset.id).catch(() => undefined);
    return Response.json({ error: publicErrorMessage(error, "图片上传失败，请检查文件后重试") }, { status: 400 });
  }
}
