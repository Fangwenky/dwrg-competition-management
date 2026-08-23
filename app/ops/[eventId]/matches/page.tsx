import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventRoleGrants, events, matchAssignments, matchParticipants, matches, teams, users } from "@/lib/db/schema";
import { assignMatchStaff, deleteScheduledMatch, unassignMatchStaff, updateScheduledMatch } from "@/app/actions/ops";
import { EmptyState, StatusBadge } from "@/components/ui";
import { IndividualMatchForm } from "@/components/forms";
import { EVENT_MODE_LABELS } from "@/lib/constants";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { canManageMatchStaff } from "@/lib/match-lifecycle-policy";
import { FormSubmitButton } from "@/components/form-submit-button";

function dateTimeLocal(value: Date | null) {
  if (!value) return "";
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export default async function OpsMatchesPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ eventId }, feedback] = await Promise.all([params, searchParams]);
  const [event, items, participantRows, players, assignments, availableStaff] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db.select({ match: matches, teamAName: sql<string | null>`a.name`, teamBName: sql<string | null>`b.name` }).from(matches).leftJoin(sql`${teams} as a`, sql`a.id=${matches.teamAId}`).leftJoin(sql`${teams} as b`, sql`b.id=${matches.teamBId}`).where(eq(matches.eventId, eventId)).orderBy(asc(matches.createdAt)),
    db.select({ matchId: matchParticipants.matchId, side: matchParticipants.side, displayName: users.displayName, gameNickname: users.gameNickname }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).where(eq(matchParticipants.eventId, eventId)).orderBy(asc(matchParticipants.slotIndex)),
    db.select({ id: users.id, displayName: users.displayName, gameNickname: users.gameNickname, username: users.username }).from(eventRoleGrants).innerJoin(users, eq(users.id, eventRoleGrants.userId)).where(and(eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.role, "PLAYER"), eq(users.disabled, false))),
    db.select({ assignment: matchAssignments, user: users }).from(matchAssignments).innerJoin(matches, eq(matches.id, matchAssignments.matchId)).innerJoin(users, eq(users.id, matchAssignments.userId)).where(eq(matches.eventId, eventId)).orderBy(asc(matchAssignments.createdAt)),
    db.select({ role: eventRoleGrants.role, userId: users.id, username: users.username, displayName: users.displayName }).from(eventRoleGrants).innerJoin(users, eq(users.id, eventRoleGrants.userId)).where(and(eq(eventRoleGrants.eventId, eventId), sql`${eventRoleGrants.role} in ('REFEREE', 'COMMENTATOR')`, eq(users.disabled, false))).orderBy(asc(users.displayName))
  ]);
  if (!event) notFound();

  return <div>
    <p className="eyebrow">MATCH CONTROL</p>
    <h2 className="section-title mt-2">比赛与结果</h2>
    <p className="mt-2 text-[#61584c]">{EVENT_MODE_LABELS[event.mode]}</p>
    {(feedback.error || feedback.success) && <p role={feedback.error ? "alert" : "status"} className={`mt-5 border px-4 py-3 text-sm ${feedback.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`}>{feedback.error ?? feedback.success}</p>}

    {event.mode === "INDIVIDUAL" && <section className="mt-7">
      <div className="mb-4"><h3 className="font-display text-2xl font-bold">按场次分配选手</h3><p className="mt-1 text-sm text-[#675e52]">每场比赛的 A、B 双方可以使用不同组合，不建立固定战队。</p></div>
      <IndividualMatchForm eventId={eventId} players={players} defaultBestOf={event.defaultBestOf} />
    </section>}

    <div className="mt-9 space-y-4">{items.length ? items.map(({ match, teamAName, teamBName }) => {
      const participantNames = (side: "A" | "B") => participantRows.filter((item) => item.matchId === match.id && item.side === side).map((item) => item.gameNickname || item.displayName).join(" / ");
      const individual = event.mode === "INDIVIDUAL";
      const sideAName = teamAName ?? (individual ? `${match.sideALabel || "A 组"}${participantNames("A") ? ` · ${participantNames("A")}` : ""}` : "待定");
      const sideBName = teamBName ?? (individual ? `${match.sideBLabel || "B 组"}${participantNames("B") ? ` · ${participantNames("B")}` : ""}` : "待定");
      const matchStaff = assignments.filter(({ assignment }) => assignment.matchId === match.id);
      const assignedRefereeIds = new Set(matchStaff.filter(({ assignment }) => assignment.role === "REFEREE").map(({ assignment }) => assignment.userId));
      const assignedCommentatorIds = new Set(matchStaff.filter(({ assignment }) => assignment.role === "COMMENTATOR").map(({ assignment }) => assignment.userId));
      const incompleteBracket = Boolean(match.bracketRound && (!match.teamAId || !match.teamBId));
      const editable = !incompleteBracket && (match.status === "DRAFT" || match.status === "SCHEDULED");
      const ready = individual || Boolean(match.teamAId && match.teamBId);
      const staffEditable = ready && canManageMatchStaff(match.status);
      return <article className={`card ${incompleteBracket ? "border-dashed opacity-80" : ""}`} key={match.id}>
        <div className="grid items-center gap-4 md:grid-cols-[130px_1fr_auto]">
          <div><span className="data-label">{match.roundLabel}</span><div className="text-sm">BO{match.bestOf}</div></div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center font-semibold"><span className="truncate">{sideAName}</span><span className="font-display text-2xl">{match.status === "PUBLISHED" || match.status === "RESULT_DRAFT" ? `${match.scoreA}:${match.scoreB}` : "VS"}</span><span className="truncate">{sideBName}</span></div>
          <StatusBadge status={match.status} />
        </div>

        {incompleteBracket && <div className="mt-4 border-l-4 border-gold bg-parchment p-4 text-sm"><strong>等待上一轮胜者。</strong><span className="mt-1 block text-[#675e52]">对阵双方确定后会自动开放排期、工作人员指派和结果录入。</span></div>}

        {matchStaff.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{matchStaff.map(({ assignment, user }) => staffEditable ? <form action={unassignMatchStaff} className="flex min-h-11 items-center gap-2 border border-line bg-parchment/60 px-3" key={`${assignment.userId}:${assignment.role}`}><input type="hidden" name="matchId" value={match.id} /><input type="hidden" name="userId" value={assignment.userId} /><input type="hidden" name="role" value={assignment.role} /><span className="text-sm"><strong>{assignment.role === "REFEREE" ? "裁判" : "解说"}</strong> · {user.displayName}</span><ConfirmSubmitButton className="text-xs font-semibold text-danger underline" message={`确认取消 ${user.displayName} 的${assignment.role === "REFEREE" ? "裁判" : "解说"}指派？`}>取消</ConfirmSubmitButton></form> : <div className="flex min-h-11 items-center border border-line bg-parchment/60 px-3 text-sm" key={`${assignment.userId}:${assignment.role}`}><strong>{assignment.role === "REFEREE" ? "裁判" : "解说"}</strong>&nbsp;· {user.displayName}</div>)}</div>}

        {editable && <details className="mt-4 border border-line bg-white/40 p-4"><summary className="min-h-11 cursor-pointer font-semibold text-plum">调整排期或撤销比赛</summary><div className="mt-4 grid gap-5 lg:grid-cols-[1fr_360px]">
          <form action={updateScheduledMatch} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="matchId" value={match.id} /><div><label className="label" htmlFor={`match-label-${match.id}`}>比赛名称 / 轮次</label><input className="input" id={`match-label-${match.id}`} name="roundLabel" defaultValue={match.roundLabel} required /></div><div><label className="label" htmlFor={`match-time-${match.id}`}>开赛时间</label><input className="input" id={`match-time-${match.id}`} name="scheduledAt" type="datetime-local" defaultValue={dateTimeLocal(match.scheduledAt)} /></div><div><label className="label" htmlFor={`match-bo-${match.id}`}>局数</label><select className="input" id={`match-bo-${match.id}`} name="bestOf" defaultValue={String(match.bestOf)}><option value="1">BO1</option><option value="3">BO3</option><option value="5">BO5</option></select></div><FormSubmitButton className="button-secondary sm:col-span-3" pendingLabel="正在保存…">保存排期调整</FormSubmitButton></form>
          {!match.bracketRound && <form action={deleteScheduledMatch} className="border-l-4 border-danger/70 bg-[#f6e4e1] p-4"><input type="hidden" name="matchId" value={match.id} /><label className="label" htmlFor={`match-cancel-${match.id}`}>撤销原因</label><input className="input" id={`match-cancel-${match.id}`} name="reason" placeholder="将通知选手与工作人员" required /><ConfirmSubmitButton className="button-danger mt-3 w-full" message={`确认撤销“${match.roundLabel}”？比赛、指派和未发布记录将被删除。`}>撤销这场比赛</ConfirmSubmitButton></form>}
          {match.bracketRound && <div className="border-l-4 border-gold bg-parchment p-4 text-sm text-[#675e52]">淘汰树中的比赛不能单独删除，以免破坏下一轮晋级关系；可调整名称、时间和 BO 局数。</div>}
        </div></details>}

        {ready && <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-5">{staffEditable && <div className="grid min-w-0 flex-1 gap-2 lg:grid-cols-2"><form action={assignMatchStaff} className="flex min-w-0 gap-2"><input type="hidden" name="matchId" value={match.id} /><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="role" value="REFEREE" /><label className="sr-only" htmlFor={`referee-${match.id}`}>选择裁判</label><select className="input min-w-0 flex-1" id={`referee-${match.id}`} name="username" required><option value="">添加一名裁判</option>{availableStaff.filter((staff) => staff.role === "REFEREE" && !assignedRefereeIds.has(staff.userId)).map((staff) => <option value={staff.username} key={`referee:${staff.username}`}>{staff.displayName}（@{staff.username}）</option>)}</select><FormSubmitButton className="button-secondary shrink-0" pendingLabel="指派中…">添加裁判</FormSubmitButton></form><form action={assignMatchStaff} className="flex min-w-0 gap-2"><input type="hidden" name="matchId" value={match.id} /><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="role" value="COMMENTATOR" /><label className="sr-only" htmlFor={`commentator-${match.id}`}>选择解说</label><select className="input min-w-0 flex-1" id={`commentator-${match.id}`} name="username" required><option value="">添加一名解说</option>{availableStaff.filter((staff) => staff.role === "COMMENTATOR" && !assignedCommentatorIds.has(staff.userId)).map((staff) => <option value={staff.username} key={`commentator:${staff.username}`}>{staff.displayName}（@{staff.username}）</option>)}</select><FormSubmitButton className="button-secondary shrink-0" pendingLabel="添加中…">添加解说</FormSubmitButton></form></div>}<Link className="button-primary ml-auto shrink-0" href={`/ops/${eventId}/matches/${match.id}`}>录入 / 查看结果</Link></div>}
      </article>;
    }) : <EmptyState title="尚未生成比赛" description={event.mode === "INDIVIDUAL" ? "使用上方表单创建第一场比赛并分配双方选手。" : "请先在流程编排中添加阶段并生成赛程。"} />}</div>
  </div>;
}
