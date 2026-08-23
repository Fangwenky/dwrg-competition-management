"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, safeNextPath } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { formString } from "@/lib/validation";

function refreshNotifications() {
  revalidatePath("/me", "layout");
}

export async function setNotificationRead(formData: FormData) {
  const user = await requireUser();
  const notificationId = formString(formData, "notificationId");
  const read = formString(formData, "read") === "true";
  await db.update(notifications).set({ read }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id)));
  refreshNotifications();
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  const updated = await db.update(notifications).set({ read: true }).where(and(eq(notifications.userId, user.id), eq(notifications.read, false))).returning({ id: notifications.id });
  refreshNotifications();
  redirect(`/me/notifications?success=${encodeURIComponent(updated.length ? `已将 ${updated.length} 条通知标为已读` : "当前没有未读通知")}`);
}

export async function deleteReadNotifications() {
  const user = await requireUser();
  const removed = await db.delete(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.read, true))).returning({ id: notifications.id });
  refreshNotifications();
  redirect(`/me/notifications?success=${encodeURIComponent(removed.length ? `已清理 ${removed.length} 条已读通知` : "当前没有可清理的已读通知")}`);
}

export async function openNotification(formData: FormData) {
  const user = await requireUser();
  const notificationId = formString(formData, "notificationId");
  const [note] = await db.select({ href: notifications.href }).from(notifications).where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id))).limit(1);
  if (!note) redirect("/me/notifications?error=" + encodeURIComponent("通知不存在或已被移除"));
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id)));
  refreshNotifications();
  redirect(safeNextPath(note.href ?? "", "/me/notifications"));
}
