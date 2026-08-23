import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Swords } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { getEventBySlug, getPublicMemberProfile } from "@/lib/queries";
import { Avatar, Breadcrumbs, TeamMark, factionLabel, teamRoleLabel, type PublicTeam } from "@/components/public-event";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PlayerProfilePage({ params }: { params: Promise<{ slug: string; memberId: string }> }) {
  const { slug, memberId } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") notFound();
  const profile = await getPublicMemberProfile(event.id, memberId);
  if (!profile) notFound();
  const { member, team, matches } = profile;
  return <div className="page-wrap space-y-14">
    <Breadcrumbs items={[{ label: "赛事档案", href: "/events" }, { label: event.name, href: `/events/${slug}` }, ...(team ? [{ label: team.name, href: `/events/${slug}/teams/${team.id}` }] : []), { label: member.gameNickname || member.displayName }]} />
    <section className="grid gap-8 border-b border-line pb-10 md:grid-cols-[auto_1fr_auto] md:items-center"><Avatar name={member.gameNickname || member.displayName} src={member.avatarUrl} size="lg" /><div><span className="data-label">PLAYER DOSSIER · {factionLabel(member.specialty)}</span><h1 className="mt-2 font-display text-4xl font-black md:text-6xl">{member.gameNickname || member.displayName}</h1><p className="mt-4 max-w-2xl text-[#5d5448]">{member.publicBio || "该选手尚未填写公开简介。"}</p></div>{team ? <Link className="card flex min-w-[230px] items-center gap-3 hover:bg-white" href={`/events/${slug}/teams/${team.id}`}><TeamMark team={team as PublicTeam} /><div><span className="data-label">所属战队</span><div className="font-bold">{team.name}</div></div></Link> : <div className="card min-w-[230px]"><span className="data-label">参赛形式</span><div className="mt-1 font-bold">个人参赛</div></div>}</section>
    <section className="grid gap-6 border-y border-line py-6 sm:grid-cols-2"><div><span className="data-label">阵营专长</span><p className="mt-1 font-display text-3xl font-bold">{factionLabel(member.specialty)}</p></div><div><span className="data-label">参赛身份</span><p className="mt-1 font-display text-3xl font-bold">{team ? member.historical ? "历史队员" : teamRoleLabel(member.role) : "个人选手"}</p></div></section>
    <section><div className="mb-6 flex items-center gap-3"><Swords className="text-plum" /><div><p className="eyebrow">MATCH RECORDS</p><h2 className="section-title">比赛记录</h2></div></div>{matches.length ? <div className="space-y-3">{matches.map((match) => <Link className="card flex flex-wrap items-center justify-between gap-4 transition-colors hover:bg-white" href={`/matches/${match.matchId}`} key={match.matchId}><div><span className="data-label">{match.roundLabel}</span><p className="mt-1 text-sm text-[#675e52]">{match.scheduledAt ? format(match.scheduledAt, "yyyy年M月d日 HH:mm", { locale: zhCN }) : "时间待定"}</p></div><div className="text-sm">{factionLabel(match.faction)} · {match.characterName ?? match.characterKey}</div><div className="flex items-center gap-3"><span className="font-data text-2xl font-extrabold">{match.scoreA} : {match.scoreB}</span><ArrowRight className="text-plum" size={18} /></div></Link>)}</div> : <EmptyState title="暂无公开比赛" description="比赛结果发布后会出现在这里。" />}</section>
  </div>;
}
