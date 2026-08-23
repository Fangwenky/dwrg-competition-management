import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requirePageUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/permissions";
import { db } from "@/lib/db";
import { eventRoleGrants, events } from "@/lib/db/schema";
import { EventSwitcher, OpsNav } from "@/components/workspace-nav";

export const dynamic = "force-dynamic";

export default async function OpsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const user = await requirePageUser(`/ops/${eventId}`);
  if (!await canManageEvent(user, eventId)) notFound();
  const [event, managedEvents] = await Promise.all([
    db.query.events.findFirst({ where: (item, { eq }) => eq(item.id, eventId) }),
    user.role === "ADMIN"
      ? db.select({ id: events.id, name: events.name }).from(events)
      : db.select({ id: events.id, name: events.name }).from(eventRoleGrants).innerJoin(events, eq(events.id, eventRoleGrants.eventId)).where(and(eq(eventRoleGrants.userId, user.id), eq(eventRoleGrants.role, "EVENT_MANAGER")))
  ]);
  if (!event) notFound();
  const archived = event.status === "ARCHIVED";
  const completed = event.status === "COMPLETED";
  const requestPath = (await headers()).get("x-dwrg-request-path")?.split("?")[0];
  const readOnly = archived || (completed && requestPath !== `/ops/${eventId}`);
  return <div className="page-wrap">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5"><div><span className="eyebrow">CURRENT EVENT</span><div className="flex flex-wrap items-center gap-3"><h1 className="font-display text-3xl font-bold">{event.name}</h1>{archived && <span className="status-badge border border-danger/40 bg-[#f6e4e1] text-danger">已归档 · 只读</span>}{completed && <span className="status-badge border border-gold bg-parchment text-ink">已结束 · 只读</span>}</div></div><EventSwitcher currentEventId={eventId} events={managedEvents} /></div>
    {readOnly && <p className="mb-5 border border-gold bg-parchment px-4 py-3 text-sm" role="status">{archived ? "归档赛事的页面和历史数据仍可查阅，但所有表单与操作按钮均已停用。全局管理员恢复赛事后才能继续编辑。" : "已结束赛事的历史数据仅供查阅。若需更正或继续编排，请返回赛事概览填写说明并重新开启。"}</p>}
    <div className="grid gap-7 lg:grid-cols-[240px_1fr]">
      <OpsNav eventId={eventId} />
      <fieldset className="min-w-0 border-0 p-0 disabled:opacity-90" disabled={readOnly} aria-label={readOnly ? "赛事只读内容" : undefined}>{children}</fieldset>
    </div>
  </div>;
}
