import { notFound } from "next/navigation";
import { UsersRound } from "lucide-react";
import { getEventBySlug, getPublicTeams } from "@/lib/queries";
import { EmptyState } from "@/components/ui";
import { Breadcrumbs, TeamCard, type PublicTeam } from "@/components/public-event";

export const dynamic = "force-dynamic";

export default async function PublicTeamsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") notFound();
  const teams = await getPublicTeams(event.id);
  return <div className="page-wrap"><Breadcrumbs items={[{ label: "赛事档案", href: "/events" }, { label: event.name, href: `/events/${slug}` }, { label: "参赛战队" }]} /><div className="mb-8 mt-5 flex items-end justify-between gap-4"><div><p className="eyebrow">TEAM REGISTRY</p><h1 className="display-title mt-2">参赛战队</h1><p className="mt-3 text-[#62594e]">查看已审核战队、公开阵容与赛事战绩。</p></div><UsersRound className="hidden text-plum md:block" size={38} /></div>{teams.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{teams.map((team) => <TeamCard eventSlug={slug} team={team as PublicTeam} variant="compact" key={team.id} />)}</div> : <EmptyState title="参赛名单尚未锁定" description="通过审核的战队会显示在这里。" />}</div>;
}
