import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { safeNextPath } from "@/lib/validation";
import { forcedPasswordChangePath } from "@/lib/auth-policy";
export { safeNextPath } from "@/lib/validation";

const COOKIE_NAME = "dwrg_session";
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newSessionCredential() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function createSession(userId: string) {
  const credential = newSessionCredential();
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    await tx.insert(sessions).values({ tokenHash: credential.tokenHash, userId, expiresAt: credential.expiresAt });
  });
  await setSessionCookie(credential.token, credential.expiresAt);
}

export async function deleteSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  store.delete(COOKIE_NAME);
}

export async function deleteOtherSessions(userId: string) {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return 0;
  const removed = await db.delete(sessions).where(and(
    eq(sessions.userId, userId),
    ne(sessions.tokenHash, hashToken(token))
  )).returning({ tokenHash: sessions.tokenHash });
  return removed.length;
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [row] = await db.select({ user: users }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.disabled, false)))
    .limit(1);
  return row?.user ?? null;
}

export async function requireUser(options: { allowPasswordChange?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?reason=session-expired");
  if (user.mustChangePassword && !options.allowPasswordChange) redirect("/me/security?required=1");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/me?error=forbidden");
  return user;
}

export async function requirePageUser(nextPath: string) {
  const user = await getCurrentUser();
  const requestPath = (await headers()).get("x-dwrg-request-path");
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(safeNextPath(requestPath, nextPath))}`);
  }
  const forcedPath = forcedPasswordChangePath(user.mustChangePassword, requestPath);
  if (forcedPath) redirect(forcedPath);
  return user;
}

export async function requirePageAdmin(nextPath: string) {
  const user = await requirePageUser(nextPath);
  if (user.role !== "ADMIN") redirect("/me?error=forbidden");
  return user;
}
