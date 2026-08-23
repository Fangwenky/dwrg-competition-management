import Link from "next/link";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { ArchiveRestore, CalendarDays, ExternalLink, Search, Settings2, Trophy } from "lucide-react";
import { db } from "@/lib/db";
import { eventRoleGrants, events, matches, teams, users } from "@/lib/db/schema";
import { EventCreateForm } from "@/components/forms";
import { grantEventManager, revokeEventManager, setEventArchived } from "@/app/actions/ops";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { EmptyState, StatusBadge } from "@/components/ui";
import { EVENT_MODE_LABELS } from "@/lib/constants";
import { requirePageAdmin } from "@/lib/auth";
import { FormSubmitButton } from "@/components/form-submit-button";

type Params = { q?: string; status?: string; mode?: string; page?: string; error?: string; success?: string };
const PAGE_SIZE = 20;
const EVENT_STATUSES = ["DRAFT", "REGISTRATION", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;
const EVENT_MODES = ["PLAYER_TEAMS", "ADMIN_TEAMS", "INDIVIDUAL"] as const;

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAdmin("/admin/events");
  const params = await searchParams;
  const query = String(params.q ?? "").trim().slice(0, 80);
  const status = EVENT_STATUSES.includes(params.status as typeof EVENT_STATUSES[number]) ? params.status as typeof EVENT_STATUSES[number] : "";
  const mode = EVENT_MODES.includes(params.mode as typeof EVENT_MODES[number]) ? params.mode as typeof EVENT_MODES[number] : "";
  const where = and(
    query ? or(ilike(events.name, `%${query}%`), ilike(events.slug, `%${query}%`), ilike(events.tagline, `%${query}%`)) : undefined,
    status ? eq(events.status, status) : undefined,
    mode ? eq(events.mode, mode) : undefined
  );
  const total = await db.$count(events, where);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);
  const page = Math.min(requestedPage, totalPages);
  const items = await db.select({
    event: events,
    teamCount: sql<number>`(select count(*)::int from ${teams} where ${teams.eventId} = ${events.id})`,
    matchCount: sql<number>`(select count(*)::int from ${matches} where ${matches.eventId} = ${events.id})`
  }).from(events).where(where).orderBy(desc(events.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  const eventIds = items.map(({ event }) => event.id);
  const managerRows = eventIds.length ? await db.select({
    eventId: eventRoleGrants.eventId,
    userId: users.id,
    username: users.username,
    displayName: users.displayName,
    disabled: users.disabled
  }).from(eventRoleGrants).innerJoin(users, eq(users.id, eventRoleGrants.userId)).where(and(eq(eventRoleGrants.role, "EVENT_MANAGER"), inArray(eventRoleGrants.eventId, eventIds))) : [];
  const managersByEvent = new Map<string, typeof managerRows>();
  for (const manager of managerRows) managersByEvent.set(manager.eventId, [...(managersByEvent.get(manager.eventId) ?? []), manager]);

  const hrefForPage = (targetPage?: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (status) search.set("status", status);
    if (mode) search.set("mode", mode);
    if (targetPage && targetPage > 1) search.set("page", String(targetPage));
    const value = search.toString();
    return value ? `/admin/events?${value}` : "/admin/events";
  };
  const returnTo = hrefForPage(page);
  const publicStatuses = new Set(["REGISTRATION", "ACTIVE", "COMPLETED"]);

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">EVENT REGISTRY</p><h2 className="section-title mt-2">赛事档案索引</h2><p className="mt-2 text-sm text-[#61584c]">检索全部赛事、进入工作台、维护授权并管理公开生命周期。</p></div>
      <span className="badge border-line">共 {total} 项 · 第 {page}/{totalPages} 页</span>
    </div>
    {(params.error || params.success) && <p role={params.error ? "alert" : "status"} aria-live={params.error ? "assertive" : "polite"} className={`mt-5 border px-4 py-3 text-sm font-semibold ${params.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`}>{params.error ?? params.success}</p>}

    <details className="mt-6 border border-line bg-[#f8f3e9] p-4" open={total === 0}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-display text-xl font-bold"><span className="flex items-center gap-2"><Trophy className="text-gold" size={21} />创建新赛事</span><span className="text-sm font-normal text-plum">展开创建表单</span></summary>
      <div className="mt-5 border-t border-line pt-5"><EventCreateForm /></div>
    </details>

    <form className="mt-6 grid gap-3 border border-line bg-[#eef1f7] p-4 md:grid-cols-[minmax(220px,1fr)_180px_210px_auto]" method="get">
      <div><label className="label" htmlFor="event-search">搜索赛事</label><input className="input" id="event-search" name="q" defaultValue={query} placeholder="赛事名称、网址标识或说明" /></div>
      <div><label className="label" htmlFor="event-status">赛事状态</label><select className="input" id="event-status" name="status" defaultValue={status}><option value="">全部状态</option><option value="DRAFT">草稿</option><option value="REGISTRATION">报名中</option><option value="ACTIVE">进行中</option><option value="COMPLETED">已结束</option><option value="ARCHIVED">已归档</option></select></div>
      <div><label className="label" htmlFor="event-mode">编制方式</label><select className="input" id="event-mode" name="mode" defaultValue={mode}><option value="">全部方式</option><option value="PLAYER_TEAMS">玩家自由组队</option><option value="ADMIN_TEAMS">管理员统一编队</option><option value="INDIVIDUAL">个人报名与排赛</option></select></div>
      <button className="button-secondary self-end"><Search size={17} />筛选</button>
    </form>

    {items.length ? <>
      <div className="mt-6 space-y-5">{items.map(({ event, teamCount, matchCount }, index) => {
        const managers = managersByEvent.get(event.id) ?? [];
        return <article className="card relative overflow-hidden" key={event.id}>
          <span className="absolute left-0 top-0 grid h-full w-9 place-items-center bg-[#172137] font-data text-xs font-bold tracking-[.15em] text-[#d4b279] [writing-mode:vertical-rl]">FILE {String((page - 1) * PAGE_SIZE + index + 1).padStart(3, "0")}</span>
          <div className="pl-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0"><span className="data-label">/{event.slug} · {EVENT_MODE_LABELS[event.mode]}</span><h3 className="mt-1 font-display text-3xl font-bold">{event.name}</h3><p className="mt-2 line-clamp-2 text-sm text-[#5d687d]">{event.tagline || "尚未填写赛事说明"}</p></div>
              <StatusBadge status={event.status} />
            </div>
            <dl className="mt-5 grid gap-3 border-y border-line py-4 text-sm sm:grid-cols-3">
              <div><dt className="data-label">赛事时间</dt><dd className="mt-1 flex items-center gap-2"><CalendarDays size={15} />{event.eventStart ? event.eventStart.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "待确定"}</dd></div>
              <div><dt className="data-label">战队档案</dt><dd className="mt-1 font-semibold">{event.mode === "INDIVIDUAL" ? "不使用固定战队" : `${teamCount} 支`}</dd></div>
              <div><dt className="data-label">比赛记录</dt><dd className="mt-1 font-semibold">{matchCount} 场</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2"><Link className="button-primary" href={`/ops/${event.id}`}><Settings2 size={17} />进入工作台</Link>{publicStatuses.has(event.status) && <Link className="button-secondary" href={`/events/${event.slug}`}><ExternalLink size={17} />查看公开页</Link>}</div>

            <section className="mt-5 border-t border-line pt-5" aria-labelledby={`event-managers-${event.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-display text-lg font-bold" id={`event-managers-${event.id}`}>赛事管理员</h4><span className="data-label">当前 {managers.length} 人</span></div>
              {managers.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{managers.map((manager) => <div className="flex min-h-14 items-center justify-between gap-3 border border-line bg-parchment/45 px-3 py-2" key={manager.userId}><div className="min-w-0"><strong className="block truncate">{manager.displayName}</strong><span className="text-xs text-[#5d687d]">@{manager.username}{manager.disabled ? " · 已停用" : ""}</span></div><form action={revokeEventManager}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="userId" value={manager.userId} /><input type="hidden" name="returnTo" value={returnTo} /><ConfirmSubmitButton className="button-danger shrink-0" message={`确认取消 ${manager.displayName} 在“${event.name}”中的赛事管理员权限？该用户的其他赛事身份不会受到影响。`}>取消授权</ConfirmSubmitButton></form></div>)}</div> : <p className="mt-3 text-sm text-[#5d687d]">尚未授权专属赛事管理员；全局管理员仍可管理该赛事。</p>}
              <form action={grantEventManager} className="mt-4 flex flex-wrap gap-2"><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={returnTo} /><label className="sr-only" htmlFor={`manager-${event.id}`}>赛事管理员用户名</label><input className="input min-w-[220px] flex-1" id={`manager-${event.id}`} name="username" placeholder={event.status === "ARCHIVED" ? "恢复赛事后可新增授权" : "输入用户名授予赛事管理员"} disabled={event.status === "ARCHIVED"} spellCheck={false} required /><FormSubmitButton className="button-secondary" pendingLabel="正在授权…" disabled={event.status === "ARCHIVED"}>{event.status === "ARCHIVED" ? "赛事已归档" : "授予管理权限"}</FormSubmitButton></form>
            </section>

            <details className="mt-5 border-t border-danger/30 pt-4"><summary className="min-h-11 cursor-pointer font-semibold leading-[44px] text-danger"><ArchiveRestore className="mr-2 inline" size={17} />{event.status === "ARCHIVED" ? "恢复已归档赛事" : "归档赛事"}</summary><form action={setEventArchived} className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]"><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="archived" value={event.status === "ARCHIVED" ? "false" : "true"} /><input type="hidden" name="returnTo" value={returnTo} /><div><label className="label" htmlFor={`archive-reason-${event.id}`}>{event.status === "ARCHIVED" ? "恢复原因" : "归档原因"}</label><textarea className="input min-h-20" id={`archive-reason-${event.id}`} name="reason" maxLength={300} placeholder={event.status === "ARCHIVED" ? "说明为何恢复编辑" : "将通知赛事管理员，并从公开页面隐藏"} required /></div><ConfirmSubmitButton className={event.status === "ARCHIVED" ? "button-secondary self-end" : "button-danger self-end"} message={event.status === "ARCHIVED" ? `确认将“${event.name}”恢复为草稿吗？恢复后仍需在工作台重新选择公开状态。` : `确认归档“${event.name}”吗？赛事将立即从公开页面隐藏，战队名单会锁定。`}>{event.status === "ARCHIVED" ? "恢复为草稿" : "确认归档"}</ConfirmSubmitButton></form></details>
          </div>
        </article>;
      })}</div>
      {totalPages > 1 && <nav className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5" aria-label="赛事档案分页">{page > 1 ? <Link className="button-secondary" href={hrefForPage(page - 1)}>上一页</Link> : <span className="button-secondary pointer-events-none opacity-40" aria-disabled="true">上一页</span>}<span className="text-sm text-[#5d687d]">显示第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 项</span>{page < totalPages ? <Link className="button-secondary" href={hrefForPage(page + 1)}>下一页</Link> : <span className="button-secondary pointer-events-none opacity-40" aria-disabled="true">下一页</span>}</nav>}
    </> : <div className="mt-6"><EmptyState title="没有匹配的赛事" description="请调整搜索词或筛选条件；已归档赛事可通过状态筛选重新找到。" action={<Link className="button-secondary" href="/admin/events">清除筛选</Link>} /></div>}
  </div>;
}
