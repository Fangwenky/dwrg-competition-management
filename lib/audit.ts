import { db } from "@/lib/db";
import { auditLogs, notifications } from "@/lib/db/schema";

export async function audit(input: { eventId?: string | null; actorId?: string | null; action: string; entityType: string; entityId: string; detail?: Record<string, unknown> }) {
  await db.insert(auditLogs).values({ ...input, eventId: input.eventId ?? null, actorId: input.actorId ?? null, detail: input.detail ?? {} });
}

export async function notify(userId: string, title: string, body: string, href?: string) {
  await db.insert(notifications).values({ userId, title, body, href });
}
