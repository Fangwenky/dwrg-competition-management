import Link from "next/link";
import { CheckCircle2, ClipboardList, RotateCcw, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getApplicationEvents, getUserWorkspace } from "@/lib/queries";
import { RoleApplicationForm } from "@/components/forms";
import { EmptyState, StatusBadge } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { relinquishEventRole, withdrawRoleApplication } from "@/app/actions/event";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { canResubmitApplication } from "@/lib/application-policy";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ event?: string; role?: string; error?: string; success?: string }> }) {
  const user = await requireUser();
  const [params, events, workspace] = await Promise.all([searchParams, getApplicationEvents(), getUserWorkspace(user.id)]);
  const selected = params.event;
  const eventId = selected && events.some((event) => event.id === selected) ? selected : events[0]?.id;
  const selectedEvent = events.find((event) => event.id === eventId);
  const initialRole = ["PLAYER", "COMMENTATOR", "REFEREE"].includes(params.role ?? "") ? params.role as "PLAYER" | "COMMENTATOR" | "REFEREE" : "PLAYER";
  const profileFields = [user.gameUid, user.gameNickname, user.survivorRank, user.hunterRank, user.rankScreenshotAssetId];
  const completedFields = profileFields.filter(Boolean).length;
  const playerProfileComplete = completedFields === profileFields.length;

  return <div>
    <div className="workspace-page-intro">
      <p className="eyebrow">ROLE APPLICATIONS</p>
      <h1 className="section-title mt-2">赛事报名与身份申请</h1>
      <p className="mt-2 max-w-2xl text-[#61584c]">选手报名直接引用个人竞技资料；解说与裁判按赛事补充经历。同一账号可在一项赛事中拥有多个身份。</p>
    </div>

    {(params.error || params.success) && <p role={params.error ? "alert" : "status"} aria-live={params.error ? "assertive" : "polite"} className={`mt-5 border px-4 py-3 text-sm ${params.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`}>{params.error ?? params.success}</p>}

    <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
      <section aria-labelledby="new-application-title">
        <div className="mb-4 flex items-center gap-3"><span className="step-index">01</span><div><span className="data-label">NEW APPLICATION</span><h2 className="font-display text-xl font-bold" id="new-application-title">发起申请</h2></div></div>
        {events.length ? <>
          <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]" method="get">
            <div><label className="label" htmlFor="event-switch">申请赛事</label><select id="event-switch" name="event" className="input" defaultValue={eventId}>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}</select></div>
            <button className="button-secondary self-end">切换赛事</button>
          </form>
          <div className="mb-4 border border-line bg-[#edf1f8] px-4 py-3 text-sm text-[#5d687d]"><strong className="text-ink">当前赛事：</strong>{selectedEvent?.name}</div>
          {eventId && <RoleApplicationForm key={`${eventId}:${initialRole}`} eventId={eventId} playerProfileComplete={playerProfileComplete} initialRole={initialRole} />}
        </> : <EmptyState title="暂无可申请赛事" description="赛事开放报名后即可在这里申请身份。" />}
      </section>

      <section aria-labelledby="application-history-title">
        <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="step-index step-index-muted">02</span><div><span className="data-label">APPLICATION HISTORY</span><h2 className="font-display text-xl font-bold" id="application-history-title">申请记录</h2></div></div><span className="data-label">共 {workspace.applications.length} 项</span></div>
        {workspace.applications.length ? <div className="space-y-3">{workspace.applications.map(({ application, event }) => <article className="application-record" key={application.id}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="data-label">{event.name}</span><h3 className="mt-1 font-display text-2xl font-bold">{ROLE_LABELS[application.role]}</h3></div><StatusBadge status={application.status} /></div>
          {application.reviewReason && <p className="mt-4 border-l-2 border-danger pl-3 text-sm">审核意见：{application.reviewReason}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {application.status === "PENDING" && <form action={withdrawRoleApplication}>
              <input type="hidden" name="applicationId" value={application.id} />
              <ConfirmSubmitButton className="button-danger" message={`确定撤销 ${event.name} 的${ROLE_LABELS[application.role]}申请吗？撤销后可修改资料并重新提交。`}><XCircle size={17} />撤销申请</ConfirmSubmitButton>
            </form>}
            {canResubmitApplication(application.status) && events.some((candidate) => candidate.id === event.id) && <Link className="button-secondary" href={`/me/applications?event=${event.id}&role=${application.role}`}><RotateCcw size={17} />{application.status === "REJECTED" ? "修改后重新申请" : "重新申请"}</Link>}
            {canResubmitApplication(application.status) && !events.some((candidate) => candidate.id === event.id) && <span className="text-sm text-[#5d687d]">该赛事当前未开放报名，暂不能重新申请。</span>}
            {application.status === "APPROVED" && <><span className="inline-flex items-center gap-2 text-sm font-semibold text-[#31533c]"><CheckCircle2 size={17} />身份已生效</span><Link className="text-sm font-semibold text-plum underline" href={`/events/${event.slug}`}>查看赛事</Link><form action={relinquishEventRole}><input type="hidden" name="applicationId" value={application.id} /><ConfirmSubmitButton className="button-danger" message={`确定退出 ${event.name} 的${ROLE_LABELS[application.role]}身份吗？若仍在活动战队、未结束的个人赛排期或工作指派中，系统会阻止退出；历史比赛记录会保留。`}>退出身份</ConfirmSubmitButton></form></>}
            {application.status === "PENDING" && <span className="text-sm text-[#5d687d]">审核前可随时撤销；审核队列会同步移除。</span>}
          </div>
        </article>)}</div> : <div className="empty-guidance min-h-[150px]">
          <ClipboardList className="text-gold" size={28} />
          <div><h3 className="font-display text-xl font-bold">还没有赛事申请</h3><p className="mt-1 text-sm text-[#5d687d]">从左侧选择赛事和身份，提交后可在这里追踪审核进度。</p></div>
          {playerProfileComplete && <CheckCircle2 className="text-[#4f725f] xl:ml-auto" size={22} aria-label="选手资料已就绪" />}
        </div>}
      </section>
    </div>
  </div>;
}
