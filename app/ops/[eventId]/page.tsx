import Link from "next/link";
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
  const [event, [apps], [teamCount], [stageCount], [matchCount]] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db.select({ count: sql<number>`count(*)::int` }).from(eventRoleApplications).where(eq(eventRoleApplications.eventId, eventId)),
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
      <Link className="button-secondary mt-4" href="/admin/events">前往全局赛事管理</Link>
    </section>}
    {completed && <section className="mt-5 border-2 border-gold bg-parchment p-5" role="status"><span className="data-label">COMPLETED ARCHIVE</span><h3 className="mt-1 font-display text-2xl font-bold">赛事已结束，业务数据进入只读状态</h3><p className="mt-2 text-sm text-[#645b4e]">若需更正结果、人员或赛程，请在下方将状态改为“进行中”，并填写重新开启原因。</p></section>}
    <div className="mt-7 grid grid-cols-2 gap-5 md:grid-cols-4">
      <Metric label="身份申请" value={apps.count} />
      <Metric label="战队档案" value={teamCount.count} />
      <Metric label="流程阶段" value={stageCount.count} />
      <Metric label="比赛记录" value={matchCount.count} />
    </div>
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      <Link className="card group" href={`/ops/${eventId}/applications`}><span className="data-label">REVIEW QUEUE</span><h3 className="mt-2 font-display text-2xl font-bold group-hover:text-plum">查看身份申请</h3><p className="mt-2 text-sm text-[#645b4e]">{archived ? "查阅历史审核记录。" : "核验选手、解说和裁判资料。"}</p></Link>
      <Link className="card group" href={`/ops/${eventId}/workflow`}><span className="data-label">STAGE PIPELINE</span><h3 className="mt-2 font-display text-2xl font-bold group-hover:text-plum">查看比赛流程</h3><p className="mt-2 text-sm text-[#645b4e]">{archived ? "查阅历史阶段与赛程。" : "建立阶段并从审核战队生成赛程。"}</p></Link>
    </div>
    {!archived && <>
      <section className="mt-12">
        <p className="eyebrow">EVENT SETTINGS</p><h3 className="section-title mt-2">赛事设置与公开状态</h3>
        <p className="mt-2 text-sm text-[#645b4e]">统一维护报名窗口、比赛时间、人数限制和公开生命周期。</p>
        <div className="mt-5"><EventSettingsForm event={settings} /></div>
      </section>
      {!completed && <section className="mt-12">
        <p className="eyebrow">EVENT APPEARANCE</p><h3 className="section-title mt-2">赛事显影窗</h3>
        <p className="mt-2 text-sm text-[#645b4e]">上传已获授权的赛事背景，并公开标注素材来源。</p>
        <div className="mt-5"><EventHeroForm eventId={eventId} hasHero={Boolean(event.heroAssetId)} /></div>
      </section>}
    </>}
  </div>;
}
