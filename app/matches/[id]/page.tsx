import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { CalendarDays, ChevronRight, Headphones, Scale, Swords } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { db } from "@/lib/db";
import { appearances, bpEntries, events, gameCharacters, gameRounds, halfResults, matchAssignments, matchParticipants, matches, mediaAssets, teamMembers, users } from "@/lib/db/schema";
import { getGameLabels, getPublicTeams } from "@/lib/queries";
import { Avatar, Breadcrumbs, bpActionLabel, bpScopeLabel, factionLabel } from "@/components/public-event";
import { StatusBadge } from "@/components/ui";
import { mediaUrl } from "@/lib/media";
import { SafeImage } from "@/components/safe-image";
import { historicalTeamProfileId, individualProfileId } from "@/lib/public-player-profile";

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  if (!match || match.status !== "PUBLISHED") notFound();

  const [event] = await db.select().from(events).where(eq(events.id, match.eventId)).limit(1);
  if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") notFound();

  const [rounds, publicTeams, labels, participants, staffAssignments] = await Promise.all([
    db.select().from(gameRounds).where(eq(gameRounds.matchId, id)).orderBy(asc(gameRounds.roundIndex)),
    getPublicTeams(event.id),
    getGameLabels(),
    db.select({ side: matchParticipants.side, displayName: users.displayName, gameNickname: users.gameNickname, slotIndex: matchParticipants.slotIndex }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).where(eq(matchParticipants.matchId, id)).orderBy(asc(matchParticipants.slotIndex)),
    db.select({ role: matchAssignments.role, userId: users.id, displayName: users.displayName, avatarStorageKey: mediaAssets.storageKey })
      .from(matchAssignments)
      .innerJoin(users, eq(users.id, matchAssignments.userId))
      .leftJoin(mediaAssets, eq(mediaAssets.id, users.avatarAssetId))
      .where(eq(matchAssignments.matchId, id))
      .orderBy(asc(matchAssignments.createdAt))
  ]);
  const roundIds = rounds.map((round) => round.id);
  const [halves, bp] = await Promise.all([
    roundIds.length ? db.select().from(halfResults).where(inArray(halfResults.roundId, roundIds)).orderBy(asc(halfResults.halfIndex)) : Promise.resolve([]),
    roundIds.length ? db.select().from(bpEntries).where(inArray(bpEntries.roundId, roundIds)).orderBy(asc(bpEntries.halfIndex), asc(bpEntries.orderIndex)) : Promise.resolve([])
  ]);
  const halfIds = halves.map((half) => half.id);
  const lineups = halfIds.length ? await db.select({
    appearance: appearances,
    memberId: teamMembers.id,
    displayName: users.displayName,
    memberGameNickname: teamMembers.gameNickname,
    userGameNickname: users.gameNickname,
    avatarStorageKey: mediaAssets.storageKey,
    characterName: gameCharacters.name,
    characterPosterPath: gameCharacters.posterPath
  })
    .from(appearances)
    .innerJoin(users, eq(users.id, appearances.userId))
    .leftJoin(teamMembers, and(
      eq(teamMembers.userId, appearances.userId),
      eq(teamMembers.eventId, event.id),
      eq(teamMembers.teamId, appearances.teamId)
    ))
    .leftJoin(mediaAssets, eq(mediaAssets.id, users.avatarAssetId))
    .leftJoin(gameCharacters, eq(gameCharacters.key, appearances.characterKey))
    .where(inArray(appearances.halfId, halfIds)) : [];

  const teamById = new Map(publicTeams.map((team) => [team.id, team]));
  const teamA = match.teamAId ? teamById.get(match.teamAId) : null;
  const teamB = match.teamBId ? teamById.get(match.teamBId) : null;
  const participantLabel = (side: "A" | "B") => participants.filter((item) => item.side === side).map((item) => item.gameNickname || item.displayName).join(" / ");
  const sideLabel = (side: "A" | "B") => side === "A" ? match.sideALabel || "参赛方 A" : match.sideBLabel || "参赛方 B";
  const winnerLabel = match.winnerSide === "A" ? teamA?.name ?? sideLabel("A") : match.winnerSide === "B" ? teamB?.name ?? sideLabel("B") : null;
  const referees = staffAssignments.filter((item) => item.role === "REFEREE");
  const commentators = staffAssignments.filter((item) => item.role === "COMMENTATOR");

  const teamHeading = (team: typeof teamA, fallback: string) => team
    ? <Link className="group" href={`/events/${event.slug}/teams/${team.id}`}>
        <div className="font-display text-3xl font-black group-hover:text-gold">{team.name}</div>
        <span className="data-label text-[#a69b8d]">{team.abbreviation}{team.status === "WITHDRAWN" ? " · 已解散" : ""}</span>
      </Link>
    : <div>
        <div className="font-display text-3xl font-black">{fallback}</div>
        <span className="data-label text-[#a69b8d]">历史参赛方</span>
      </div>;

  return <div className="page-wrap space-y-12">
    <Breadcrumbs items={[
      { label: "赛事档案", href: "/events" },
      { label: event.name, href: `/events/${event.slug}` },
      { label: "赛程", href: `/events/${event.slug}/schedule` },
      { label: match.roundLabel || "比赛档案" }
    ]} />

    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow">MATCH DOSSIER / {id.slice(0, 8)}</p>
        <h1 className="display-title mt-3">比赛档案</h1>
        {match.scheduledAt && <p className="mt-3 flex items-center gap-2 text-sm text-[#675e52]"><CalendarDays size={16} />{format(match.scheduledAt, "yyyy年M月d日 HH:mm", { locale: zhCN })}</p>}
      </div>
      <StatusBadge status={match.status} />
    </div>

    <section className="card-dark relative overflow-hidden py-10">
      <Swords className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/[.035]" size={280} />
      <div className="relative grid items-center gap-7 text-center md:grid-cols-[1fr_auto_1fr]">
        {teamHeading(teamA, participantLabel("A") ? `${sideLabel("A")} · ${participantLabel("A")}` : sideLabel("A"))}
        <div>
          <span className="data-label text-[#a69b8d]">FINAL SCORE</span>
          <div className="font-data text-7xl font-extrabold leading-none text-[#d4b279]">{match.scoreA} : {match.scoreB}</div>
          <div className="mt-2 text-sm text-[#a9a092]">BO{match.bestOf} · {match.roundLabel}</div>
          {match.scoreA === match.scoreB && winnerLabel && <div className="mt-3 border border-gold/35 bg-gold/10 px-3 py-2 text-sm text-[#e1c696]">裁定胜方 · {winnerLabel}</div>}
        </div>
        {teamHeading(teamB, participantLabel("B") ? `${sideLabel("B")} · ${participantLabel("B")}` : sideLabel("B"))}
      </div>
    </section>

    <section className="match-staff-strip" aria-labelledby="match-staff-heading">
      <div className="match-staff-title"><span className="data-label">MATCH CREW</span><h2 id="match-staff-heading" className="font-display text-xl font-bold">本场赛务</h2></div>
      <div className="match-staff-group"><Scale className="shrink-0 text-gold" size={20} aria-hidden="true" /><span className="data-label shrink-0">裁判</span><div className="match-staff-people">{referees.length ? referees.map((person) => <span className="match-staff-person" key={person.userId}><Avatar name={person.displayName} src={mediaUrl(person.avatarStorageKey)} size="sm" /><strong>{person.displayName}</strong></span>) : <span className="text-sm text-[#68748a]">未记录</span>}</div></div>
      <div className="match-staff-group"><Headphones className="shrink-0 text-plum" size={20} aria-hidden="true" /><span className="data-label shrink-0">解说</span><div className="match-staff-people">{commentators.length ? commentators.map((person) => <span className="match-staff-person" key={person.userId}><Avatar name={person.displayName} src={mediaUrl(person.avatarStorageKey)} size="sm" /><strong>{person.displayName}</strong></span>) : <span className="text-sm text-[#68748a]">未记录</span>}</div></div>
    </section>

    {match.manualReason && <div className="border-l-4 border-gold bg-[#eee2cd] p-4"><strong>人工裁定说明：</strong>{match.manualReason}</div>}

    <section>
      <div className="mb-6"><p className="eyebrow">ROUND ARCHIVE</p><h2 className="section-title mt-2">局级记录</h2></div>
      <div className="space-y-6">{rounds.map((round) => {
        const currentHalves = halves.filter((half) => half.roundId === round.id);
        const currentBp = bp.filter((entry) => entry.roundId === round.id);
        return <article className="round-dossier" key={round.id}>
          <div className="round-dossier-header">
            <div><span className="data-label">GAME {String(round.roundIndex).padStart(2, "0")}</span><h3 className="font-display text-2xl font-black">{labels.maps.get(round.mapKey) ?? round.mapKey}</h3></div>
            <div className="font-data text-4xl font-extrabold">{round.scoreA} : {round.scoreB}</div>
          </div>
          <div className="grid gap-0 lg:grid-cols-2">{currentHalves.map((half) => {
            const halfLineups = lineups.filter(({ appearance }) => appearance.halfId === half.id).sort((a, b) => a.appearance.faction === b.appearance.faction ? (a.memberGameNickname || a.userGameNickname || a.displayName).localeCompare(b.memberGameNickname || b.userGameNickname || b.displayName, "zh-CN") : a.appearance.faction === "SURVIVOR" ? -1 : 1);
            const halfBp = currentBp.filter((entry) => entry.halfIndex === half.halfIndex);
            return <section className="half-dossier" key={half.id}>
              <div className="half-dossier-heading">
                <div className="min-w-0"><span className="data-label">{half.halfIndex === 1 ? "上半场" : "下半场"}</span><h4 className="mt-1 truncate font-bold">{half.survivorTeamId ? teamById.get(half.survivorTeamId)?.abbreviation ?? "求生者方" : half.survivorSide ? sideLabel(half.survivorSide) : "求生者方"} 求生者 · {half.hunterTeamId ? teamById.get(half.hunterTeamId)?.abbreviation ?? "监管者方" : half.hunterSide ? sideLabel(half.hunterSide) : "监管者方"} 监管者</h4></div>
                <div className="half-result-summary" aria-label={`逃脱${half.escapes}人，求生者${half.survivorPoints}分，监管者${half.hunterPoints}分`}><span className="half-escape-count">逃脱 {half.escapes}</span><span><strong>{half.survivorPoints}</strong>求生</span><span><strong>{half.hunterPoints}</strong>监管</span></div>
              </div>
              {halfLineups.length > 0 && <div className="mt-4">
                <span className="data-label">本场阵容</span>
                <div className="lineup-visual-grid mt-2">{halfLineups.map(({ appearance, memberId, displayName, memberGameNickname, userGameNickname, avatarStorageKey, characterName, characterPosterPath }) => {
                  const playerName = memberGameNickname || userGameNickname || displayName;
                  const resolvedCharacterName = characterName ?? labels.characters.get(appearance.characterKey) ?? appearance.characterKey;
                  const profileId = memberId ?? (appearance.teamId ? historicalTeamProfileId(appearance.teamId, appearance.userId) : individualProfileId(appearance.userId));
                  const content = <>
                    <span className="lineup-character-art" aria-hidden="true"><SafeImage className="h-full w-full object-contain object-bottom" src={characterPosterPath} alt="" loading="lazy" fallback={<span className="lineup-character-fallback">{resolvedCharacterName.slice(0, 1)}</span>} /></span>
                    <span className="lineup-player-avatar"><Avatar name={playerName} src={mediaUrl(avatarStorageKey)} size="sm" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{playerName}</span><span className="mt-0.5 block truncate text-xs text-[#606c82]">{factionLabel(appearance.faction)} · {resolvedCharacterName}</span></span>
                    <ChevronRight className="shrink-0 text-plum" size={15} aria-hidden="true" />
                  </>;
                  return <Link className={`lineup-visual-card ${appearance.faction === "HUNTER" ? "lineup-visual-card-hunter" : ""}`} href={`/events/${event.slug}/players/${profileId}`} aria-label={`${playerName}，${factionLabel(appearance.faction)}，使用${resolvedCharacterName}`} key={appearance.id}>{content}</Link>;
                })}</div>
              </div>}
              {halfBp.length > 0 && <div className="mt-4 border-t border-line pt-3">
                <span className="data-label">BP 顺序</span>
                <ol className="bp-compact-list mt-2">{halfBp.map((entry) => <li className="bp-compact-step" key={entry.id}><span>{entry.orderIndex}</span><span>{bpScopeLabel(entry.scope)} · <strong>{bpActionLabel(entry.action)}</strong> · {labels.maps.get(entry.targetKey) ?? labels.characters.get(entry.targetKey) ?? entry.targetKey}</span></li>)}</ol>
              </div>}
            </section>;
          })}</div>
        </article>;
      })}</div>
    </section>

    <div className="border-t border-line pt-6"><Link className="button-secondary" href={`/events/${event.slug}/schedule`}>返回赛事赛程</Link></div>
  </div>;
}
