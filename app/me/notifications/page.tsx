import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/ui";
import { deleteReadNotifications, markAllNotificationsRead, openNotification, setNotificationRead } from "@/app/actions/notifications";
import { and, eq } from "drizzle-orm";
import { notifications } from "@/lib/db/schema";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FormSubmitButton } from "@/components/form-submit-button";

const PAGE_SIZE = 30;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; page?: string }> }) {
  const [user, feedback] = await Promise.all([requireUser(), searchParams]);
  const requestedPage = Math.max(1, Number.parseInt(feedback.page ?? "1", 10) || 1);
  const [total, unread] = await Promise.all([
    db.$count(notifications, eq(notifications.userId, user.id)),
    db.$count(notifications, and(eq(notifications.userId, user.id), eq(notifications.read, false)))
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const notes = await db.query.notifications.findMany({
    where: (notification, { eq }) => eq(notification.userId, user.id),
    orderBy: (notification, { desc }) => desc(notification.createdAt),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE
  });

  return <div>
    <div className="workspace-page-intro flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">INBOX</p><h1 className="section-title mt-2">站内通知</h1><p className="mt-2 text-[#61584c]">打开详情时才标为已读，也可以逐条调整状态。</p></div>
      <div className="flex flex-wrap gap-2">{unread > 0 && <form action={markAllNotificationsRead}><FormSubmitButton className="button-secondary" pendingLabel="正在标记…">全部标为已读（{unread}）</FormSubmitButton></form>}{total - unread > 0 && <form action={deleteReadNotifications}><ConfirmSubmitButton className="button-danger" pendingLabel="正在清理…" message={`确定永久删除 ${total - unread} 条已读通知吗？此操作不会影响赛事和审核记录。`}>清理已读（{total - unread}）</ConfirmSubmitButton></form>}</div>
    </div>
    {(feedback.error || feedback.success) && <p className={`mt-5 border px-4 py-3 text-sm ${feedback.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`} role={feedback.error ? "alert" : "status"} aria-live={feedback.error ? "assertive" : "polite"}>{feedback.error ?? feedback.success}</p>}
    <div className="mt-7 space-y-3">{notes.length ? notes.map((note) => <article className={`card ${note.read ? "opacity-75" : "border-l-4 border-l-plum"}`} key={note.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="font-bold">{note.title}</h2>{!note.read && <span className="badge border-plum/30 bg-[#ece8f2] text-plum">未读</span>}</div><time className="mt-1 block text-xs text-[#746a5c]">{note.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</time></div><form action={setNotificationRead}><input type="hidden" name="notificationId" value={note.id} /><input type="hidden" name="read" value={note.read ? "false" : "true"} /><FormSubmitButton className="min-h-11 text-sm font-semibold text-plum underline" pendingLabel="正在更新…">标为{note.read ? "未读" : "已读"}</FormSubmitButton></form></div>
      <p className="mt-2 text-sm text-[#61584c]">{note.body}</p>
      {note.href && <form action={openNotification} className="mt-2"><input type="hidden" name="notificationId" value={note.id} /><FormSubmitButton className="inline-flex min-h-11 items-center text-sm font-semibold text-plum underline" pendingLabel="正在打开…">查看详情</FormSubmitButton></form>}
    </article>) : <EmptyState title="通知箱是空的" description="审核、邀请、排期和工作指派发生变化时，会在这里留下记录。" action={<Link className="button-secondary" href="/me">返回工作概览</Link>} />}</div>
    {totalPages > 1 && <nav className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5" aria-label="通知分页">{page > 1 ? <Link className="button-secondary" href={`/me/notifications?page=${page - 1}`}>上一页</Link> : <span className="button-secondary pointer-events-none opacity-40" aria-disabled="true">上一页</span>}<span className="text-sm text-[#61584c]">第 {page} / {totalPages} 页 · 共 {total} 条</span>{page < totalPages ? <Link className="button-secondary" href={`/me/notifications?page=${page + 1}`}>下一页</Link> : <span className="button-secondary pointer-events-none opacity-40" aria-disabled="true">下一页</span>}</nav>}
  </div>;
}
