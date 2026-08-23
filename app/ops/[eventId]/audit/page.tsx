import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { EmptyState } from "@/components/ui";
import { auditActionLabel, auditDetailEntries, auditEntityLabel } from "@/lib/audit-labels";

const PAGE_SIZE = 50;

function AuditDetail({ detail }: { detail: Record<string, unknown> }) {
  const entries = auditDetailEntries(detail);
  if (!entries.length) return null;
  return <details className="mt-2"><summary className="min-h-11 cursor-pointer text-xs font-semibold leading-[44px] text-plum">查看操作详情</summary><dl className="grid gap-2 border-l-2 border-gold pl-3 text-xs">{entries.map((entry) => <div className="grid grid-cols-[100px_1fr] gap-2" key={entry.label}><dt className="text-[#6d6458]">{entry.label}</dt><dd className="break-words font-medium">{entry.value}</dd></div>)}</dl></details>;
}

export default async function AuditPage({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const q = String(query.q ?? "").trim().slice(0, 80);
  const requestedPage = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);
  const condition = and(
    eq(auditLogs.eventId, eventId),
    q ? or(ilike(users.displayName, `%${q}%`), ilike(auditLogs.action, `%${q}%`), ilike(auditLogs.entityId, `%${q}%`)) : undefined
  );
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId)).where(condition);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const logs = await db.select({ log: auditLogs, actor: users })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(condition)
    .orderBy(desc(auditLogs.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const pageHref = (nextPage: number) => `/ops/${eventId}/audit?${new URLSearchParams({ ...(q ? { q } : {}), page: String(nextPage) }).toString()}`;

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">AUDIT TRAIL</p><h2 className="section-title mt-2">审计记录</h2><p className="mt-2 text-sm text-[#61584c]">关键操作永久留痕，可按操作者、动作键或对象编号检索。</p></div><span className="badge border-line">共 {count} 条 · 第 {page}/{totalPages} 页</span></div>
    <form className="mt-6 flex flex-wrap gap-3" method="get"><label className="sr-only" htmlFor="audit-search">检索审计记录</label><input className="input min-w-[240px] flex-1" id="audit-search" name="q" defaultValue={q} placeholder="操作者、动作或对象编号" /><button className="button-secondary">检索</button>{q && <Link className="button-ghost" href={`/ops/${eventId}/audit`}>清除条件</Link>}</form>
    <div className="mt-7">{logs.length ? <>
      <div className="hidden overflow-x-auto border border-line md:block"><table className="w-full min-w-[760px] bg-[#f8f3e9] text-left text-sm"><thead className="bg-parchment"><tr><th className="p-3">时间</th><th className="p-3">操作者</th><th className="p-3">动作</th><th className="p-3">对象</th></tr></thead><tbody>{logs.map(({ log, actor }) => <tr className="border-t border-line align-top" key={log.id}><td className="whitespace-nowrap p-3">{log.createdAt.toLocaleString("zh-CN")}</td><td className="p-3">{actor?.displayName ?? "系统"}</td><td className="p-3"><strong>{auditActionLabel(log.action)}</strong><AuditDetail detail={log.detail} /></td><td className="p-3"><span className="badge border-line">{auditEntityLabel(log.entityType)}</span><span className="ml-2 font-mono text-xs text-[#6d6458]">{log.entityId.slice(0, 8)}</span></td></tr>)}</tbody></table></div>
      <ol className="space-y-3 md:hidden">{logs.map(({ log, actor }) => <li className="card" key={log.id}><div className="flex flex-wrap items-start justify-between gap-2"><strong>{auditActionLabel(log.action)}</strong><span className="badge border-line">{auditEntityLabel(log.entityType)}</span></div><p className="mt-2 text-sm">{actor?.displayName ?? "系统"}</p><p className="mt-1 text-xs text-[#6d6458]">{log.createdAt.toLocaleString("zh-CN")} · {log.entityId.slice(0, 8)}</p><AuditDetail detail={log.detail} /></li>)}</ol>
      <nav className="mt-5 flex items-center justify-between gap-3" aria-label="审计记录分页">{page > 1 ? <Link className="button-secondary" href={pageHref(page - 1)}>上一页</Link> : <span className="button-secondary pointer-events-none opacity-40" aria-disabled="true">上一页</span>}<span className="text-sm text-[#61584c]">第 {page} / {totalPages} 页</span>{page < totalPages ? <Link className="button-secondary" href={pageHref(page + 1)}>下一页</Link> : <span className="button-secondary pointer-events-none opacity-40" aria-disabled="true">下一页</span>}</nav>
    </> : <EmptyState title="没有匹配的审计记录" description={q ? "请调整检索条件后重试。" : "审核、授权、赛程与结果操作会自动记录。"} />}</div>
  </div>;
}
