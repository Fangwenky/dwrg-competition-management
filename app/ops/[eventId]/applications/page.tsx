import Link from "next/link";
import { reviewApplication } from "@/app/actions/ops";
import { getEventApplications } from "@/lib/queries";
import { requirePageUser } from "@/lib/auth";
import { PROFILE_FIELD_LABELS, ROLE_LABELS } from "@/lib/constants";
import { EmptyState, StatusBadge } from "@/components/ui";
import { FormSubmitButton } from "@/components/form-submit-button";

export default async function OpsApplicationsPage({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string; success?: string; status?: string; role?: string }>;
}) {
  const { eventId } = await params;
  const [feedback, actor, items] = await Promise.all([searchParams, requirePageUser(`/ops/${eventId}/applications`), getEventApplications(eventId)]);
  const pending = items.filter(({ application }) => application.status === "PENDING").length;
  const statusOptions = ["ALL", "PENDING", "APPROVED", "REJECTED", "WITHDRAWN"];
  const status = statusOptions.includes(feedback.status ?? "") ? feedback.status! : pending ? "PENDING" : "ALL";
  const role = ["PLAYER", "COMMENTATOR", "REFEREE"].includes(feedback.role ?? "") ? feedback.role! : "ALL";
  const visible = items.filter(({ application }) => (status === "ALL" || application.status === status) && (role === "ALL" || application.role === role))
    .sort((a, b) => Number(b.application.status === "PENDING") - Number(a.application.status === "PENDING"));

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">REVIEW QUEUE</p><h2 className="section-title mt-2">身份审核</h2></div>
      <span className="stamp px-3 py-1 text-sm text-plum">待处理 {pending} 项</span>
    </div>
    {feedback.error && <p className="mt-6 border border-danger/40 bg-[#f6e4ea] px-4 py-3 text-sm font-semibold text-danger" role="alert">{feedback.error}</p>}
    {feedback.success && <p className="mt-6 border border-[#52755f] bg-[#e2eee8] px-4 py-3 text-sm font-semibold text-[#31533c]" role="status">{feedback.success}</p>}
    <div className="mt-6 space-y-3 border border-line bg-[#edf1f8] p-4">
      <nav className="flex flex-wrap gap-2" aria-label="审核状态">{[["PENDING", "待审核"], ["ALL", "全部记录"], ["APPROVED", "已通过"], ["REJECTED", "已拒绝"], ["WITHDRAWN", "已撤销"]].map(([value, label]) => <Link className={status === value ? "button-primary" : "button-secondary"} href={`/ops/${eventId}/applications?${new URLSearchParams({ status: value, role })}`} aria-current={status === value ? "page" : undefined} key={value}>{label}</Link>)}</nav>
      <nav className="flex flex-wrap gap-x-5" aria-label="申请角色">{[["ALL", "全部角色"], ["PLAYER", "选手"], ["COMMENTATOR", "解说"], ["REFEREE", "裁判"]].map(([value, label]) => <Link className={`inline-flex min-h-11 items-center text-sm ${role === value ? "font-bold text-plum underline underline-offset-4" : "text-[#5d687d]"}`} href={`/ops/${eventId}/applications?${new URLSearchParams({ status, role: value })}`} aria-current={role === value ? "page" : undefined} key={value}>{label}</Link>)}</nav>
    </div>
    <p className="mt-4 text-sm text-[#5d687d]">当前显示 {visible.length} 项 · 全部 {items.length} 项；待审核申请优先显示。</p>
    <div className="mt-4 space-y-4">
      {visible.length ? visible.map(({ application, user, rankScreenshotUrl }) => {
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
      }) : <EmptyState title="当前筛选下没有申请" description="可切换到全部记录查看历史审核，新的待审核申请会优先显示。" action={<Link className="button-secondary" href={`/ops/${eventId}/applications?status=ALL`}>查看全部记录</Link>} />}
    </div>
  </div>;
}
