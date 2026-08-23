import Link from "next/link";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { appearances, bpEntries, gameCharacters, gameMaps, gameRounds, halfResults, matchParticipants, matches, teamMembers, teams, users } from "@/lib/db/schema";
import { StructuredMatchResultForm, type InitialRoundResult } from "@/components/match-result-form";
import { discardMatchResultDraft, publishMatchResult } from "@/app/actions/ops";
import { StatusBadge } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export default async function MatchEditorPage({ params, searchParams }: {
  params: Promise<{ eventId: string; matchId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ eventId, matchId }, feedback] = await Promise.all([params, searchParams]);
  const [row] = await db.select({ match: matches, teamAName: sql<string | null>`a.name`, teamBName: sql<string | null>`b.name` })
    .from(matches)
    .leftJoin(sql`${teams} as a`, sql`a.id=${matches.teamAId}`)
    .leftJoin(sql`${teams} as b`, sql`b.id=${matches.teamBId}`)
    .where(eq(matches.id, matchId)).limit(1);
  if (!row || row.match.eventId !== eventId) notFound();
  const usesTeams = Boolean(row.match.teamAId && row.match.teamBId);
  if (Boolean(row.match.teamAId) !== Boolean(row.match.teamBId)) notFound();

  const [maps, characters, teamRoster, participantRoster] = await Promise.all([
    db.select({ key: gameMaps.key, name: gameMaps.name }).from(gameMaps).where(eq(gameMaps.enabled, true)),
    db.select({ key: gameCharacters.key, name: gameCharacters.name, faction: gameCharacters.faction, posterPath: gameCharacters.posterPath, sourceUrl: gameCharacters.sourceUrl }).from(gameCharacters).where(eq(gameCharacters.enabled, true)),
    usesTeams ? db.select({ side: sql<"A" | "B">`case when ${teamMembers.teamId} = ${row.match.teamAId} then 'A' else 'B' end`, username: users.username, label: teamMembers.gameNickname, displayName: users.displayName }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(sql`${teamMembers.teamId} in (${row.match.teamAId}, ${row.match.teamBId})`) : Promise.resolve([]),
    !usesTeams ? db.select({ side: matchParticipants.side, username: users.username, label: users.gameNickname, displayName: users.displayName }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).where(eq(matchParticipants.matchId, matchId)) : Promise.resolve([])
  ]);
  const roster = usesTeams ? teamRoster : participantRoster;
  const sideName = (side: "A" | "B") => side === "A" ? (row.teamAName ?? row.match.sideALabel) || "参赛方 A" : (row.teamBName ?? row.match.sideBLabel) || "参赛方 B";
  const teamsForForm = {
    A: { name: sideName("A"), roster: roster.filter((item) => item.side === "A").map((item) => ({ username: item.username, label: item.label || item.displayName })) },
    B: { name: sideName("B"), roster: roster.filter((item) => item.side === "B").map((item) => ({ username: item.username, label: item.label || item.displayName })) }
  };

  const savedRounds = await db.select().from(gameRounds).where(eq(gameRounds.matchId, matchId)).orderBy(asc(gameRounds.roundIndex));
  const roundIds = savedRounds.map((round) => round.id);
  const [savedHalves, savedAppearances, savedBp] = roundIds.length ? await Promise.all([
    db.select().from(halfResults).where(inArray(halfResults.roundId, roundIds)).orderBy(asc(halfResults.halfIndex)),
    db.select({ halfId: appearances.halfId, faction: appearances.faction, username: users.username, characterKey: appearances.characterKey })
      .from(appearances).innerJoin(users, eq(users.id, appearances.userId)).where(inArray(appearances.halfId, db.select({ id: halfResults.id }).from(halfResults).where(inArray(halfResults.roundId, roundIds)))),
    db.select().from(bpEntries).where(inArray(bpEntries.roundId, roundIds)).orderBy(asc(bpEntries.orderIndex))
  ]) : [[], [], []];
  const initialRounds: InitialRoundResult[] = savedRounds.flatMap((round) => {
    const halves = savedHalves.filter((half) => half.roundId === round.id);
    const first = halves.find((half) => half.halfIndex === 1);
    const second = halves.find((half) => half.halfIndex === 2);
    if (!first || !second) return [];
    const firstSurvivor = first.survivorSide ?? (first.survivorTeamId && first.survivorTeamId === row.match.teamBId ? "B" : "A");
    const halfPayload = (half: typeof first, halfIndex: 1 | 2) => {
      const lineup = savedAppearances.filter((appearance) => appearance.halfId === half.id);
      return {
        escapes: half.escapes,
        survivors: lineup.filter((appearance) => appearance.faction === "SURVIVOR").map((appearance) => ({ username: appearance.username, characterKey: appearance.characterKey })),
        hunter: lineup.find((appearance) => appearance.faction === "HUNTER") ? (() => { const hunter = lineup.find((appearance) => appearance.faction === "HUNTER")!; return { username: hunter.username, characterKey: hunter.characterKey }; })() : null,
        bp: savedBp.filter((entry) => entry.roundId === round.id && entry.halfIndex === halfIndex).map((entry) => ({ scope: entry.scope, action: entry.action, targetKey: entry.targetKey }))
      };
    };
    return [{ index: round.roundIndex, mapKey: round.mapKey, firstSurvivor, halves: { 1: halfPayload(first, 1), 2: halfPayload(second, 2) } }];
  });

  return <div>
    <Link className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-plum underline" href={`/ops/${eventId}/matches`}><ArrowLeft size={17} />返回比赛列表</Link>
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">RESULT ENTRY / {matchId.slice(0, 8)}</p><h2 className="section-title mt-2">{sideName("A")} 对 {sideName("B")}</h2><p className="mt-2 text-sm text-[#675e52]">{usesTeams ? "固定战队比赛" : "个人报名 · 管理员逐场编组"}</p></div><StatusBadge status={row.match.status} /></div>
    {(feedback.error || feedback.success) && <p role={feedback.error ? "alert" : "status"} className={`mb-5 border px-4 py-3 text-sm ${feedback.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`}>{feedback.error ?? feedback.success}</p>}
    {row.match.status === "PUBLISHED" && <p className="mb-5 border-l-4 border-gold bg-[#eee2cd] p-4 text-sm">此结果已公开。保存修改会将比赛退回“结果草稿”，重新确认发布后才会再次进入公开档案，并记录修订审计。</p>}
    {(teamsForForm.A.roster.length < 5 || teamsForForm.B.roster.length < 5) && <p role="alert" className="mb-5 border border-danger/50 bg-[#f6e4e1] p-4 text-sm text-danger">每个参赛方至少需要 5 名可选选手，才能录入四名求生者与一名监管者。请返回比赛列表重新创建或调整参赛名单。</p>}
    <StructuredMatchResultForm matchId={matchId} bestOf={row.match.bestOf} maps={maps} teams={teamsForForm} characters={characters} initialRounds={initialRounds} manualReason={row.match.manualReason ?? ""} manualWinnerSide={row.match.scoreA === row.match.scoreB ? row.match.winnerSide ?? "" : ""} />
    {row.match.status === "RESULT_DRAFT" && <form action={publishMatchResult} className="mt-6 border-l-4 border-gold bg-[#eee2cd] p-5"><input type="hidden" name="matchId" value={matchId} /><p className="mb-4 text-sm">发布后将在公开比赛档案展示{usesTeams ? "，并计入战队积分排名与晋级数据" : "；个人编组比赛不会生成战队积分"}。</p><ConfirmSubmitButton className="button-primary" message="确认发布当前结果草稿？发布后将通知参赛者，并在公开档案展示；再次修改需走结果修订流程。">确认并发布结果</ConfirmSubmitButton></form>}
    {row.match.status === "RESULT_DRAFT" && <details className="mt-5 border border-danger/40 bg-[#f6e4e1] p-5"><summary className="min-h-11 cursor-pointer font-semibold text-danger">放弃这份结果草稿</summary><form action={discardMatchResultDraft} className="mt-4"><input type="hidden" name="matchId" value={matchId} /><p className="mb-3 text-sm text-[#675e52]">局级数据、BP、出场记录和当前比分将被清空，比赛恢复为待录入状态。若这是已发布结果的修订，旧公开版本不会恢复。</p><label className="label" htmlFor="discard-result-reason">放弃原因</label><input className="input" id="discard-result-reason" name="reason" maxLength={300} placeholder="将记录在审计日志并通知参赛者" required /><ConfirmSubmitButton className="button-danger mt-3" message="确认清空当前结果草稿？此操作无法恢复草稿内容。">放弃结果草稿</ConfirmSubmitButton></form></details>}
  </div>;
}
