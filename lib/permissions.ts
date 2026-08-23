import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventRoleGrants, teamMembers } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";

export async function hasEventRole(userId: string, eventId: string, role: "PLAYER" | "COMMENTATOR" | "REFEREE" | "EVENT_MANAGER") {
  const [grant] = await db.select({ role: eventRoleGrants.role }).from(eventRoleGrants)
    .where(and(eq(eventRoleGrants.userId, userId), eq(eventRoleGrants.eventId, eventId), eq(eventRoleGrants.role, role))).limit(1);
  return Boolean(grant);
}

export async function canManageEvent(user: User, eventId: string) {
  return user.role === "ADMIN" || hasEventRole(user.id, eventId, "EVENT_MANAGER");
}

export async function isOnTeam(userId: string, eventId: string, teamId?: string | null) {
  const conditions = [eq(teamMembers.userId, userId), eq(teamMembers.eventId, eventId)];
  if (teamId) conditions.push(eq(teamMembers.teamId, teamId));
  const [member] = await db.select({ id: teamMembers.id }).from(teamMembers).where(and(...conditions)).limit(1);
  return Boolean(member);
}
