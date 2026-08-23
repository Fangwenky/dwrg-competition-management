import { notFound } from "next/navigation";
import { getEventBySlug, getEventOverview } from "@/lib/queries";
import { Breadcrumbs, MatchCard } from "@/components/public-event";
import { EmptyState, StatusBadge } from "@/components/ui";
import { STAGE_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") notFound();
  const overview = await getEventOverview(event.id);
  const ungrouped = overview.matches.filter(({ match }) => !match.stageId);
  return <div className="page-wrap"><Breadcrumbs items={[{ label: "赛事档案", href: "/events" }, { label: event.name, href: `/events/${slug}` }, { label: "赛程" }]} /><div className="mb-10 mt-5"><p className="eyebrow">MATCH SCHEDULE</p><h1 className="display-title mt-2">阶段与赛程</h1><p className="mt-3 text-[#62594e]">比赛按赛事阶段或管理员手动排期归档，时间均为 Asia/Shanghai。</p></div>{overview.matches.length || overview.stages.length ? <div className="archive-track space-y-10">{ungrouped.length > 0 && <section className="archive-node"><div className="mb-4"><span className="data-label">MANUAL ASSIGNMENT</span><h2 className="font-display text-3xl font-black">管理员手动排期</h2></div><div className="space-y-3">{ungrouped.map((item) => <MatchCard eventSlug={slug} item={item} key={item.match.id} />)}</div></section>}{overview.stages.map((stage) => { const stageMatches = overview.matches.filter(({ match }) => match.stageId === stage.id); return <section className="archive-node" key={stage.id}><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><span className="data-label">STAGE {String(stage.orderIndex).padStart(2, "0")}</span><h2 className="font-display text-3xl font-black">{stage.name}</h2></div><div className="flex items-center gap-2"><span className="badge border-plum/30 text-plum">{STAGE_LABELS[stage.type]}</span><StatusBadge status={stage.status} /></div></div>{stageMatches.length ? <div className="space-y-3">{stageMatches.map((item) => <MatchCard eventSlug={slug} item={item} key={item.match.id} />)}</div> : <div className="border border-dashed border-line p-5 text-sm text-[#675e52]">本阶段赛程尚未公开。</div>}</section>; })}</div> : <EmptyState title="赛程流程编排中" description="赛事管理员完成排期后将在此公开。" />}</div>;
}
