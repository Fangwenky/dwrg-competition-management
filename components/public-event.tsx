import Link from "next/link";
import { CalendarDays, ChevronRight, Crown, Swords } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { StatusBadge } from "@/components/ui";
import { SafeImage } from "@/components/safe-image";

export type PublicMember = {
  id: string;
  userId: string;
  role: "CAPTAIN" | "VICE_CAPTAIN" | "MEMBER";
  specialty: "SURVIVOR" | "HUNTER" | "FLEX";
  gameNickname: string;
  publicBio: string;
  displayName: string;
  avatarUrl: string | null;
  historical?: boolean;
};

export type PublicTeam = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  name: string;
  abbreviation: string;
  slogan: string;
  description: string;
  logoUrl: string | null;
  members: PublicMember[];
};

export const factionLabel = (value: string) => value === "SURVIVOR" ? "求生者" : value === "HUNTER" ? "监管者" : "双阵营";
export const bpScopeLabel = (value: string) => value === "MAP" ? "地图" : value === "FACTION" ? "阵营" : "角色";
export const bpActionLabel = (value: string) => value === "BAN" ? "禁用" : "选用";
export const teamRoleLabel = (value: string) => value === "CAPTAIN" ? "队长" : value === "VICE_CAPTAIN" ? "副队长" : "队员";

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav className="breadcrumbs" aria-label="面包屑">{items.map((item, index) => <span className="flex items-center gap-2" key={`${item.label}-${index}`}>{index > 0 && <span aria-hidden="true">/</span>}{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</span>)}</nav>;
}

export function Avatar({ name, src, size = "md" }: { name: string; src?: string | null; size?: "sm" | "md" | "lg" }) {
  const className = `avatar avatar-${size}`;
  const fallback = <span className={className} aria-label={`${name}的默认头像`}>{name.trim().slice(0, 1).toUpperCase() || "?"}</span>;
  return <SafeImage className={className} src={src} alt={`${name}的头像`} loading="lazy" fallback={fallback} />;
}

export function TeamMark({ team, size = "md" }: { team: Pick<PublicTeam, "name" | "abbreviation" | "logoUrl">; size?: "md" | "lg" }) {
  const className = `team-mark team-mark-${size}`;
  const fallback = <span className={className} aria-label={`${team.name}文字队徽`}>{team.abbreviation.slice(0, 3)}</span>;
  return <SafeImage className={className} src={team.logoUrl} alt={`${team.name}队徽`} loading="lazy" fallback={fallback} />;
}

export function TeamCard({ eventSlug, team, variant = "default" }: { eventSlug: string; team: PublicTeam; variant?: "default" | "compact" }) {
  const captain = team.members.find((member) => member.role === "CAPTAIN");
  return <Link className={`team-card group ${variant === "compact" ? "team-card-compact" : ""}`} href={`/events/${eventSlug}/teams/${team.id}`}>
    <div className="flex items-start gap-4"><TeamMark team={team} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="data-label">{team.abbreviation} · {team.members.length} 人</span>{team.status === "WITHDRAWN" && <span className="badge border-line bg-[#ece8e0] text-[#62594e]">已解散</span>}</div><h3 className="mt-1 truncate font-display-cn text-2xl font-black">{team.name}</h3><p className="mt-1 line-clamp-2 text-sm text-[#5d687d]">{team.slogan || "该战队尚未填写宣言"}</p></div></div>
    <div className="team-card-footer mt-5 border-t border-line pt-4"><div className="mb-3 flex items-center justify-between gap-3 text-xs text-[#606c82]"><span className="flex min-w-0 items-center gap-1 truncate">{captain && <><Crown className="shrink-0" size={14} />队长 {captain.gameNickname || captain.displayName}</>}</span><span className="shrink-0 font-semibold text-plum">查看完整档案 <ChevronRight className="inline" size={15} /></span></div><div className="team-card-roster flex -space-x-2">{team.members.slice(0, 5).map((member) => <Avatar name={member.gameNickname || member.displayName} src={member.avatarUrl} size="sm" key={member.id} />)}{team.members.length > 5 && <span className="avatar avatar-sm">+{team.members.length - 5}</span>}</div></div>
  </Link>;
}

export type Standing = { teamId: string; name: string; abbreviation: string; logoUrl?: string | null; played: number; wins: number; losses: number; gameDiff: number; points: number };

export function StandingsView({ eventSlug, standings }: { eventSlug: string; standings: Standing[] }) {
  return <><div className="hidden overflow-hidden border border-line md:block"><table className="w-full bg-[#f7f9fd] text-left"><thead className="bg-parchment text-sm"><tr><th className="p-3">排名</th><th className="p-3">战队</th><th className="p-3 text-center">场次</th><th className="p-3 text-center">胜 / 负</th><th className="p-3 text-center">局差</th><th className="p-3 text-center">积分</th></tr></thead><tbody>{standings.map((standing, index) => <tr className="border-t border-line transition-colors hover:bg-white" key={standing.teamId}><td className="p-3 font-data text-xl font-bold">{String(index + 1).padStart(2, "0")}</td><td className="p-3"><Link className="font-semibold hover:text-plum hover:underline" href={`/events/${eventSlug}/teams/${standing.teamId}`}><strong>{standing.abbreviation}</strong><span className="ml-2 text-sm font-normal text-[#606c82]">{standing.name}</span></Link></td><td className="p-3 text-center">{standing.played}</td><td className="p-3 text-center">{standing.wins} / {standing.losses}</td><td className="p-3 text-center">{standing.gameDiff > 0 ? "+" : ""}{standing.gameDiff}</td><td className="p-3 text-center font-bold text-plum">{standing.points}</td></tr>)}</tbody></table></div><div className="space-y-3 md:hidden">{standings.map((standing, index) => <Link className="ranking-card" href={`/events/${eventSlug}/teams/${standing.teamId}`} key={standing.teamId}><span className="font-data text-3xl font-extrabold text-gold">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="truncate font-bold">{standing.abbreviation} · {standing.name}</div><div className="mt-1 text-xs text-[#657187]">{standing.played} 场 · {standing.wins} 胜 {standing.losses} 负 · 局差 {standing.gameDiff > 0 ? "+" : ""}{standing.gameDiff}</div></div><div className="text-right"><div className="font-data text-3xl font-extrabold text-plum">{standing.points}</div><div className="data-label">积分</div></div></Link>)}</div></>;
}

export function MatchCard({ eventSlug, item }: { eventSlug: string; item: { match: { id: string; roundLabel: string; scheduledAt: Date | null; status: string; scoreA: number; scoreB: number; teamAId: string | null; teamBId: string | null }; teamAName: string | null; teamBName: string | null } }) {
  const { match, teamAName, teamBName } = item;
  return <Link href={match.status === "PUBLISHED" ? `/matches/${match.id}` : `/events/${eventSlug}/schedule`} className="match-card group"><div className="text-sm text-[#606c82]"><span className="data-label block">{match.roundLabel}</span><span className="mt-1 flex items-center gap-1"><CalendarDays size={14} />{match.scheduledAt ? format(match.scheduledAt, "M月d日 HH:mm", { locale: zhCN }) : "待排期"}</span></div><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center font-semibold"><span className="truncate">{teamAName ?? "待定"}</span><span className="font-data text-3xl font-extrabold">{match.status === "PUBLISHED" ? `${match.scoreA} : ${match.scoreB}` : "VS"}</span><span className="truncate">{teamBName ?? "待定"}</span></div><div className="flex items-center justify-between gap-3 md:justify-end"><StatusBadge status={match.status} /><span className="text-plum transition-transform group-hover:translate-x-1" aria-hidden="true"><ChevronRight /></span></div></Link>;
}

export function EmptyScheduleHint() {
  return <div className="card flex items-center gap-4"><Swords className="text-gold" /><div><strong>赛程仍在编排</strong><p className="text-sm text-[#675e52]">比赛生成并公开后会显示在这里。</p></div></div>;
}
