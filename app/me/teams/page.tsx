import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Crown, ShieldCheck, UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventRoleGrants, events, teamInvites, teamJoinRequests, teamMembers, teams, users } from "@/lib/db/schema";
import { TeamCreateForm, InviteForm, MemberProfileForm, TeamProfileForm } from "@/components/forms";
import { cancelTeamInvite, dissolveOwnTeam, leaveTeam, resubmitTeamApplication, respondTeamInvite, reviewTeamJoinRequest, setViceCaptain, transferTeamCaptain, withdrawTeamApplication, withdrawTeamJoinRequest } from "@/app/actions/event";
import { EmptyState, StatusBadge } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { teamRoleLabel } from "@/components/public-event";
import { isEventRegistrationOpen } from "@/lib/event-policy";
import { FormSubmitButton } from "@/components/form-submit-button";

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const user = await requireUser();
  const feedback = await searchParams;
  const [memberships, invites, playerGrants, outgoingRequests] = await Promise.all([
    db.select({ member: teamMembers, team: teams, event: events }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).innerJoin(events, eq(events.id, teamMembers.eventId)).where(eq(teamMembers.userId, user.id)),
    db.select({ invite: teamInvites, team: teams, event: events }).from(teamInvites).innerJoin(teams, eq(teams.id, teamInvites.teamId)).innerJoin(events, eq(events.id, teamInvites.eventId)).where(and(eq(teamInvites.invitedUserId, user.id), eq(teamInvites.status, "PENDING"))),
    db.select({ grant: eventRoleGrants, event: events }).from(eventRoleGrants).innerJoin(events, eq(events.id, eventRoleGrants.eventId)).where(and(eq(eventRoleGrants.userId, user.id), eq(eventRoleGrants.role, "PLAYER"))),
    db.select({ request: teamJoinRequests, team: teams, event: events }).from(teamJoinRequests).innerJoin(teams, eq(teams.id, teamJoinRequests.teamId)).innerJoin(events, eq(events.id, teamJoinRequests.eventId)).where(eq(teamJoinRequests.userId, user.id))
  ]);
  const teamIds = memberships.map(({ team }) => team.id);
  const managedTeamIds = memberships.filter(({ member }) => member.role === "CAPTAIN" || member.role === "VICE_CAPTAIN").map(({ team }) => team.id);
  const [roster, incomingRequests, outgoingInvites] = await Promise.all([
    teamIds.length ? db.select({ member: teamMembers, user: users }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(inArray(teamMembers.teamId, teamIds)) : Promise.resolve([]),
    managedTeamIds.length ? db.select({ request: teamJoinRequests, applicant: users, team: teams }).from(teamJoinRequests).innerJoin(users, eq(users.id, teamJoinRequests.userId)).innerJoin(teams, eq(teams.id, teamJoinRequests.teamId)).where(and(inArray(teamJoinRequests.teamId, managedTeamIds), eq(teamJoinRequests.status, "PENDING"))) : Promise.resolve([]),
    managedTeamIds.length ? db.select({ invite: teamInvites, invitee: users, team: teams, event: events }).from(teamInvites).innerJoin(users, eq(users.id, teamInvites.invitedUserId)).innerJoin(teams, eq(teams.id, teamInvites.teamId)).innerJoin(events, eq(events.id, teamInvites.eventId)).where(and(inArray(teamInvites.teamId, managedTeamIds), eq(teamInvites.status, "PENDING"))) : Promise.resolve([])
  ]);
  const available = playerGrants.filter(({ grant, event }) => event.mode === "PLAYER_TEAMS" && isEventRegistrationOpen(event) && !memberships.some(({ member }) => member.eventId === grant.eventId));

  return <div>
    <div className="workspace-page-intro"><p className="eyebrow">TEAM OPERATIONS</p><h1 className="section-title mt-2">我的战队</h1>
    <p className="mt-2 text-[#61584c]">建队由赛事管理员审核；入队申请由队长或副队长处理，同一赛事只能加入一支战队。</p></div>
    {(feedback.error || feedback.success) && <p role={feedback.error ? "alert" : "status"} aria-live={feedback.error ? "assertive" : "polite"} className={`mt-5 border px-4 py-3 text-sm ${feedback.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`}>{feedback.error ?? feedback.success}</p>}

    {invites.length > 0 && <section className="mt-8"><h2 className="mb-4 font-display text-xl font-bold">待处理战队邀请</h2>{invites.map(({ invite, team, event }) => { const registrationOpen = isEventRegistrationOpen(event); return <div className="card flex flex-wrap items-center justify-between gap-4" key={invite.id}><div><span className="data-label">{event.name}</span><h3 className="font-display text-2xl font-bold">{team.name}</h3><p className="mt-1 text-sm text-[#675e52]">{registrationOpen ? "接受后，本赛事的其他待处理入队申请与邀请会自动关闭。" : "报名窗口已经关闭，不能再加入；你仍可拒绝并清理这条过期邀请。"}</p></div><form action={respondTeamInvite} className="flex gap-2"><input type="hidden" name="inviteId" value={invite.id} /><FormSubmitButton name="decision" value="reject" className="button-secondary" pendingLabel="正在处理…">拒绝</FormSubmitButton><FormSubmitButton name="decision" value="accept" className="button-primary" pendingLabel="正在加入…" disabled={!registrationOpen}>{registrationOpen ? "接受邀请" : "报名已截止"}</FormSubmitButton></form></div>; })}</section>}

    {outgoingRequests.length > 0 && <section className="mt-8"><h2 className="mb-4 font-display text-xl font-bold">我的入队申请</h2><div className="grid gap-3 md:grid-cols-2">{outgoingRequests.map(({ request, team, event }) => <article className="card" key={request.id}><div className="flex items-start justify-between gap-3"><div><span className="data-label">{event.name}</span><h3 className="font-display text-2xl font-bold">{team.name}</h3></div><StatusBadge status={request.status} /></div>{request.message && <p className="mt-3 text-sm text-[#675e52]">申请留言：{request.message}</p>}{request.reviewReason && <p className="mt-3 border-l-2 border-danger pl-3 text-sm">审核意见：{request.reviewReason}</p>}{request.status === "PENDING" && <form action={withdrawTeamJoinRequest} className="mt-4 border-t border-line pt-4"><input type="hidden" name="requestId" value={request.id} /><ConfirmSubmitButton className="button-danger" message={`确认撤销加入 ${team.name} 的申请？撤销后可以重新申请。`}>撤销入队申请</ConfirmSubmitButton></form>}</article>)}</div></section>}

    {outgoingInvites.length > 0 && <section className="mt-8"><h2 className="mb-4 font-display text-xl font-bold">已发出的邀请</h2><div className="grid gap-3 md:grid-cols-2">{outgoingInvites.map(({ invite, invitee, team, event }) => <article className="card" key={invite.id}><span className="data-label">{event.name} · {team.name}</span><h3 className="mt-1 font-display text-xl font-bold">{invitee.displayName}</h3><p className="text-sm text-[#675e52]">@{invitee.username} · 等待对方回应</p><form action={cancelTeamInvite} className="mt-4 border-t border-line pt-4"><input type="hidden" name="inviteId" value={invite.id} /><ConfirmSubmitButton className="button-danger" message={`确认撤销对 ${invitee.displayName} 的战队邀请？`}>撤销邀请</ConfirmSubmitButton></form></article>)}</div></section>}

    <section className="mt-8"><h2 className="mb-4 font-display text-xl font-bold">已加入战队</h2>{memberships.length ? <div className="space-y-5">{memberships.map(({ member, team, event }) => {
      const teamRoster = roster.filter((item) => item.member.teamId === team.id);
      const otherMembers = teamRoster.filter((item) => item.member.userId !== user.id);
      const viceCaptain = teamRoster.find((item) => item.member.role === "VICE_CAPTAIN");
      const requests = incomingRequests.filter((item) => item.request.teamId === team.id);
      const canReview = team.status === "APPROVED" && (member.role === "CAPTAIN" || member.role === "VICE_CAPTAIN");
      const registrationOpen = isEventRegistrationOpen(event);
      return <article className="card" key={member.id}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="data-label">{event.name} · {team.abbreviation}</span><h3 className="font-display text-3xl font-bold">{team.name}</h3><p className="mt-2 flex items-center gap-2 text-sm text-[#665d50]">{member.role === "CAPTAIN" ? <Crown size={15} className="text-gold" /> : member.role === "VICE_CAPTAIN" ? <ShieldCheck size={15} className="text-plum" /> : null}{teamRoleLabel(member.role)} · {team.slogan}</p></div><div className="flex items-center gap-2"><StatusBadge status={team.status} />{team.status === "APPROVED" && <Link className="button-secondary" href={`/events/${event.slug}/teams/${team.id}`}>查看公开页</Link>}</div></div>

        {team.status === "PENDING" && member.role === "CAPTAIN" && <section className="mt-6 border-l-4 border-gold bg-parchment p-5">
          <h4 className="font-display text-xl font-bold">建队申请正在审核</h4>
          <p className="mt-1 text-sm text-[#675e52]">审核前战队不会公开，也不能邀请或接收队员。若资料需要修改，请撤销后重新创建。</p>
          <form action={withdrawTeamApplication} className="mt-4"><input type="hidden" name="teamId" value={team.id} /><ConfirmSubmitButton className="button-danger" message={`确认撤销 ${team.name} 的建队申请？撤销后不会保留这支待审战队。`}>撤销建队申请</ConfirmSubmitButton></form>
        </section>}

        {team.status === "REJECTED" && member.role === "CAPTAIN" && <section className="mt-6 border-l-4 border-danger bg-[#f6e4e1]/60 p-5">
          <h4 className="font-display text-xl font-bold">建队申请需要修改</h4>
          <p className="mt-2 text-sm text-danger">审核意见：{team.reviewReason || "赛事方未填写具体原因，请联系管理员确认。"}</p>
          {!registrationOpen && <p className="mt-4 border border-gold bg-parchment p-3 text-sm">报名窗口已关闭，不能重新提交；你仍可放弃这次申请以清理战队归属。</p>}
          <fieldset disabled={!registrationOpen} className="border-0 p-0"><form action={resubmitTeamApplication} className="mt-5 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="teamId" value={team.id} />
            <div><label className="label" htmlFor={`resubmit-name-${team.id}`}>战队名称</label><input className="input" id={`resubmit-name-${team.id}`} name="name" minLength={2} maxLength={40} defaultValue={team.name} required /></div>
            <div><label className="label" htmlFor={`resubmit-abbr-${team.id}`}>战队缩写</label><input className="input" id={`resubmit-abbr-${team.id}`} name="abbreviation" minLength={2} maxLength={6} defaultValue={team.abbreviation} required /></div>
            <div className="md:col-span-2"><label className="label" htmlFor={`resubmit-slogan-${team.id}`}>战队口号</label><input className="input" id={`resubmit-slogan-${team.id}`} name="slogan" maxLength={100} defaultValue={team.slogan} /></div>
            <div className="flex flex-wrap gap-2 md:col-span-2"><FormSubmitButton className="button-primary" pendingLabel="正在重新提交…">修改并重新提交</FormSubmitButton></div>
          </form></fieldset>
          <form action={dissolveOwnTeam} className="mt-4 border-t border-danger/20 pt-4"><input type="hidden" name="teamId" value={team.id} /><input type="hidden" name="reason" value="放弃被拒绝的建队申请" /><ConfirmSubmitButton className="button-danger" message={`确认放弃 ${team.name} 的建队申请？放弃后可以创建或加入其他战队。`}>放弃这次申请</ConfirmSubmitButton></form>
        </section>}

        {canReview && <section className="mt-6 border-t border-line pt-5"><div className="mb-4 flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 font-display text-xl font-bold"><UserPlus size={19} className="text-plum" />待审核入队申请</h4><span className="badge border-gold/50 bg-[#eee2cd] text-[#6a4b25]">{requests.length} 项</span></div>{!registrationOpen && requests.length > 0 && <p className="mb-3 border border-gold bg-parchment p-3 text-sm">报名已截止，只能拒绝或由申请人撤销，不能再接收新成员。</p>}{requests.length ? <div className="space-y-3">{requests.map(({ request, applicant }) => <form action={reviewTeamJoinRequest} className="border border-line bg-white/50 p-4" key={request.id}><input type="hidden" name="requestId" value={request.id} /><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{applicant.displayName}</strong><span className="ml-2 text-sm text-[#675e52]">@{applicant.username}</span>{request.message && <p className="mt-2 text-sm text-[#514a40]">{request.message}</p>}</div><div className="flex flex-1 flex-wrap justify-end gap-2"><label className="sr-only" htmlFor={`join-reason-${request.id}`}>拒绝原因</label><input className="input min-w-[180px] max-w-sm" id={`join-reason-${request.id}`} name="reason" placeholder="拒绝时填写原因" /><FormSubmitButton className="button-danger" name="decision" value="REJECTED" pendingLabel="正在处理…">拒绝</FormSubmitButton><FormSubmitButton className="button-primary" name="decision" value="APPROVED" pendingLabel="正在接收…" disabled={!registrationOpen}>{registrationOpen ? "同意加入" : "报名已截止"}</FormSubmitButton></div></div></form>)}</div> : <p className="text-sm text-[#675e52]">暂时没有新的入队申请。</p>}</section>}

        {member.role === "CAPTAIN" && team.status === "APPROVED" && !team.locked && registrationOpen && <section className="mt-6 border-t border-line pt-5"><h4 className="mb-3 font-display text-xl font-bold">邀请认证选手</h4><InviteForm teamId={team.id} /></section>}

        {team.status === "APPROVED" && <details className="mt-6 border-t border-line pt-5"><summary className="min-h-11 cursor-pointer font-semibold text-plum">编辑我的选手档案</summary><div className="mt-4"><MemberProfileForm member={member} /></div></details>}
        {member.role === "CAPTAIN" && team.status === "APPROVED" && <details className="mt-4 border-t border-line pt-5"><summary className="min-h-11 cursor-pointer font-semibold text-plum">维护战队公开资料</summary><div className="mt-4"><TeamProfileForm teamId={team.id} slogan={team.slogan} description={team.description} hasLogo={Boolean(team.logoAssetId)} /></div></details>}

        {member.role === "CAPTAIN" && team.status === "APPROVED" && registrationOpen && <details className="mt-4 border-t border-danger/30 pt-5"><summary className="min-h-11 cursor-pointer font-semibold text-danger">解散战队</summary><form action={dissolveOwnTeam} className="mt-4 flex flex-wrap items-end gap-2"><input type="hidden" name="teamId" value={team.id} /><div className="min-w-[240px] flex-1"><label className="label" htmlFor={`own-dissolve-${team.id}`}>解散原因（可选）</label><input className="input" id={`own-dissolve-${team.id}`} name="reason" placeholder="将通知全部成员" /></div><ConfirmSubmitButton className="button-danger" message={`确认解散 ${team.name}？所有成员会被移出，该操作不能由队长自行恢复。`}>确认解散</ConfirmSubmitButton></form></details>}

        {team.status === "APPROVED" && member.role !== "CAPTAIN" && (team.locked || !registrationOpen ? <div className="mt-4 border-l-4 border-gold bg-parchment p-4 text-sm text-[#675e52]"><strong className="text-ink">{team.locked ? "名单已锁定" : "报名窗口已关闭"}，暂不能退出。</strong><span className="mt-1 block">如需调整，请联系队长或赛事管理员说明原因。</span></div> : <details className="mt-4 border-t border-danger/30 pt-5"><summary className="min-h-11 cursor-pointer font-semibold text-danger">退出战队</summary><form action={leaveTeam} className="mt-4"><input type="hidden" name="memberId" value={member.id} /><p className="mb-3 text-sm text-[#675e52]">退出后可以申请加入本赛事的其他战队。</p><ConfirmSubmitButton className="button-danger" message={`确认退出 ${team.name}？`}>确认退出战队</ConfirmSubmitButton></form></details>)}

        {member.role === "CAPTAIN" && team.status === "APPROVED" && !team.locked && registrationOpen && otherMembers.length > 0 && <details className="mt-4 border-t border-line pt-5"><summary className="min-h-11 cursor-pointer font-semibold text-plum">队长与副队长设置</summary><div className="mt-4 grid gap-5 lg:grid-cols-2"><form action={setViceCaptain} className="space-y-3 border border-line bg-white/50 p-4"><input type="hidden" name="teamId" value={team.id} /><div><label className="label" htmlFor={`vice-${team.id}`}>副队长</label><select className="input" id={`vice-${team.id}`} name="memberId" defaultValue={viceCaptain?.member.id ?? otherMembers[0].member.id}>{otherMembers.map(({ member: itemMember, user: itemUser }) => <option value={itemMember.id} key={itemMember.id}>{itemUser.displayName}{itemMember.role === "VICE_CAPTAIN" ? "（当前副队长）" : ""}</option>)}</select></div><div className="flex flex-wrap gap-2"><FormSubmitButton className="button-secondary" name="decision" value="set" pendingLabel="正在设置…">设置副队长</FormSubmitButton>{viceCaptain && <ConfirmSubmitButton className="button-danger" name="decision" value="remove" message={`确认取消 ${viceCaptain.user.displayName} 的副队长职务？`}>取消副队长</ConfirmSubmitButton>}</div></form><form action={transferTeamCaptain} className="space-y-3 border border-danger/30 bg-[#f6e4e1]/40 p-4"><input type="hidden" name="teamId" value={team.id} /><div><label className="label" htmlFor={`captain-${team.id}`}>新队长</label><select className="input" id={`captain-${team.id}`} name="memberId">{otherMembers.map(({ member: itemMember, user: itemUser }) => <option value={itemMember.id} key={itemMember.id}>{itemUser.displayName}{itemMember.role === "VICE_CAPTAIN" ? "（副队长）" : ""}</option>)}</select></div><ConfirmSubmitButton className="button-danger" message="确认转移队长身份？转移后你将成为普通队员，此操作应由新队长再次转移才能恢复。">转移队长身份</ConfirmSubmitButton></form></div></details>}
      </article>;
    })}</div> : <EmptyState title="尚未加入战队" description="通过选手身份审核后，可以提交建队申请，或在公开战队页申请加入。" action={<div className="flex flex-wrap justify-center gap-2"><Link className="button-primary" href="/me/applications">申请选手身份</Link><Link className="button-secondary" href="/events">浏览公开战队</Link></div>} />}</section>

    {available.length > 0 && <section className="mt-10"><h2 className="mb-2 font-display text-xl font-bold">申请创建战队</h2><p className="mb-4 text-sm text-[#675e52]">每项赛事只能创建或加入一支战队。</p><div className="space-y-5">{available.map(({ grant, event }) => <div key={grant.eventId}><h3 className="mb-3 font-semibold">{event.name}</h3><TeamCreateForm eventId={grant.eventId} /></div>)}</div></section>}
  </div>;
}
