import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventRoleApplications, events, matches, stages, teams } from "@/lib/db/schema";
import { Metric } from "@/components/ui";
import { EventHeroForm, EventSettingsForm } from "@/components/forms";

function dateTimeLocal(value: Date | null) {
  if (!value) return "";
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export default async function OpsDashboard({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string; message?: string; success?: string }>;
}) {
  const [{ eventId }, feedback] = await Promise.all([params, searchParams]);
  const user = await requirePageUser(`/ops/${eventId}`);
  const [event, [apps], [teamCount], [stageCount], [matchCount]] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db.select({ count: sql<number>`count(*)::int`, pending: sql<number>`count(*) filter (where ${eventRoleApplications.status} = 'PENDING')::int` }).from(eventRoleApplications).where(eq(eventRoleApplications.eventId, eventId)),
    db.select({ count: sql<number>`count(*)::int` }).from(teams).where(eq(teams.eventId, eventId)),
    db.select({ count: sql<number>`count(*)::int` }).from(stages).where(eq(stages.eventId, eventId)),
    db.select({ count: sql<number>`count(*)::int` }).from(matches).where(eq(matches.eventId, eventId))
  ]);
  if (!event) notFound();
  const archived = event.status === "ARCHIVED";
  const completed = event.status === "COMPLETED";
  const settings = {
    ...event,
    registrationStart: dateTimeLocal(event.registrationStart),
    registrationEnd: dateTimeLocal(event.registrationEnd),
    eventStart: dateTimeLocal(event.eventStart),
    eventEnd: dateTimeLocal(event.eventEnd)
  };

  return <div>
    <p className="eyebrow">OPERATIONS OVERVIEW</p>
    <h2 className="section-title mt-2">赛事概览</h2>
    {(feedback.message || feedback.success) && <p className={`mt-5 border px-4 py-3 text-sm ${feedback.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`} role={feedback.error ? "alert" : "status"}>{feedback.message ?? feedback.success}</p>}
    {archived && <section className="mt-5 border-2 border-gold bg-parchment p-5" role="status">
      <span className="data-label">READ-ONLY ARCHIVE</span>
      <h3 className="mt-1 font-display text-2xl font-bold">赛事已归档，当前工作台仅供查阅</h3>
      <p className="mt-2 text-sm text-[#645b4e]">身份审核、战队、流程、比赛、结果及赛事素材均不可修改。只有全局管理员可以在全局赛事管理中恢复该赛事。</p>
      {user.role === "ADMIN" && <Link className="button-secondary mt-4" href="/admin/events">前往全局赛事管理</Link>}
    </section>}
    {completed && <section className="mt-5 border-2 border-gold bg-parchment p-5" role="status"><span className="data-label">COMPLETED ARCHIVE</span><h3 className="mt-1 font-display text-2xl font-bold">赛事已结束，业务数据进入只读状态</h3><p className="mt-2 text-sm text-[#645b4e]">若需更正结果、人员或赛程，请在下方将状态改为“进行中”，并填写重新开启原因。</p></section>}
    <div className="mt-7 grid grid-cols-2 gap-5 md:grid-cols-4">
      <Metric label="待审核申请" value={apps.pending} detail={`共 ${apps.count} 项申请`} />
      <Metric label="战队档案" value={teamCount.count} />
      <Metric label="流程阶段" value={stageCount.count} />
      <Metric label="比赛记录" value={matchCount.count} />
    </div>
    <section className="mt-9" aria-label="赛事运营流程"><h3 className="font-display text-xl font-bold">按流程处理赛事</h3><p className="mt-2 text-sm text-[#5d687d]">{archived || completed ? "查阅历史身份、名单、赛程与赛果。" : "从身份审核开始，确认名单后排赛，最后保存并发布结果。"}</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{[
      { href: "applications", label: "审核身份申请", detail: `${apps.pending} 项待审核` },
      { href: event.mode === "INDIVIDUAL" ? "matches" : "teams", label: event.mode === "INDIVIDUAL" ? "分配参赛选手" : "确认战队与名单", detail: event.mode === "INDIVIDUAL" ? "按场次分配 A、B 双方选手" : `${teamCount.count} 支战队` },
      { href: "workflow", label: "编排阶段与赛程", detail: `${stageCount.count} 个赛事阶段` },
      { href: "matches", label: "指派工作与录入赛果", detail: `${matchCount.count} 场比赛` }
    ].map((step, index) => <Link className="card group flex items-start gap-4" href={`/ops/${eventId}/${step.href}`} key={step.label}><span className="step-index">{String(index + 1).padStart(2, "0")}</span><div><h4 className="font-display text-xl font-bold group-hover:text-plum">{step.label}</h4><p className="mt-2 text-sm text-[#5d687d]">{step.detail}</p></div></Link>)}</div></section>
    {!archived && <>
      <details className="mt-10 border-t border-line pt-5" open={completed}>
        <summary className="min-h-11 cursor-pointer font-display text-xl font-bold">赛事设置与公开状态</summary>
        <p className="mt-2 text-sm text-[#645b4e]">统一维护报名窗口、比赛时间、人数限制和公开生命周期。</p>
        <div className="mt-5"><EventSettingsForm event={settings} /></div>
      </details>
      {!completed && <details className="mt-5 border-t border-line pt-5">
        <summary className="min-h-11 cursor-pointer font-display text-xl font-bold">赛事封面与素材署名</summary>
        <p className="mt-2 text-sm text-[#645b4e]">上传已获授权的赛事背景，并公开标注素材来源。</p>
        <div className="mt-5"><EventHeroForm eventId={eventId} hasHero={Boolean(event.heroAssetId)} /></div>
      </details>}
    </>}
  </div>;
}
