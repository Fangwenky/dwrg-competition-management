import { notFound } from "next/navigation";
import { getEventBySlug, getEventOverview } from "@/lib/queries";
import { Breadcrumbs, StandingsView } from "@/components/public-event";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StandingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") notFound();
  const { standings } = await getEventOverview(event.id);
  return <div className="page-wrap"><Breadcrumbs items={[{ label: "赛事档案", href: "/events" }, { label: event.name, href: `/events/${slug}` }, { label: "积分排名" }]} /><div className="mb-8 mt-5"><p className="eyebrow">LEADERBOARD</p><h1 className="display-title mt-2">积分排名</h1><p className="mt-3 text-[#62594e]">按积分、局差和战队名称依次排序，仅统计已发布赛果。</p></div>{standings.length ? <StandingsView eventSlug={slug} standings={standings} /> : <EmptyState title="暂无积分记录" description="发布比赛结果后会自动计算排名。" />}</div>;
}
