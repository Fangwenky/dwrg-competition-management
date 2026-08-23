import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { Crown, LockKeyhole, LockOpen, ShieldCheck, UserMinus, UserPlus, UsersRound } from "lucide-react";
import {
  adminAddTeamMember,
  adminCreateTeam,
  adminDissolveTeam,
  adminRemoveTeamMember,
  reviewTeam,
  setTeamRosterLock
} from "@/app/actions/ops";
import { getEventTeams } from "@/lib/queries";
import { db } from "@/lib/db";
import { eventRoleGrants, events, teamMembers, users } from "@/lib/db/schema";
import { EmptyState, StatusBadge } from "@/components/ui";
import { TeamProfileForm } from "@/components/forms";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { EVENT_MODE_LABELS } from "@/lib/constants";
import { FormSubmitButton } from "@/components/form-submit-button";

export default async function OpsTeamsPage({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { eventId } = await params;
  const [feedback, items, event] = await Promise.all([
    searchParams,
    getEventTeams(eventId),
    db.query.events.findFirst({ where: eq(events.id, eventId) })
  ]);
  if (!event) notFound();

  const teamIds = items.map(({ team }) => team.id);
  const roster = teamIds.length
    ? await db.select({ member: teamMembers, user: users }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(inArray(teamMembers.teamId, teamIds))
    : [];
  const approvedPlayers = await db.select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(eventRoleGrants)
    .innerJoin(users, eq(users.id, eventRoleGrants.userId))
    .where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.role, "PLAYER"), eq(users.disabled, false)));
  const assignedIds = new Set(roster.map(({ member }) => member.userId));
  const unassigned = approvedPlayers.filter((player) => !assignedIds.has(player.id));

  if (event.mode === "INDIVIDUAL") return <div>
    <p className="eyebrow">ROSTER MODE</p><h2 className="section-title mt-2">本赛事不使用固定战队</h2>
    <div className="card mt-7"><span className="data-label">{EVENT_MODE_LABELS[event.mode]}</span><p className="mt-3 text-[#5d687d]">已通过审核的选手由赛事管理员按每一场比赛分别编入 A、B 双方。</p><Link className="button-primary mt-5" href={`/ops/${eventId}/matches`}>前往比赛排期</Link></div>
  </div>;

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">TEAM REGISTRY</p><h2 className="section-title mt-2">战队与编队管理</h2><p className="mt-2 text-sm text-[#675e52]">{EVENT_MODE_LABELS[event.mode]} · 管理员可创建、解散战队，并调整全部成员。</p></div>
      <span className="stamp px-3 py-1 text-sm text-plum">未编队 {unassigned.length} 人</span>
    </div>
    {(feedback.error || feedback.success) && <p role={feedback.error ? "alert" : "status"} aria-live={feedback.error ? "assertive" : "polite"} className={`mt-6 border px-4 py-3 text-sm font-semibold ${feedback.error ? "border-danger/40 bg-[#f6e4ea] text-danger" : "border-[#52755f] bg-[#e2eee8] text-[#31533c]"}`}>{feedback.error ?? feedback.success}</p>}

    <section className="card mt-7 border-l-4 border-l-plum">
      <div className="flex items-center gap-3"><UsersRound className="text-plum" /><div><span className="data-label">MANAGER FORMATION</span><h3 className="font-display text-2xl font-bold">由赛事方创建战队</h3></div></div>
      <form action={adminCreateTeam} className="mt-5 grid gap-3 md:grid-cols-[1fr_130px_1fr_auto]">
        <input type="hidden" name="eventId" value={eventId} />
        <div><label className="label" htmlFor="ops-team-name">战队名称</label><input className="input" id="ops-team-name" name="name" required /></div>
        <div><label className="label" htmlFor="ops-team-abbr">缩写</label><input className="input uppercase" id="ops-team-abbr" name="abbreviation" minLength={2} maxLength={6} required /></div>
        <div><label className="label" htmlFor="ops-team-captain">初始队长用户名</label><input className="input" id="ops-team-captain" name="captainUsername" list="unassigned-players" required /></div>
        <FormSubmitButton className="button-primary self-end" pendingLabel="正在创建…">创建战队</FormSubmitButton>
        <datalist id="unassigned-players">{unassigned.map((player) => <option value={player.username} key={player.id}>{player.displayName}</option>)}</datalist>
      </form>
    </section>

    <div className="mt-7 space-y-4">{items.length ? items.map(({ team, captain, members }) => {
      const membersInTeam = roster.filter(({ member }) => member.teamId === team.id);
      return <article className={`card ${team.status === "WITHDRAWN" ? "opacity-65" : ""}`} key={team.id}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><span className="data-label">{team.abbreviation} · {members} 人 {team.createdByAdmin ? "· 赛事方创建" : "· 玩家申请"}</span><h3 className="font-display text-3xl font-bold">{team.name}</h3><p className="text-sm text-[#675e52]">队长：{captain.displayName} (@{captain.username})</p></div>
          <div className="flex items-center gap-2"><StatusBadge status={team.status} />{team.status === "APPROVED" && <Link className="button-secondary" href={`/events/${event.slug}/teams/${team.id}`}>公开页</Link>}</div>
        </div>

        {team.status === "PENDING" && event.mode === "PLAYER_TEAMS" && <form action={reviewTeam} className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
          <input type="hidden" name="teamId" value={team.id} /><label className="sr-only" htmlFor={`team-review-${team.id}`}>审核意见</label><input className="input min-w-[220px] flex-1" id={`team-review-${team.id}`} name="reason" placeholder="拒绝时必须填写审核意见" /><FormSubmitButton className="button-danger" name="decision" value="REJECTED" pendingLabel="正在审核…">退回修改</FormSubmitButton><FormSubmitButton className="button-primary" name="decision" value="APPROVED" pendingLabel="正在审核…">批准并开放招募</FormSubmitButton>
        </form>}

        {team.status === "APPROVED" && <section className="mt-5 border-t border-line pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="font-display text-xl font-bold">当前成员</h4><div className="flex items-center gap-2"><span className={`badge ${team.locked ? "border-danger/30 bg-[#f6e4e1] text-danger" : "border-[#52755f]/30 bg-[#e2eee4] text-[#31533c]"}`}>{team.locked ? <LockKeyhole size={14} /> : <LockOpen size={14} />}{team.locked ? "名单已锁定" : "名单可编辑"}</span><span className="data-label">上限 {event.maxRoster} 人</span></div></div>
          {team.locked && <p className="mb-3 border-l-4 border-gold bg-[#eee2cd] p-3 text-sm">为避免已生成赛程与出场名单失效，需先登记原因并解锁，才能增减成员。</p>}
          <div className="grid gap-2 md:grid-cols-2">{membersInTeam.map(({ member, user }) => <div className="flex min-h-14 items-center justify-between gap-3 border border-line bg-white/50 px-3" key={member.id}>
            <div className="min-w-0"><strong className="flex items-center gap-1 truncate">{member.role === "CAPTAIN" && <Crown size={15} className="text-gold" />}{member.role === "VICE_CAPTAIN" && <ShieldCheck size={15} className="text-plum" />}{user.displayName}</strong><span className="text-xs text-[#5d687d]">@{user.username} · {user.gameNickname || "未填写游戏昵称"}</span></div>
            {team.locked ? <span className="text-xs text-[#675e52]">需先解锁</span> : <form action={adminRemoveTeamMember}><input type="hidden" name="memberId" value={member.id} /><ConfirmSubmitButton className="button-danger" message={`确认将 ${user.displayName} 移出 ${team.name}？${member.role === "CAPTAIN" ? "队长职务将自动转移；若无其他成员，战队将解散。" : ""}`}><UserMinus size={16} />移出</ConfirmSubmitButton></form>}
          </div>)}</div>
          <form action={adminAddTeamMember} className="mt-4 flex flex-wrap gap-2">
            <input type="hidden" name="teamId" value={team.id} /><label className="sr-only" htmlFor={`add-member-${team.id}`}>待加入选手用户名</label><input className="input min-w-[220px] flex-1" id={`add-member-${team.id}`} name="username" list="unassigned-players" placeholder={team.locked ? "名单已锁定，请先解锁" : "输入已通过审核且未编队的用户名"} disabled={team.locked} spellCheck={false} required /><FormSubmitButton className="button-secondary" pendingLabel="正在加入…" disabled={team.locked}><UserPlus size={16} />加入战队</FormSubmitButton>
          </form>
          <form action={setTeamRosterLock} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <input type="hidden" name="teamId" value={team.id} /><input type="hidden" name="locked" value={team.locked ? "false" : "true"} />
            <div className="min-w-[240px] flex-1"><label className="label" htmlFor={`roster-lock-${team.id}`}>{team.locked ? "解锁原因" : "锁定原因"}</label><input className="input" id={`roster-lock-${team.id}`} name="reason" placeholder={team.locked ? "例如：更换一名无法参赛的队员" : "例如：名单确认完毕"} required /></div>
            <ConfirmSubmitButton className={team.locked ? "button-secondary" : "button-primary"} message={`确认${team.locked ? "解锁" : "锁定"} ${team.name} 的名单？操作会通知全体成员并写入审计。`}>{team.locked ? <LockOpen size={16} /> : <LockKeyhole size={16} />}{team.locked ? "解锁名单" : "锁定名单"}</ConfirmSubmitButton>
          </form>
        </section>}

        {team.status !== "WITHDRAWN" && <div className="mt-5 grid gap-4 border-t border-line pt-4 lg:grid-cols-[1fr_auto]">
          <details><summary className="min-h-11 cursor-pointer font-semibold text-plum">维护战队公开资料</summary><div className="mt-4"><TeamProfileForm teamId={team.id} slogan={team.slogan} description={team.description} hasLogo={Boolean(team.logoAssetId)} /></div></details>
          <form action={adminDissolveTeam} className="flex flex-wrap items-end gap-2"><input type="hidden" name="teamId" value={team.id} /><div><label className="label" htmlFor={`dissolve-${team.id}`}>解散原因</label><input className="input" id={`dissolve-${team.id}`} name="reason" placeholder="写入审计记录" required /></div><ConfirmSubmitButton className="button-danger" message={`确认解散 ${team.name}？所有成员将恢复为未编队状态。`}>解散战队</ConfirmSubmitButton></form>
        </div>}
      </article>;
    }) : <EmptyState title="暂无战队" description={event.mode === "ADMIN_TEAMS" ? "请由赛事方创建第一支战队并选择初始队长。" : "可以等待玩家提交建队申请，也可以由赛事方直接创建。"} />}</div>
  </div>;
}
