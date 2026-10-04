import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { events, matches, stages, teams, users, type User } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ actor: null as User | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => auth.actor, requireAdmin: async () => auth.actor }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));

// This suite runs inside test:e2e's disposable database, never against a deployment.
describe.skipIf(process.env.DWRG_INTEGRATION_TESTS !== "1")("transactional match publication", () => {
  let db: typeof import("@/lib/db").db;
  let sqlClient: typeof import("@/lib/db").sqlClient;
  let publishMatchResult: typeof import("@/app/actions/ops").publishMatchResult;
  let eventId: string;
  let stageId: string;
  let teamIds: string[];

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/dwrg_test") {
      throw new Error("Integration tests require the isolated dwrg_test database on 127.0.0.1:55432");
    }
    ({ db, sqlClient } = await import("@/lib/db"));
    ({ publishMatchResult } = await import("@/app/actions/ops"));
    [auth.actor] = await db.insert(users).values({ username: `txn_${randomUUID()}`, displayName: "事务回归管理员", passwordHash: "unused", role: "ADMIN" }).returning();
  });

  beforeEach(async () => {
    const [event] = await db.insert(events).values({ slug: `txn-${randomUUID()}`, name: "事务回归赛事", status: "ACTIVE" }).returning();
    eventId = event.id;
    const [stage] = await db.insert(stages).values({ eventId, name: "淘汰阶段", type: "SINGLE_ELIMINATION", status: "ACTIVE", orderIndex: 1 }).returning();
    stageId = stage.id;
    const rows = await db.insert(teams).values(Array.from({ length: 4 }, (_, index) => ({ eventId, name: `战队 ${index}`, abbreviation: `T${index}`, captainId: auth.actor!.id, status: "APPROVED" as const }))).returning();
    teamIds = rows.map((team) => team.id);
  });

  afterEach(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  afterAll(async () => {
    if (auth.actor) await db.delete(users).where(eq(users.id, auth.actor.id));
    if (sqlClient) await sqlClient.end();
  });

  async function publish(matchId: string) {
    const form = new FormData();
    form.set("matchId", matchId);
    return publishMatchResult(form).catch((error: Error) => decodeURIComponent(error.message));
  }

  async function waitForBlockedTransactions(count: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await sqlClient<{ count: number }[]>`select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`;
      if (row.count >= count) return;
      await setTimeout(20);
    }
    throw new Error(`Expected ${count} transactions to wait on the held database lock`);
  }

  async function createBracket() {
    return db.insert(matches).values([
      { eventId, stageId, bracketRound: 1, bracketIndex: 0, teamAId: teamIds[0], teamBId: teamIds[1], scoreA: 1, scoreB: 0, winnerSide: "A" as const, winnerTeamId: teamIds[0], status: "RESULT_DRAFT" as const },
      { eventId, stageId, bracketRound: 1, bracketIndex: 1, teamAId: teamIds[2], teamBId: teamIds[3], scoreA: 1, scoreB: 0, winnerSide: "A" as const, winnerTeamId: teamIds[2], status: "RESULT_DRAFT" as const },
      { eventId, stageId, bracketRound: 2, bracketIndex: 0 }
    ]).returning();
  }

  test("simultaneous semifinal publications preserve both finalists", async () => {
    const [first, second, final] = await createBracket();
    const holder = await sqlClient.reserve();
    let publications: Array<Promise<string | void>> = [];
    try {
      await holder`begin`;
      await holder`select id from matches where id = ${final.id} for update`;
      publications = [publish(first.id), publish(second.id)];
      await waitForBlockedTransactions(2);
    } finally {
      await holder`commit`;
      holder.release();
      const results = await Promise.all(publications);
      for (const result of results) expect(result).toContain("比赛结果已发布到公开档案");
    }
    const [next] = await db.select().from(matches).where(eq(matches.id, final.id));
    expect(next).toMatchObject({ teamAId: teamIds[0], teamBId: teamIds[2], status: "SCHEDULED" });
  });

  test("publication advances the current draft rather than a stale winner", async () => {
    const [first, , final] = await createBracket();
    const holder = await sqlClient.reserve();
    let publication: Promise<string | void> | undefined;
    try {
      await holder`begin`;
      await holder`select id from matches where id = ${first.id} for update`;
      publication = publish(first.id);
      await waitForBlockedTransactions(1);
      await holder`update matches set score_a = 0, score_b = 1, winner_side = 'B', winner_team_id = ${teamIds[1]} where id = ${first.id}`;
    } finally {
      await holder`commit`;
      holder.release();
      expect(await publication).toContain("比赛结果已发布到公开档案");
    }
    const [next] = await db.select().from(matches).where(eq(matches.id, final.id));
    expect(next.teamAId).toBe(teamIds[1]);
    const [published] = await db.select().from(matches).where(eq(matches.id, first.id));
    expect(published).toMatchObject({ winnerTeamId: teamIds[1], status: "PUBLISHED" });
  });

  test("concurrent final publications mark a manual stage completed", async () => {
    await db.update(stages).set({ type: "MANUAL" }).where(eq(stages.id, stageId));
    const rows = await db.insert(matches).values([0, 1].map((index) => ({ eventId, stageId, teamAId: teamIds[index * 2], teamBId: teamIds[index * 2 + 1], scoreA: 1, scoreB: 0, winnerSide: "A" as const, winnerTeamId: teamIds[index * 2], status: "RESULT_DRAFT" as const }))).returning();
    const results = await Promise.all(rows.map((match) => publish(match.id)));
    for (const result of results) expect(result).toContain("比赛结果已发布到公开档案");
    const [stage] = await db.select().from(stages).where(and(eq(stages.id, stageId), eq(stages.eventId, eventId)));
    expect(stage.status).toBe("COMPLETED");
  });

  test("an event archived while publication waits remains read-only", async () => {
    const [first, , final] = await createBracket();
    const holder = await sqlClient.reserve();
    let publication: Promise<string | void> | undefined;
    try {
      await holder`begin`;
      await holder`select pg_advisory_xact_lock(hashtext(${`event-write:${eventId}`}))`;
      publication = publish(first.id);
      await waitForBlockedTransactions(1);
      await holder`update events set status = 'ARCHIVED' where id = ${eventId}`;
    } finally {
      await holder`commit`;
      holder.release();
      expect(await publication).toContain("赛事已结束或归档，不能发布比赛结果");
    }
    const [source] = await db.select().from(matches).where(eq(matches.id, first.id));
    const [next] = await db.select().from(matches).where(eq(matches.id, final.id));
    expect(source.status).toBe("RESULT_DRAFT");
    expect(next.teamAId).toBeNull();
  });

  test("a draft changed to an unresolved tie cannot be published", async () => {
    const [first, , final] = await createBracket();
    const holder = await sqlClient.reserve();
    let publication: Promise<string | void> | undefined;
    try {
      await holder`begin`;
      await holder`select id from matches where id = ${first.id} for update`;
      publication = publish(first.id);
      await waitForBlockedTransactions(1);
      await holder`update matches set score_a = 0, score_b = 0, winner_side = null, winner_team_id = null where id = ${first.id}`;
    } finally {
      await holder`commit`;
      holder.release();
      expect(await publication).toContain("同分时必须选择人工裁定胜方并填写公开说明");
    }
    const [source] = await db.select().from(matches).where(eq(matches.id, first.id));
    const [next] = await db.select().from(matches).where(eq(matches.id, final.id));
    expect(source.status).toBe("RESULT_DRAFT");
    expect(next.teamAId).toBeNull();
  });
});
