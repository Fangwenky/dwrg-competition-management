import Link from "next/link";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getUserWorkspace } from "@/lib/queries";
import { EmptyState, StatusBadge } from "@/components/ui";
import { declineMatchAssignment } from "@/app/actions/event";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { canDeclineMatchAssignment } from "@/lib/match-lifecycle-policy";

type AssignmentRow = Awaited<ReturnType<typeof getUserWorkspace>>["assignments"][number];

function AssignmentCard({ row }: { row: AssignmentRow }) {
  const { assignment, match, event } = row;
  const href = match.status === "PUBLISHED" ? `/matches/${match.id}` : `/events/${event.slug}/schedule`;
  const canDecline = canDeclineMatchAssignment(match.status);
  return <article className="card flex flex-wrap items-center justify-between gap-4"><div><span className="data-label">{event.name} · {match.roundLabel}</span><h2 className="font-display text-2xl font-bold">{assignment.role === "REFEREE" ? "裁判任务" : "解说任务"}</h2>{match.scheduledAt && <p className="mt-2 flex items-center gap-2 text-sm text-[#675e52]"><CalendarDays size={15} />{format(match.scheduledAt, "yyyy年M月d日 HH:mm", { locale: zhCN })}</p>}</div><div className="flex flex-wrap items-center justify-end gap-3"><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-plum underline" href={href}>{match.status === "PUBLISHED" ? "查看比赛档案" : "查看赛事赛程"}</Link><StatusBadge status={match.status} />{canDecline && <form action={declineMatchAssignment}><input type="hidden" name="matchId" value={match.id} /><input type="hidden" name="role" value={assignment.role} /><ConfirmSubmitButton className="button-danger" pendingLabel="正在提交…" message={`确定谢绝“${match.roundLabel}”的${assignment.role === "REFEREE" ? "裁判" : "解说"}任务吗？赛事管理员会收到通知并需要重新指派。`}>无法参与</ConfirmSubmitButton></form>}</div></article>;
}

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const user = await requireUser();
  const [{ assignments }, feedback] = await Promise.all([getUserWorkspace(user.id), searchParams]);
  const active = assignments.filter(({ match }) => match.status !== "PUBLISHED");
  const history = assignments.filter(({ match }) => match.status === "PUBLISHED");
  return <div>
    <div className="workspace-page-intro"><p className="eyebrow">ASSIGNMENTS</p><h1 className="section-title mt-2">工作指派</h1><p className="mt-2 text-[#61584c]">待办任务与已发布比赛分开显示；比赛开始前如无法参与，可在这里谢绝并通知赛事方重新安排。</p></div>
    {(feedback.error || feedback.success) && <p className={`mt-5 border px-4 py-3 text-sm ${feedback.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`} role={feedback.error ? "alert" : "status"} aria-live={feedback.error ? "assertive" : "polite"}>{feedback.error ?? feedback.success}</p>}
    <section className="mt-7"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-bold">待办任务</h2><span className="badge border-gold bg-parchment">{active.length} 场</span></div><div className="space-y-3">{active.length ? active.map((row) => <AssignmentCard row={row} key={`${row.assignment.matchId}-${row.assignment.role}`} />) : <EmptyState title="暂无待办指派" description="新的裁判或解说任务会显示在这里。" action={<Link className="button-secondary" href="/me/applications">申请工作人员身份</Link>} />}</div></section>
    {history.length > 0 && <section className="mt-10 border-t border-line pt-7"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-bold">已完成记录</h2><span className="text-sm text-[#6d6458]">{history.length} 场</span></div><div className="space-y-3">{history.map((row) => <AssignmentCard row={row} key={`${row.assignment.matchId}-${row.assignment.role}`} />)}</div></section>}
  </div>;
}
