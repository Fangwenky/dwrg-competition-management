import "server-only";

import { createHash } from "crypto";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginRateLimits } from "@/lib/db/schema";
import { nextLoginLimitState } from "@/lib/login-rate-limit-policy";

export function loginLimitKey(scope: "account" | "ip", value: string) {
  return createHash("sha256").update(`${scope}:${value.trim().toLowerCase()}`).digest("hex");
}

export async function isLoginLimited(keys: string[], now = new Date()) {
  for (const keyHash of keys) {
    const [row] = await db.select({ blockedUntil: loginRateLimits.blockedUntil }).from(loginRateLimits).where(eq(loginRateLimits.keyHash, keyHash)).limit(1);
    if (row?.blockedUntil && row.blockedUntil > now) return true;
  }
  return false;
}

export async function recordLoginFailure(entries: Array<{ keyHash: string; maxFailures?: number }>, now = new Date()) {
  await db.transaction(async (tx) => {
    for (const { keyHash, maxFailures } of entries) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`login-limit:${keyHash}`}))`);
      const [current] = await tx.select().from(loginRateLimits).where(eq(loginRateLimits.keyHash, keyHash)).limit(1);
      const next = nextLoginLimitState({ failedCount: current?.failedCount ?? 0, windowStartedAt: current?.windowStartedAt ?? now, now, maxFailures });
      await tx.insert(loginRateLimits).values({ keyHash, ...next, updatedAt: now }).onConflictDoUpdate({
        target: loginRateLimits.keyHash,
        set: { ...next, updatedAt: now }
      });
    }
  });
}

export async function clearLoginFailures(keys: string[]) {
  for (const keyHash of keys) await db.delete(loginRateLimits).where(eq(loginRateLimits.keyHash, keyHash));
}

export async function pruneLoginLimits(now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60_000);
  await db.delete(loginRateLimits).where(lt(loginRateLimits.updatedAt, cutoff));
}
