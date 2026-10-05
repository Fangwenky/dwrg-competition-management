import Link from "next/link";
import { ArrowRight, Check, Circle, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getUserWorkspace } from "@/lib/queries";
import { Metric, StatusBadge } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mediaUrl } from "@/lib/media";
import { SafeImage } from "@/components/safe-image";

export default async function MePage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const user = await requireUser();
  const { error, message } = await searchParams;
  const [workspace, avatarRows] = await Promise.all([
    getUserWorkspace(user.id),
    user.avatarAssetId ? db.select({ storageKey: mediaAssets.storageKey }).from(mediaAssets).where(eq(mediaAssets.id, user.avatarAssetId)).limit(1) : Promise.resolve([])
  ]);
  const avatarUrl = mediaUrl(avatarRows[0]?.storageKey);
  const unread = workspace.unreadNotificationCount;
  const pending = workspace.applications.filter(({ application }) => application.status === "PENDING").length;
  const pendingInvites = workspace.invites.filter((invite) => invite.status === "PENDING").length;
  const activeAssignments = workspace.assignments.filter(({ match }) => match.status !== "PUBLISHED");
  const profileChecks = [
    ["游戏 UID", Boolean(user.gameUid)],
    ["游戏内昵称", Boolean(user.gameNickname)],
    ["求生者段位", Boolean(user.survivorRank)],
    ["监管者段位", Boolean(user.hunterRank)],
    ["段位证明", Boolean(user.rankScreenshotAssetId)]
  ] as const;
  const completedFields = profileChecks.filter(([, complete]) => complete).length;
  const profileComplete = completedFields === profileChecks.length;
  const managedEvents = workspace.grants.filter(({ grant }) => grant.role === "EVENT_MANAGER");
  const nextAction = user.role === "ADMIN"
    ? { href: "/admin/events", label: "进入赛事管理", detail: "审核报名、编排赛程与发布赛果" }
    : managedEvents.length > 0
      ? { href: `/ops/${managedEvents[0].event.id}`, label: "进入赛事工作台", detail: `管理 ${managedEvents[0].event.name}` }
      : pendingInvites > 0
        ? { href: "/me/teams", label: "处理战队邀请", detail: `${pendingInvites} 项邀请等待确认` }
        : activeAssignments.length > 0
          ? { href: "/me/assignments", label: "查看近期工作指派", detail: `${activeAssignments.length} 场裁判或解说任务等待完成` }
          : pending > 0
            ? { href: "/me/applications", label: "查看报名审核进度", detail: `${pending} 项申请正在审核，无需重复提交` }
            : workspace.grants.length === 0
              ? { href: "/me/applications", label: "选择赛事与申请身份", detail: "选手、裁判和解说按需申请；仅选手需要竞技资料" }
              : { href: "/events", label: "浏览赛事档案", detail: "查看赛程、战队与已发布的比赛结果" };

  return <div className="space-y-8">
    {error === "forbidden" && <p role="alert" className="border border-danger/50 bg-[#f6e4e1] px-4 py-3 text-sm text-danger">当前账号没有执行该管理操作的权限。</p>}
    {error === "action-invalid" && <p role="alert" className="border border-danger/50 bg-[#f6e4e1] px-4 py-3 text-sm text-danger">{message || "操作对象不存在或状态已变化，请返回对应页面刷新后重试。"}</p>}
    <section className="workspace-cover">
      <div className="workspace-cover-content">
        <SafeImage className="workspace-avatar object-cover" src={avatarUrl} alt={`${user.displayName}的头像`} fallback={<div className="workspace-avatar" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</div>} />
        <div className="min-w-0">
          <p className="eyebrow text-[#c7b3de]">PERSONAL DOSSIER</p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight text-white md:text-5xl">个人赛事工作台</h1>
          <p className="mt-3 truncate text-sm text-[#cbd4e5]">{user.displayName} · @{user.username} · {user.role === "ADMIN" ? "全局管理员" : "注册用户"}</p>
        </div>
      </div>
      <div className="workspace-cover-stamp">档案在册</div>
    </section>

    {user.mustChangePassword && <div className="border-l-4 border-danger bg-[#f3dedd] p-5"><strong>需要更新密码。</strong> 你的密码由管理员创建或重置，请立即前往<Link className="ml-1 inline-flex min-h-11 items-center underline" href="/me/security">账号安全</Link>。</div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
      <Link className="next-action-card group" href={nextAction.href}>
        <span className="data-label text-[#7a6690]">NEXT ACTION / 下一步</span>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">{nextAction.label}</h2>
            <p className="mt-1 text-sm text-[#5d687d]">{nextAction.detail}</p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center border border-plum text-plum transition-colors group-hover:bg-plum group-hover:text-white"><ArrowRight size={19} /></span>
        </div>
      </Link>
      <section className="profile-progress-card" aria-labelledby="profile-progress-title">
        <div className="flex items-center justify-between gap-3">
          <div><span className="data-label">仅选手报名需要</span><h2 className="font-display text-xl font-bold" id="profile-progress-title">竞技资料完成度</h2></div>
          <strong className="font-data text-3xl text-plum">{completedFields}/{profileChecks.length}</strong>
        </div>
        <div className="mt-4 h-1.5 bg-[#d7deeb]" aria-hidden="true"><span className="block h-full bg-plum" style={{ width: `${completedFields / profileChecks.length * 100}%` }} /></div>
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-[#5d687d]">{profileChecks.map(([label, complete]) => <li className="flex items-center gap-1.5" key={label}>{complete ? <Check className="text-[#3f6b50]" size={14} /> : <Circle className="text-[#8c96a9]" size={12} />}{label}</li>)}</ul>
        <Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-plum underline" href="/me/profile">{profileComplete ? "维护竞技资料" : "完善选手资料"}</Link>
      </section>
    </div>

    <section className="workspace-metrics" aria-label="工作台摘要">
      <Metric label="有效身份" value={workspace.grants.length} detail="已获赛事授权" />
      <Metric label="待审申请" value={pending} detail="等待赛事方处理" />
      <Metric label="待办指派" value={activeAssignments.length} detail="未发布结果的任务" />
      <Metric label="未读通知" value={unread} detail="邀请与审核消息" />
    </section>

    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="eyebrow">EVENT IDENTITIES</p><h2 className="section-title mt-1">我的赛事身份</h2></div>
        <Link className="button-secondary" href="/me/applications">申请新身份 <ArrowRight size={16} /></Link>
      </div>
      {workspace.grants.length ? <div className="grid gap-4 md:grid-cols-2">{workspace.grants.map(({ grant, event }) => event.status === "ARCHIVED" && grant.role !== "EVENT_MANAGER" ? <div className="identity-pass opacity-75" key={`${grant.eventId}-${grant.role}`}>
        <div><span className="data-label">{event.name}</span><h3 className="mt-1 font-display text-2xl font-bold">{ROLE_LABELS[grant.role]}</h3></div><span className="badge border-line bg-[#ece8e1] text-[#6d6458]">赛事已归档</span>
      </div> : <Link className="identity-pass group" href={grant.role === "EVENT_MANAGER" ? `/ops/${event.id}` : `/events/${event.slug}`} key={`${grant.eventId}-${grant.role}`}>
        <div><span className="data-label">{event.name}</span><h3 className="mt-1 font-display text-2xl font-bold">{ROLE_LABELS[grant.role]}</h3></div>
        <div className="flex items-center gap-3"><StatusBadge status="APPROVED" /><ArrowRight className="text-plum transition-transform group-hover:translate-x-1" size={18} /></div>
      </Link>)}</div> : <div className="empty-guidance">
        <UserRound className="text-gold" size={28} />
        <div><h3 className="font-display text-xl font-bold">还没有生效的赛事身份</h3><p className="mt-1 text-sm text-[#5d687d]">先选择赛事和身份；只有报名选手时需要完善竞技资料。</p></div>
        <Link className="button-primary sm:ml-auto" href="/me/applications">选择赛事与身份</Link>
      </div>}
    </section>
  </div>;
}
