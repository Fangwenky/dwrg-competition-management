import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardList, FileText, Swords, UsersRound } from "lucide-react";
import { getEventBySlug, getEventOverview } from "@/lib/queries";
import { EmptyState, Metric } from "@/components/ui";
import { MatchCard, StandingsView, TeamCard, type PublicTeam } from "@/components/public-event";
import { eventRegistrationPhase } from "@/lib/event-policy";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") notFound();
  const overview = await getEventOverview(event.id);
  const registrationPhase = eventRegistrationPhase(event);
  return <div className="page-wrap space-y-16">
    <section className="grid gap-8 lg:grid-cols-[1fr_360px]"><div><p className="eyebrow">EVENT BRIEF</p><h2 className="section-title mt-2">赛事摘要</h2><p className="mt-5 max-w-3xl whitespace-pre-line text-[#50493f]">{event.description || "赛事说明尚未发布。"}</p><div className="mt-8 grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-4"><Metric label="报名选手" value={overview.playerCount} /><Metric label={event.mode === "INDIVIDUAL" ? "固定战队" : "参赛战队"} value={event.mode === "INDIVIDUAL" ? "不使用" : overview.teams.length} /><Metric label="赛程阶段" value={overview.stages.length} /><Metric label="比赛记录" value={overview.matches.length} /></div></div><div className="card-dark self-start"><FileText className="text-gold" />{registrationPhase === "OPEN" ? <><h3 className="mt-4 font-display text-2xl font-bold">赛事报名开放中</h3><p className="mt-2 text-sm text-[#c8bfb2]">选手报名直接使用个人竞技资料；解说和裁判按赛事提交经历。</p><Link href={`/me/applications?event=${event.id}`} className="button-primary mt-6 w-full bg-gold text-ink hover:bg-[#c29a5d]">前往报名 <ArrowRight size={17} /></Link></> : registrationPhase === "UPCOMING" ? <><h3 className="mt-4 font-display text-2xl font-bold">报名尚未开始</h3><p className="mt-2 text-sm text-[#c8bfb2]">报名将在 {event.registrationStart?.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 开放。现在可以先完善个人竞技资料。</p><Link href="/me/profile" className="button-secondary mt-6 w-full border-gold text-gold">完善个人资料 <ArrowRight size={17} /></Link></> : <><h3 className="mt-4 font-display text-2xl font-bold">报名已结束</h3><p className="mt-2 text-sm text-[#c8bfb2]">赛事档案仍可公开浏览；赛程、战队与已发布结果会持续保留。</p><Link href={`/events/${slug}/schedule`} className="button-secondary mt-6 w-full border-gold text-gold">查看完整赛程 <ArrowRight size={17} /></Link></>}</div></section>

    {event.mode !== "INDIVIDUAL" && <section><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div className="flex items-center gap-3"><UsersRound className="text-plum" /><div><p className="eyebrow">TEAM REGISTRY</p><h2 className="section-title">参赛战队</h2></div></div><Link className="flex min-h-11 items-center gap-1 font-semibold text-plum" href={`/events/${slug}/teams`}>查看全部战队 <ArrowRight size={17} /></Link></div>{overview.teams.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{overview.teams.slice(0, 3).map((team) => <TeamCard eventSlug={slug} team={team as PublicTeam} key={team.id} />)}</div> : <EmptyState title="参赛名单尚未编成" description={event.mode === "ADMIN_TEAMS" ? "赛事管理员完成编队后会显示在这里。" : "通过审核的战队会显示在这里。"} />}</section>}

    {event.mode !== "INDIVIDUAL" && overview.standings.length > 0 && <section><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div className="flex items-center gap-3"><ClipboardList className="text-plum" /><div><p className="eyebrow">LEADERBOARD</p><h2 className="section-title">积分排名</h2></div></div><Link className="flex min-h-11 items-center gap-1 font-semibold text-plum" href={`/events/${slug}/standings`}>完整排名 <ArrowRight size={17} /></Link></div><StandingsView eventSlug={slug} standings={overview.standings.slice(0, 5)} /></section>}

    <section><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div className="flex items-center gap-3"><Swords className="text-plum" /><div><p className="eyebrow">LATEST MATCHES</p><h2 className="section-title">近期赛程</h2></div></div><Link className="flex min-h-11 items-center gap-1 font-semibold text-plum" href={`/events/${slug}/schedule`}>全部赛程 <ArrowRight size={17} /></Link></div>{overview.matches.length ? <div className="space-y-3">{overview.matches.slice(0, 4).map((item) => <MatchCard eventSlug={slug} item={item} key={item.match.id} />)}</div> : <EmptyState title="还没有比赛记录" description="赛事管理员排期后会在这里形成公开时间线。" />}</section>
  </div>;
}
