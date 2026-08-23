"use server";

import argon2 from "argon2";
import { and, eq, lt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { createSession, deleteOtherSessions, deleteSession, newSessionCredential, requireUser, safeNextPath, setSessionCookie } from "@/lib/auth";
import { formRawString, formString, passwordSchema, usernameSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { loginDestination } from "@/lib/auth-policy";
import { clearLoginFailures, isLoginLimited, loginLimitKey, pruneLoginLimits, recordLoginFailure } from "@/lib/login-rate-limit";
import { LOGIN_IP_MAX_FAILURES } from "@/lib/login-rate-limit-policy";

export type AuthState = { error?: string };
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$Y2cl7PuQfeuHpdSLuFqYyA$BSY3BlybbkczBiCRcmK+UJ/lzhHTDX7HQ8GER4373KY";

export async function registerAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = usernameSchema.safeParse(formString(formData, "username"));
  const rawPassword = formRawString(formData, "password");
  const password = passwordSchema.safeParse(rawPassword);
  const displayName = formString(formData, "displayName");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!password.success) return { error: password.error.issues[0].message };
  if (rawPassword !== formRawString(formData, "confirmPassword")) return { error: "两次输入的密码不一致" };
  if (displayName.length < 2 || displayName.length > 24) return { error: "显示名称应为 2–24 个字符" };
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, parsed.data.toLowerCase())).limit(1);
  if (existing) return { error: "该用户名已被使用" };
  const [user] = await db.insert(users).values({ username: parsed.data.toLowerCase(), displayName, passwordHash: await argon2.hash(password.data, { type: argon2.argon2id }) }).returning().catch(() => []);
  if (!user) return { error: "该用户名已被使用" };
  await createSession(user.id);
  await audit({ actorId: user.id, action: "USER_REGISTERED", entityType: "user", entityId: user.id });
  redirect("/me");
}

export async function loginAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const username = formString(formData, "username").toLowerCase();
  const password = formRawString(formData, "password");
  const requestHeaders = await headers();
  const clientIp = requestHeaders.get("x-real-ip") || requestHeaders.get("cf-connecting-ip") || requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const accountLimitKey = loginLimitKey("account", username || "invalid");
  const ipLimitKey = loginLimitKey("ip", clientIp);
  const limitKeys = [accountLimitKey, ipLimitKey];
  const failureEntries = [{ keyHash: accountLimitKey }, { keyHash: ipLimitKey, maxFailures: LOGIN_IP_MAX_FAILURES }];
  if (await isLoginLimited(limitKeys)) {
    await argon2.verify(DUMMY_PASSWORD_HASH, password.slice(0, 128)).catch(() => false);
    return { error: "登录尝试过于频繁，请 15 分钟后再试" };
  }
  if (!usernameSchema.safeParse(username).success || password.length === 0 || password.length > 128) {
    await argon2.verify(DUMMY_PASSWORD_HASH, password.slice(0, 128)).catch(() => false);
    await recordLoginFailure(failureEntries);
    return { error: "用户名或密码不正确" };
  }
  const [candidate] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (!candidate) {
    await argon2.verify(DUMMY_PASSWORD_HASH, password).catch(() => false);
    await recordLoginFailure(failureEntries);
    return { error: "用户名或密码不正确" };
  }
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${candidate.id}`}))`);
    const [user] = await tx.select().from(users).where(and(eq(users.id, candidate.id), eq(users.username, username))).limit(1);
    const valid = user && !user.disabled && await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!valid) return null;
    const credential = newSessionCredential();
    await tx.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    await tx.insert(sessions).values({ tokenHash: credential.tokenHash, userId: user.id, expiresAt: credential.expiresAt });
    return { user, credential };
  });
  if (!outcome) {
    await recordLoginFailure(failureEntries);
    return { error: "用户名或密码不正确" };
  }
  await clearLoginFailures([accountLimitKey]);
  await pruneLoginLimits().catch(() => undefined);
  await setSessionCookie(outcome.credential.token, outcome.credential.expiresAt);
  redirect(loginDestination(outcome.user.mustChangePassword, safeNextPath(formString(formData, "next"), "/me")));
}

export async function logoutAction() {
  await deleteSession();
  redirect("/");
}

export async function changePasswordAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const user = await requireUser({ allowPasswordChange: true });
  const current = formRawString(formData, "currentPassword");
  const rawNext = formRawString(formData, "newPassword");
  const next = passwordSchema.safeParse(rawNext);
  if (!next.success) return { error: next.error.issues[0].message };
  if (rawNext !== formRawString(formData, "confirmPassword")) return { error: "两次输入的新密码不一致" };
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-state:${user.id}`}))`);
    const [currentUser] = await tx.select({ passwordHash: users.passwordHash, disabled: users.disabled }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!currentUser || currentUser.disabled || !await argon2.verify(currentUser.passwordHash, current).catch(() => false)) return "当前密码不正确";
    if (await argon2.verify(currentUser.passwordHash, rawNext).catch(() => false)) return "新密码不能与当前密码相同";
    await tx.update(users).set({ passwordHash: await argon2.hash(next.data, { type: argon2.argon2id }), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    return true;
  });
  if (result !== true) return { error: result };
  await audit({ actorId: user.id, action: "PASSWORD_CHANGED", entityType: "user", entityId: user.id });
  redirect("/login?changed=1");
}

export async function revokeOtherSessionsAction() {
  const user = await requireUser();
  const removed = await deleteOtherSessions(user.id);
  await audit({ actorId: user.id, action: "OTHER_SESSIONS_REVOKED", entityType: "user", entityId: user.id, detail: { count: removed } });
  redirect(`/me/security?success=${encodeURIComponent(removed ? `已退出其他 ${removed} 个登录会话` : "没有需要退出的其他登录会话")}`);
}
