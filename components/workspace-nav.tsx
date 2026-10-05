"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Bell, CalendarCheck2, ClipboardCheck, IdCard, KeyRound, LayoutDashboard, LibraryBig, ShieldCheck, Swords, Trophy, UserCog, UsersRound, Workflow } from "lucide-react";

const userLinks = [
  ["/me", "工作概览", LayoutDashboard], ["/me/profile", "个人资料", IdCard], ["/me/applications", "身份申请", ClipboardCheck], ["/me/teams", "我的战队", UsersRound],
  ["/me/assignments", "工作指派", CalendarCheck2], ["/me/notifications", "站内通知", Bell], ["/me/security", "账号安全", KeyRound]
] as const;

export function UserNav({ counts = {} }: { counts?: Partial<Record<"applications" | "assignments" | "notifications" | "teams", number>> }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentHref = userLinks.find(([href]) => href === "/me" ? pathname === href : pathname.startsWith(href))?.[0] ?? "/me";
  const countByHref: Record<string, number | undefined> = {
    "/me/applications": counts.applications,
    "/me/teams": counts.teams,
    "/me/assignments": counts.assignments,
    "/me/notifications": counts.notifications
  };
  return <aside className="user-rail h-fit">
    <div className="user-rail-heading">
      <span className="data-label text-[#aebbd1]">PERSONAL DESK</span>
      <strong>个人赛事工作台</strong>
    </div>
    <div className="workspace-mobile-nav lg:hidden"><label htmlFor="workspace-section">个人工作台 · 切换栏目</label><select id="workspace-section" value={currentHref} onChange={(event) => router.push(event.target.value)}>{userLinks.map(([href,label]) => <option value={href} key={href}>{label}{countByHref[href] ? ` · ${countByHref[href]} 项待处理` : ""}</option>)}</select></div>
    <nav className="user-rail-nav" aria-label="用户中心">{userLinks.map(([href,label,Icon]) => {
      const active = href === "/me" ? pathname === href : pathname.startsWith(href);
      const count = countByHref[href];
      return <Link className={clsx("user-rail-link", active && "user-rail-link-active")} href={href} aria-current={active ? "page" : undefined} key={href}>
        <Icon size={18} aria-hidden="true" />
        <span>{label}</span>
        {Boolean(count) && <span className="user-rail-count" aria-label={`${count} 项待处理`}>{count}</span>}
      </Link>;
    })}</nav>
  </aside>;
}

export function OpsNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const links = [["", "赛事概览", LayoutDashboard], ["applications", "报名审核", ClipboardCheck], ["teams", "战队管理", UsersRound], ["workflow", "流程编排", Workflow], ["matches", "比赛与结果", Swords], ["audit", "审计记录", ShieldCheck]] as const;
  return <aside className="card-dark h-fit p-3"><div className="mb-3 border-b border-white/10 px-3 pb-3"><span className="data-label text-[#ad9e8b]">OPERATIONS</span><div className="font-display text-xl font-bold">赛事工作台</div></div><nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1" aria-label="赛事运营">{links.map(([path,label,Icon]) => { const href = `/ops/${eventId}/${path}`; const active = path ? pathname.startsWith(href) : pathname === `/ops/${eventId}` || pathname === `${href}/`; return <Link className={clsx("flex min-h-11 items-center gap-3 border-l-2 px-3 text-sm font-semibold transition-colors", active ? "border-l-gold bg-white/10 text-white" : "border-l-transparent text-[#d7cdbd] hover:bg-white/10 hover:text-white")} href={href} aria-current={active ? "page" : undefined} key={path}><Icon size={18} />{label}</Link>; })}</nav></aside>;
}

export function EventSwitcher({ currentEventId, events }: { currentEventId: string; events: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  return <div><label className="data-label text-[#6e6253]" htmlFor="ops-event-switcher">当前赛事</label><select className="input mt-1 min-w-[240px]" id="ops-event-switcher" value={currentEventId} onChange={(event) => router.push(`/ops/${event.target.value}`)}>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}</select></div>;
}

export function AdminNav() {
  const pathname = usePathname();
  const links = [["/admin", "总览", LayoutDashboard], ["/admin/events", "赛事", Trophy], ["/admin/users", "用户", UserCog], ["/admin/catalog", "角色目录", LibraryBig]] as const;
  return <nav className="admin-nav" aria-label="全局管理">{links.map(([href, label, Icon]) => {
    const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
    return <Link className={clsx("admin-nav-link", active && "admin-nav-link-active")} href={href} aria-current={active ? "page" : undefined} key={href}><Icon size={17} />{label}</Link>;
  })}</nav>;
}
