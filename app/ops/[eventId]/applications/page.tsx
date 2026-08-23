import { reviewApplication } from "@/app/actions/ops";
import { getEventApplications } from "@/lib/queries";
import { requirePageUser } from "@/lib/auth";
import { PROFILE_FIELD_LABELS, ROLE_LABELS } from "@/lib/constants";
import { EmptyState, StatusBadge } from "@/components/ui";
import { FormSubmitButton } from "@/components/form-submit-button";

export default async function OpsApplicationsPage({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { eventId } = await params;
  const [feedback, actor, items] = await Promise.all([searchParams, requirePageUser(`/ops/${eventId}/applications`), getEventApplications(eventId)]);
  const pending = items.filter(({ application }) => application.status === "PENDING").length;

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">REVIEW QUEUE</p><h2 className="section-title mt-2">身份审核</h2></div>
      <span className="stamp px-3 py-1 text-sm text-plum">待处理 {pending} 项</span>
    </div>
    {feedback.error && <p className="mt-6 border border-danger/40 bg-[#f6e4ea] px-4 py-3 text-sm font-semibold text-danger" role="alert">{feedback.error}</p>}
    {feedback.success && <p className="mt-6 border border-[#52755f] bg-[#e2eee8] px-4 py-3 text-sm font-semibold text-[#31533c]" role="status">{feedback.success}</p>}
    <div className="mt-7 space-y-4">
      {items.length ? items.map(({ application, user, rankScreenshotUrl }) => {
        const isOwnApplication = application.userId === actor.id;
        return <article className="card" key={application.id}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><span className="data-label">@{user.username}</span><h3 className="font-display text-2xl font-bold">{user.displayName} · {ROLE_LABELS[application.role]}</h3></div>
            <StatusBadge status={application.status} />
          </div>
          <dl className="mt-5 grid gap-3 border-y border-line py-4 text-sm md:grid-cols-3">
            {Object.entries(application.profile).filter(([key]) => key !== "rankScreenshotAssetId").map(([key, value]) => <div key={key}><dt className="data-label">{PROFILE_FIELD_LABELS[key] ?? key}</dt><dd className="mt-1 break-all">{value}</dd></div>)}
          </dl>
          {application.role === "PLAYER" && <div className="mt-5 grid gap-4 md:grid-cols-[1fr_280px]"><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="data-label">当前游戏昵称</dt><dd className="mt-1 font-semibold">{user.gameNickname || "未填写"}</dd></div><div><dt className="data-label">游戏 UID</dt><dd className="mt-1 font-semibold">{user.gameUid || "未填写"}</dd></div><div><dt className="data-label">求生者最高段位</dt><dd className="mt-1 font-semibold">{user.survivorRank || "未填写"}</dd></div><div><dt className="data-label">监管者最高段位</dt><dd className="mt-1 font-semibold">{user.hunterRank || "未填写"}</dd></div></dl><div>{rankScreenshotUrl ? <a href={rankScreenshotUrl} target="_blank" rel="noreferrer"><img className="max-h-44 w-full border border-line object-contain" src={rankScreenshotUrl} alt={`${user.displayName} 的段位战绩证明`} /></a> : <div className="grid min-h-32 place-items-center border border-dashed border-line text-sm text-[#5d687d]">未上传证明截图</div>}</div></div>}
          {application.status === "PENDING" && (isOwnApplication
            ? <div className="mt-5 border-l-4 border-gold bg-parchment/60 px-4 py-3 text-sm"><strong>该申请由当前账号提交，不能自行审核。</strong><p className="mt-1 text-[#5d687d]">请由另一位全局管理员或赛事管理员处理；赛事管理员身份本身不影响申请选手。</p></div>
            : <form action={reviewApplication} className="mt-5 flex flex-wrap gap-2">
              <input type="hidden" name="applicationId" value={application.id} />
              <label className="sr-only" htmlFor={`application-reason-${application.id}`}>审核意见</label>
              <input className="input min-w-[220px] flex-1" id={`application-reason-${application.id}`} name="reason" placeholder="拒绝时必须填写审核意见" />
              <FormSubmitButton className="button-danger" name="decision" value="REJECTED" pendingLabel="正在提交审核…">拒绝</FormSubmitButton>
              <FormSubmitButton className="button-primary" name="decision" value="APPROVED" pendingLabel="正在提交审核…">通过申请</FormSubmitButton>
            </form>)}
        </article>;
      }) : <EmptyState title="没有待处理申请" description="新申请到达后会按时间显示。" />}
    </div>
  </div>;
}
