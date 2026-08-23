import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Crown, LockKeyhole, ShieldCheck, Swords, UserPlus, UsersRound } from "lucide-react";
import { getEventBySlug, getPublicTeam, getTeamJoinContext } from "@/lib/queries";
import { Avatar, Breadcrumbs, MatchCard, TeamMark, factionLabel, teamRoleLabel, type PublicTeam } from "@/components/public-event";
import { EmptyState, Metric } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { JoinTeamForm } from "@/components/forms";
import { isEventRegistrationOpen } from "@/lib/event-policy";

export const dynamic = "force-dynamic";

export default async function TeamDetailPage({ params }: { params: Promise<{ slug: string; teamId: string }> }) {
  const { slug, teamId } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") notFound();
  const [result, user] = await Promise.all([getPublicTeam(event.id, teamId), getCurrentUser()]);
  if (!result) notFound();
  const { team, standing, matches } = result;
  const joinContext = user ? await getTeamJoinContext(user.id, event.id) : null;
  const captain = team.members.find((member) => member.role === "CAPTAIN");
  const joinPanel = team.status === "WITHDRAWN"
    ? <p className="flex items-start gap-2 text-sm text-[#5d687d]"><LockKeyhole className="mt-0.5 shrink-0" size={18} />该战队已经解散，页面仅保留历史赛事档案，不再接受入队申请。</p>
    : event.mode !== "PLAYER_TEAMS"
    ? <p className="flex items-start gap-2 text-sm text-[#5d687d]"><LockKeyhole className="mt-0.5 shrink-0" size={18} />本赛事由赛事管理员统一编队，不开放玩家主动加入。</p>
    : !isEventRegistrationOpen(event)
    ? <p className="flex items-start gap-2 text-sm text-[#5d687d]"><LockKeyhole className="mt-0.5 shrink-0" size={18} />赛事报名窗口已经关闭，战队阵容仅供查看。</p>
    : !user
    ? <div><p className="text-sm text-[#5d687d]">登录后，已通过本赛事选手审核的用户可以申请加入。</p><Link className="button-primary mt-4 w-full" href={`/login?next=${encodeURIComponent(`/events/${slug}/teams/${teamId}`)}`}>登录后申请</Link></div>
    : joinContext?.membership
      ? <p className="flex items-start gap-2 text-sm text-[#31533c]"><ShieldCheck className="mt-0.5 shrink-0" size={18} />{joinContext.membership.teamId === teamId ? "你已经是本战队成员。" : `你已加入 ${joinContext.membership.teamName}，同一赛事只能属于一支战队。`}</p>
      : joinContext?.pendingRequest
        ? <p className="flex items-start gap-2 text-sm text-[#6a4b25]"><UserPlus className="mt-0.5 shrink-0" size={18} />你已申请加入 {joinContext.pendingRequest.teamName}，请等待队长或副队长处理。</p>
        : !joinContext?.hasPlayerRole
          ? <div><p className="text-sm text-[#5d687d]">你需要先通过本赛事的选手身份审核。</p><Link className="button-secondary mt-4 w-full" href={`/me/applications?event=${event.id}`}>前往申请选手身份</Link></div>
          : team.locked
            ? <p className="flex items-start gap-2 text-sm text-[#5d687d]"><LockKeyhole className="mt-0.5 shrink-0" size={18} />战队名单已锁定，暂不接受新的入队申请。</p>
            : <JoinTeamForm teamId={teamId} />;

  return <div className="page-wrap space-y-14">
    <Breadcrumbs items={[{ label: "赛事档案", href: "/events" }, { label: event.name, href: `/events/${slug}` }, { label: "参赛战队", href: `/events/${slug}/teams` }, { label: team.name }]} />
    <section className="card-dark relative overflow-hidden">
      <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,rgba(167,131,78,.18),transparent_70%)]" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center"><TeamMark team={team as PublicTeam} size="lg" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><span className="data-label text-[#b9aa96]">{team.abbreviation} · TEAM DOSSIER</span>{team.status === "WITHDRAWN" && <span className="badge border-white/20 bg-white/10 text-[#d6ccbe]">历史战队 · 已解散</span>}</div><h1 className="mt-2 font-display text-4xl font-black md:text-6xl">{team.name}</h1><p className="mt-3 text-[#d6ccbe]">{team.slogan || "该战队尚未填写宣言"}</p>{captain && <p className="mt-4 flex items-center gap-2 text-sm text-[#b9aa96]"><Crown size={16} />队长 {captain.gameNickname || captain.displayName}</p>}</div></div>
    </section>
    <section className="grid gap-8 lg:grid-cols-[1fr_360px]"><div><p className="eyebrow">ABOUT THE TEAM</p><h2 className="section-title mt-2">战队介绍</h2><p className="mt-5 whitespace-pre-line text-[#514a40]">{team.description || "这支战队还没有补充详细介绍。"}</p></div><div className="grid grid-cols-3 gap-4 border-y border-line py-6 lg:border-y-0 lg:border-l lg:pl-7"><Metric label="场次" value={standing?.played ?? 0} /><Metric label="胜负" value={`${standing?.wins ?? 0}/${standing?.losses ?? 0}`} /><Metric label="积分" value={standing?.points ?? 0} /></div></section>
    <section className="grid gap-7 lg:grid-cols-[1fr_360px]">
      <div><div className="mb-6 flex items-center gap-3"><UsersRound className="text-plum" /><div><p className="eyebrow">PUBLIC ROSTER</p><h2 className="section-title">{team.status === "WITHDRAWN" ? "历史阵容" : "公开阵容"}</h2></div></div>{team.members.length ? <div className="grid gap-4 md:grid-cols-2">{team.members.map((member) => <Link className="card group flex items-center gap-4 transition-colors hover:bg-white" href={`/events/${slug}/players/${member.id}`} key={member.id}><Avatar name={member.gameNickname || member.displayName} src={member.avatarUrl} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-bold">{member.gameNickname || member.displayName}</h3>{member.role === "CAPTAIN" && <Crown className="text-gold" size={15} aria-label="队长" />}{member.role === "VICE_CAPTAIN" && <ShieldCheck className="text-plum" size={15} aria-label="副队长" />}</div><p className="mt-1 text-sm text-[#675e52]">{member.historical ? "历史队员" : teamRoleLabel(member.role)} · {factionLabel(member.specialty)}</p></div><ArrowRight className="text-plum transition-transform group-hover:translate-x-1" size={18} aria-hidden="true" /></Link>)}</div> : <EmptyState title="暂无可公开阵容" description="战队成员或已发布比赛的历史出场会显示在这里。" />}</div>
      <aside className="card h-fit"><div className="mb-4 flex items-center gap-2"><UserPlus className="text-plum" /><div><p className="eyebrow">JOIN THE TEAM</p><h2 className="font-display text-2xl font-bold">申请加入</h2></div></div>{joinPanel}</aside>
    </section>
    <section><div className="mb-6 flex items-center gap-3"><Swords className="text-plum" /><div><p className="eyebrow">MATCH HISTORY</p><h2 className="section-title">比赛记录</h2></div></div>{matches.length ? <div className="space-y-3">{matches.map((item) => <MatchCard eventSlug={slug} item={item} key={item.match.id} />)}</div> : <EmptyState title="暂无比赛记录" description="该战队参与的公开比赛会显示在这里。" />}</section>
  </div>;
}
