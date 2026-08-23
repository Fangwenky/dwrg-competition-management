import { z } from "zod";

export const usernameSchema = z.string().trim().min(3, "用户名至少 3 个字符").max(24).regex(/^[a-zA-Z0-9_]+$/, "只能使用字母、数字和下划线");
export const passwordSchema = z.string().min(10, "密码至少 10 个字符").max(128);
export const slugSchema = z.string().min(3).max(48).regex(/^[a-z0-9-]+$/);
export const mediaPurposeSchema = z.enum(["EVENT_HERO", "TEAM_LOGO", "PLAYER_AVATAR", "RANK_SCREENSHOT"]);

export function safeNextPath(value: string | null | undefined, fallback = "/me") {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}

export function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function formRawString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
