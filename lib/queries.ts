import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appearances, events, gameCharacters, gameMaps, gameRounds, halfResults, matchParticipants, matches, mediaAssets, stages, teams, teamJoinRequests, teamMembers, users, eventRoleGrants, eventRoleApplications, notifications, matchAssignments } from "@/lib/db/schema";
import { mediaUrl, privateMediaUrl } from "@/lib/media";
import { historicalTeamProfileId, individualProfileId, parsePublicPlayerProfileId } from "@/lib/public-player-profile";

export async function getPublicEvents() {
  const rows = await db.select({ event: events, heroStorageKey: mediaAssets.storageKey }).from(events)
    .leftJoin(mediaAssets, eq(mediaAssets.id, events.heroAssetId))
    .where(inArray(events.status, ["REGISTRATION", "ACTIVE", "COMPLETED"]))
    .orderBy(desc(events.eventStart));
  return rows.map(({ event, heroStorageKey }) => ({ ...event, heroUrl: mediaUrl(heroStorageKey) }));
}

export async function getApplicationEvents() {
  const rows = await db.select().from(events).where(eq(events.status, "REGISTRATION")).orderBy(desc(events.eventStart));
  const now = new Date();
  return rows.filter((event) => (!event.registrationStart || now >= event.registrationStart) && (!event.registrationEnd || now <= event.registrationEnd));
}

export async function getEventBySlug(slug: string) {
  const [row] = await db.select({ event: events, heroStorageKey: mediaAssets.storageKey, heroCredit: mediaAssets.creditText, heroSourceUrl: mediaAssets.sourceUrl })
    .from(events).leftJoin(mediaAssets, eq(mediaAssets.id, events.heroAssetId)).where(and(eq(events.slug, slug), inArray(events.status, ["REGISTRATION", "ACTIVE", "COMPLETED"]))).limit(1);
  return row ? { ...row.event, heroUrl: mediaUrl(row.heroStorageKey), heroCredit: row.heroCredit, heroSourceUrl: row.heroSourceUrl } : null;
}

export async function getPublicTeams(eventId: string) {
  const hasPublishedHistory = sql<boolean>`exists (
    select 1 from ${matches} as published_match
    where published_match.event_id = ${teams.eventId}
      and published_match.status = 'PUBLISHED'
      and (published_match.team_a_id = ${teams.id} or published_match.team_b_id = ${teams.id})
  )`;
  const teamRows = await db.select({ team: teams, logoStorageKey: mediaAssets.storageKey })
    .from(teams).leftJoin(mediaAssets, eq(mediaAssets.id, teams.logoAssetId))
    .where(and(
      eq(teams.eventId, eventId),
      or(eq(teams.status, "APPROVED"), and(eq(teams.status, "WITHDRAWN"), hasPublishedHistory))
    )).orderBy(asc(teams.name));
  if (!teamRows.length) return [];
  const teamIds = teamRows.map(({ team }) => team.id);
  const memberRows = await db.select({
    id: teamMembers.id,
    teamId: teamMembers.teamId,
    userId: teamMembers.userId,
    role: teamMembers.role,
    specialty: teamMembers.specialty,
    gameNickname: teamMembers.gameNickname,
    publicBio: teamMembers.publicBio,
    displayName: users.displayName,
    avatarStorageKey: mediaAssets.storageKey
  }).from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, users.avatarAssetId))
    .where(inArray(teamMembers.teamId, teamIds))
    .orderBy(asc(teamMembers.joinedAt));
  const historicalRows = await db.select({
    teamId: appearances.teamId,
    userId: appearances.userId,
    faction: appearances.faction,
    displayName: users.displayName,
    gameNickname: users.gameNickname,
    avatarStorageKey: mediaAssets.storageKey
  }).from(appearances)
    .innerJoin(halfResults, eq(halfResults.id, appearances.halfId))
    .innerJoin(gameRounds, eq(gameRounds.id, halfResults.roundId))
    .innerJoin(matches, eq(matches.id, gameRounds.matchId))
    .innerJoin(users, eq(users.id, appearances.userId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, users.avatarAssetId))
    .where(and(inArray(appearances.teamId, teamIds), eq(matches.status, "PUBLISHED")));
  const historicalByTeam = new Map<string, Array<{
    id: string;
    userId: string;
    role: "CAPTAIN" | "MEMBER";
    specialty: "SURVIVOR" | "HUNTER" | "FLEX";
    gameNickname: string;
    publicBio: string;
    displayName: string;
    avatarUrl: string | null;
    historical: true;
  }>>();
  for (const { team } of teamRows) {
    const people = new Map<string, { row: typeof historicalRows[number]; factions: Set<string> }>();
    for (const row of historicalRows) {
      if (row.teamId !== team.id) continue;
      const existing = people.get(row.userId);
      if (existing) existing.factions.add(row.faction);
      else people.set(row.userId, { row, factions: new Set([row.faction]) });
    }
    historicalByTeam.set(team.id, [...people.values()].map(({ row, factions }) => ({
      id: historicalTeamProfileId(team.id, row.userId),
      userId: row.userId,
      role: row.userId === team.captainId ? "CAPTAIN" : "MEMBER",
      specialty: factions.size > 1 ? "FLEX" : factions.has("HUNTER") ? "HUNTER" : "SURVIVOR",
      gameNickname: row.gameNickname,
      publicBio: "",
      displayName: row.displayName,
      avatarUrl: mediaUrl(row.avatarStorageKey),
      historical: true
    })));
  }
  return teamRows.map(({ team, logoStorageKey }) => {
    const currentMembers = memberRows.filter((member) => member.teamId === team.id).map((member) => ({ ...member, avatarUrl: mediaUrl(member.avatarStorageKey), historical: false as const }));
    const currentUserIds = new Set(currentMembers.map((member) => member.userId));
    const historicalMembers = (historicalByTeam.get(team.id) ?? []).filter((member) => !currentUserIds.has(member.userId));
    return { ...team, logoUrl: mediaUrl(logoStorageKey), members: [...currentMembers, ...historicalMembers] };
  });
}

export async function getEventOverview(eventId: string) {
  const [eventTeams, eventStages, eventMatches, participantRows, playerCount] = await Promise.all([
    getPublicTeams(eventId),
    db.select().from(stages).where(and(eq(stages.eventId, eventId), inArray(stages.status, ["ACTIVE", "COMPLETED"]))).orderBy(asc(stages.orderIndex)),
    db.select({ match: matches, teamAName: sql<string | null>`a.name`, teamBName: sql<string | null>`b.name` })
      .from(matches)
      .leftJoin(sql`${teams} as a`, sql`a.id = ${matches.teamAId}`)
      .leftJoin(sql`${teams} as b`, sql`b.id = ${matches.teamBId}`)
      .where(and(eq(matches.eventId, eventId), inArray(matches.status, ["SCHEDULED", "IN_PROGRESS", "PUBLISHED"])))
      .orderBy(asc(matches.scheduledAt), asc(matches.createdAt)),
    db.select({ matchId: matchParticipants.matchId, side: matchParticipants.side, displayName: users.displayName, gameNickname: users.gameNickname, slotIndex: matchParticipants.slotIndex }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).where(eq(matchParticipants.eventId, eventId)).orderBy(asc(matchParticipants.slotIndex)),
    db.$count(eventRoleGrants, and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.role, "PLAYER")))
  ]);
  const matchesWithNames = eventMatches.map(({ match, teamAName, teamBName }) => {
    const participants = participantRows.filter((item) => item.matchId === match.id);
    const sideNames = (side: "A" | "B") => participants.filter((item) => item.side === side).map((item) => item.gameNickname || item.displayName).join(" / ");
    const aPlayers = sideNames("A"); const bPlayers = sideNames("B");
    return { match, teamAName: teamAName ?? (aPlayers ? `${match.sideALabel || "A 组"} · ${aPlayers}` : match.sideALabel || null), teamBName: teamBName ?? (bPlayers ? `${match.sideBLabel || "B 组"} · ${bPlayers}` : match.sideBLabel || null), participants };
  });
  const standings = eventTeams.map((team) => ({ teamId: team.id, name: team.name, abbreviation: team.abbreviation, logoUrl: team.logoUrl, played: 0, wins: 0, losses: 0, gameDiff: 0, points: 0 }));
  const standingByTeam = new Map(standings.map((standing) => [standing.teamId, standing]));
  for (const { match } of eventMatches) {
    if (match.status !== "PUBLISHED" || !match.teamAId || !match.teamBId) continue;
    const a = standingByTeam.get(match.teamAId); const b = standingByTeam.get(match.teamBId);
    if (!a || !b) continue;
    a.played++; b.played++; a.gameDiff += match.scoreA - match.scoreB; b.gameDiff += match.scoreB - match.scoreA;
    if (match.winnerTeamId === match.teamAId) { a.wins++; a.points += 3; b.losses++; }
    else if (match.winnerTeamId === match.teamBId) { b.wins++; b.points += 3; a.losses++; }
    else { a.points++; b.points++; }
  }
  standings.sort((a,b) => b.points-a.points || b.gameDiff-a.gameDiff || a.name.localeCompare(b.name,"zh-CN"));
  return { teams: eventTeams, stages: eventStages, matches: matchesWithNames, standings, playerCount };
}

export async function getPublicTeam(eventId: string, teamId: string) {
  const teamList = await getPublicTeams(eventId);
  const team = teamList.find((item) => item.id === teamId);
  if (!team) return null;
  const overview = await getEventOverview(eventId);
  const standing = overview.standings.find((item) => item.teamId === teamId) ?? null;
  const teamMatches = overview.matches.filter(({ match }) => match.teamAId === teamId || match.teamBId === teamId);
  return { team, standing, matches: teamMatches };
}

export async function getTeamJoinContext(userId: string, eventId: string) {
  const [grant, membership, pendingRequest] = await Promise.all([
    db.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants).where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.userId, userId), eq(eventRoleGrants.role, "PLAYER"))).limit(1),
    db.select({ teamId: teamMembers.teamId, role: teamMembers.role, teamName: teams.name }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, userId))).limit(1),
    db.select({ id: teamJoinRequests.id, teamId: teamJoinRequests.teamId, status: teamJoinRequests.status, teamName: teams.name }).from(teamJoinRequests).innerJoin(teams, eq(teams.id, teamJoinRequests.teamId)).where(and(eq(teamJoinRequests.eventId, eventId), eq(teamJoinRequests.userId, userId), eq(teamJoinRequests.status, "PENDING"))).limit(1)
  ]);
  return { hasPlayerRole: Boolean(grant[0]), membership: membership[0] ?? null, pendingRequest: pendingRequest[0] ?? null };
}

export async function getPublicMemberProfile(eventId: string, memberId: string) {
  const ref = parsePublicPlayerProfileId(memberId);
  if (!ref) return null;
  const teamList = await getPublicTeams(eventId);
  let team = ref.kind === "historical-team" ? teamList.find((item) => item.id === ref.teamId) : undefined;
  let member = ref.kind === "member"
    ? teamList.flatMap((item) => item.members.map((candidate) => ({ team: item, member: candidate }))).find((item) => item.member.id === ref.memberId)
    : ref.kind === "historical-team"
      ? team?.members.find((candidate) => candidate.userId === ref.userId)
        ? { team, member: team.members.find((candidate) => candidate.userId === ref.userId)! }
        : undefined
      : undefined;
  // Compatibility for historical links generated before team-aware profile identifiers existed.
  if (ref.kind === "member" && !member) {
    const historicalMatches = teamList.flatMap((item) => item.members.filter((candidate) => candidate.historical && candidate.userId === ref.memberId).map((candidate) => ({ team: item, member: candidate })));
    if (historicalMatches.length === 1) member = historicalMatches[0];
  }
  if (member) team = member.team;
  const userId = ref.kind === "individual" ? ref.userId : member?.member.userId;
  if (!userId) return null;
  const teamFilter = ref.kind === "individual" ? isNull(appearances.teamId) : eq(appearances.teamId, team!.id);
  const rows = await db.select({
    matchId: matches.id,
    roundLabel: matches.roundLabel,
    scheduledAt: matches.scheduledAt,
    scoreA: matches.scoreA,
    scoreB: matches.scoreB,
    teamAId: matches.teamAId,
    teamBId: matches.teamBId,
    winnerTeamId: matches.winnerTeamId,
    faction: appearances.faction,
    characterKey: appearances.characterKey,
    characterName: gameCharacters.name
  }).from(appearances)
    .innerJoin(halfResults, eq(halfResults.id, appearances.halfId))
    .innerJoin(gameRounds, eq(gameRounds.id, halfResults.roundId))
    .innerJoin(matches, eq(matches.id, gameRounds.matchId))
    .leftJoin(gameCharacters, eq(gameCharacters.key, appearances.characterKey))
    .where(and(eq(appearances.userId, userId), teamFilter, eq(matches.eventId, eventId), eq(matches.status, "PUBLISHED")))
    .orderBy(desc(matches.scheduledAt));
  if (!rows.length && ref.kind === "individual") return null;
  let publicMember = member?.member;
  if (!publicMember) {
    const [person] = await db.select({ displayName: users.displayName, gameNickname: users.gameNickname, avatarStorageKey: mediaAssets.storageKey })
      .from(users).leftJoin(mediaAssets, eq(mediaAssets.id, users.avatarAssetId)).where(eq(users.id, userId)).limit(1);
    if (!person) return null;
    const factions = new Set(rows.map((row) => row.faction));
    publicMember = {
      id: individualProfileId(userId),
      userId,
      role: "MEMBER" as const,
      specialty: factions.size > 1 ? "FLEX" as const : factions.has("HUNTER") ? "HUNTER" as const : "SURVIVOR" as const,
      gameNickname: person.gameNickname,
      publicBio: "",
      displayName: person.displayName,
      avatarUrl: mediaUrl(person.avatarStorageKey),
      historical: true as const
    };
  }
  const matchMap = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!matchMap.has(row.matchId)) matchMap.set(row.matchId, row);
  return {
    member: publicMember,
    team: team ?? null,
    matches: [...matchMap.values()].slice(0, 12)
  };
}

export async function getGameLabels() {
  const [maps, characters] = await Promise.all([
    db.select().from(gameMaps).orderBy(asc(gameMaps.orderIndex)),
    db.select().from(gameCharacters).orderBy(asc(gameCharacters.orderIndex))
  ]);
  return { maps: new Map(maps.map((item) => [item.key, item.name])), characters: new Map(characters.map((item) => [item.key, item.name])) };
}

export async function getUserWorkspace(userId: string) {
  const [grants, applications, invites, notes, assignments, unreadNotificationCount] = await Promise.all([
    db.select({ grant: eventRoleGrants, event: events }).from(eventRoleGrants).innerJoin(events, eq(events.id, eventRoleGrants.eventId)).where(eq(eventRoleGrants.userId, userId)),
    db.select({ application: eventRoleApplications, event: events }).from(eventRoleApplications).innerJoin(events, eq(events.id, eventRoleApplications.eventId)).where(eq(eventRoleApplications.userId, userId)).orderBy(desc(eventRoleApplications.updatedAt)),
    db.query.teamInvites.findMany({ where: (t, { eq }) => eq(t.invitedUserId, userId), orderBy: (t, { desc }) => desc(t.createdAt) }),
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(20),
    db.select({ assignment: matchAssignments, match: matches, event: events }).from(matchAssignments).innerJoin(matches, eq(matches.id, matchAssignments.matchId)).innerJoin(events, eq(events.id, matches.eventId)).where(eq(matchAssignments.userId, userId)).orderBy(asc(matches.scheduledAt))
    ,db.$count(notifications, and(eq(notifications.userId, userId), eq(notifications.read, false)))
  ]);
  return { grants, applications, invites, notifications: notes, assignments, unreadNotificationCount };
}

export async function getEventApplications(eventId: string) {
  const rows = await db.select({ application: eventRoleApplications, user: users }).from(eventRoleApplications).innerJoin(users, eq(users.id, eventRoleApplications.userId)).where(eq(eventRoleApplications.eventId, eventId)).orderBy(desc(eventRoleApplications.createdAt));
  return rows.map((row) => ({ ...row, rankScreenshotUrl: privateMediaUrl(row.user.rankScreenshotAssetId, eventId) }));
}

export async function getEventTeams(eventId: string) {
  return db.select({ team: teams, captain: users, members: sql<number>`count(${teamMembers.id})::int` }).from(teams).innerJoin(users, eq(users.id, teams.captainId)).leftJoin(teamMembers, eq(teamMembers.teamId, teams.id)).where(eq(teams.eventId, eventId)).groupBy(teams.id, users.id).orderBy(desc(teams.createdAt));
}
