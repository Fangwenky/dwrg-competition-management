import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Search, UserRoundCog } from "lucide-react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { EmptyState } from "@/components/ui";
import { requirePageAdmin } from "@/lib/auth";

type Params = { q?: string; role?: string; status?: string; page?: string; error?: string; success?: string };
const PAGE_SIZE = 50;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAdmin("/admin/users");
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const role = ["USER", "ADMIN"].includes(params.role ?? "") ? params.role : "";
  const status = ["ACTIVE", "DISABLED", "MUST_CHANGE"].includes(params.status ?? "") ? params.status : "";
  const conditions = [
    query ? or(ilike(users.username, `%${query}%`), ilike(users.displayName, `%${query}%`), ilike(users.gameNickname, `%${query}%`), ilike(users.gameUid, `%${query}%`)) : undefined,
    role ? eq(users.role, role as "USER" | "ADMIN") : undefined,
    status === "DISABLED" ? eq(users.disabled, true) : status === "MUST_CHANGE" ? and(eq(users.disabled, false), eq(users.mustChangePassword, true)) : status === "ACTIVE" ? and(eq(users.disabled, false), eq(users.mustChangePassword, false)) : undefined
  ].filter(Boolean);
  const where = and(...conditions);
  const total = await db.$count(users, where);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const page = Math.min(requestedPage, totalPages);
  const items = await db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  const pageHref = (targetPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (role) search.set("role", role);
    if (status) search.set("status", status);
    if (targetPage > 1) search.set("page", String(targetPage));
    const value = search.toString();
    return value ? `/admin/users?${value}` : "/admin/users";
  };

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">USER REGISTRY</p><h2 className="section-title mt-2">用户档案</h2><p className="mt-2 text-sm text-[#61584c]">查询全部账号状态，进入账号档案后进行安全处置与权限管理。</p></div><span className="badge border-line">共 {total} 个 · 第 {page}/{totalPages} 页</span></div>
    {(params.error || params.success) && <p role={params.error ? "alert" : "status"} aria-live={params.error ? "assertive" : "polite"} className={`mt-5 border px-4 py-3 text-sm ${params.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`}>{params.error ?? params.success}</p>}
    <form className="mt-5 grid gap-3 border border-line bg-[#f8f3e9] p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]" method="get">
      <div><label className="label" htmlFor="user-search">搜索账号</label><input className="input" id="user-search" name="q" defaultValue={query} placeholder="用户名、昵称、游戏 UID" /></div>
      <div><label className="label" htmlFor="user-role">全局身份</label><select className="input" id="user-role" name="role" defaultValue={role}><option value="">全部身份</option><option value="ADMIN">全局管理员</option><option value="USER">注册用户</option></select></div>
      <div><label className="label" htmlFor="user-status">账号状态</label><select className="input" id="user-status" name="status" defaultValue={status}><option value="">全部状态</option><option value="ACTIVE">正常</option><option value="MUST_CHANGE">需修改密码</option><option value="DISABLED">已停用</option></select></div>
      <button className="button-secondary self-end"><Search size={17} />筛选</button>
    </form>
    {items.length ? <>
      <div className="mt-5 hidden overflow-visible border border-line lg:block"><table className="w-full bg-[#f8f3e9] text-left text-sm"><thead className="bg-parchment"><tr><th className="p-3">用户</th><th className="p-3">竞技资料</th><th className="p-3">全局身份</th><th className="p-3">状态</th><th className="w-[150px] p-3">操作</th></tr></thead><tbody>{items.map((user) => <tr className="border-t border-line align-middle" key={user.id}><td className="p-3"><strong>{user.displayName}</strong><div className="text-xs text-[#6d6458]">@{user.username}</div></td><td className="p-3"><span>{user.gameNickname || "未填写游戏昵称"}</span><div className="text-xs text-[#6d6458]">UID {user.gameUid || "未填写"}</div></td><td className="p-3">{user.role === "ADMIN" ? "全局管理员" : "注册用户"}</td><td className="p-3"><span className={`badge ${user.disabled ? "border-danger/50 bg-[#f3dedd] text-danger" : "border-[#4f725f] bg-[#dfe9df] text-[#284636]"}`}>{user.disabled ? "已停用" : user.mustChangePassword ? "需改密" : "正常"}</span></td><td className="p-3"><Link className="button-secondary" href={`/admin/users/${user.id}`}><UserRoundCog size={17} />管理账号</Link></td></tr>)}</tbody></table></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:hidden">{items.map((user) => <article className="card" key={user.id}><div className="flex items-start justify-between gap-3"><div><strong>{user.displayName}</strong><div className="text-xs text-[#6d6458]">@{user.username}</div></div><span className={`badge ${user.disabled ? "border-danger/50 bg-[#f3dedd] text-danger" : "border-[#4f725f] bg-[#dfe9df] text-[#284636]"}`}>{user.disabled ? "已停用" : user.mustChangePassword ? "需改密" : "正常"}</span></div><dl className="my-4 grid grid-cols-2 gap-3 border-y border-line py-3 text-sm"><div><dt className="data-label">全局身份</dt><dd>{user.role === "ADMIN" ? "管理员" : "注册用户"}</dd></div><div><dt className="data-label">游戏昵称</dt><dd>{user.gameNickname || "未填写"}</dd></div></dl><Link className="button-secondary w-full" href={`/admin/users/${user.id}`}><UserRoundCog size={17} />查看并管理</Link></article>)}</div>
      {totalPages > 1 && <nav className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5" aria-label="用户档案分页">{page > 1 ? <Link className="button-secondary" href={pageHref(page - 1)}>上一页</Link> : <span className="button-secondary cursor-not-allowed opacity-50" aria-disabled="true">上一页</span>}<span className="text-sm text-[#5d687d]">显示第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 条</span>{page < totalPages ? <Link className="button-secondary" href={pageHref(page + 1)}>下一页</Link> : <span className="button-secondary cursor-not-allowed opacity-50" aria-disabled="true">下一页</span>}</nav>}
    </> : <div className="mt-5"><EmptyState title="没有匹配的账号" description="请调整搜索关键词或筛选条件后重试。" action={<Link className="button-secondary" href="/admin/users">清除筛选</Link>} /></div>}
  </div>;
}
