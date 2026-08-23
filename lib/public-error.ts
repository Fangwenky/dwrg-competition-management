const SAFE_MESSAGES = [
  "仅支持 5MB 内的 JPG、PNG 或 WebP 图片",
  "图片内容无法识别",
  "头像已被其他操作更新，请刷新后重试",
  "资料已被其他操作更新，请刷新后重试",
  "战队资料已被其他操作更新，请刷新后重试",
  "赛事封面已被其他操作更新，请刷新后重试",
  "赛事已结束或归档，图片处于只读状态",
  "赛事已结束或归档，战队资料处于只读状态",
  "赛事已结束或归档，成员档案处于只读状态",
  "赛事已结束或归档，赛事封面处于只读状态",
  "图片已被其他操作更新，请刷新页面后重试"
] as const;

export function publicErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return SAFE_MESSAGES.includes(error.message as typeof SAFE_MESSAGES[number]) ? error.message : fallback;
}
