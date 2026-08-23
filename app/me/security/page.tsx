import { PasswordForm } from "@/components/forms";
import { revokeOtherSessionsAction } from "@/app/actions/auth";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { and, eq, gt } from "drizzle-orm";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ success?: string; required?: string }> }) {
  const [user, feedback] = await Promise.all([requireUser({ allowPasswordChange: true }), searchParams]);
  const activeSessions = await db.$count(sessions, and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())));
  return <div>
    <div className="workspace-page-intro"><p className="eyebrow">ACCOUNT SECURITY</p><h1 className="section-title mt-2">账号安全</h1><p className="mt-2 text-[#61584c]">修改密码会立即撤销当前账号的全部登录会话，你需要使用新密码重新登录。</p></div>
    {feedback.required === "1" && <p className="mt-5 border border-gold bg-parchment px-4 py-3 text-sm text-ink" role="alert"><strong>必须先设置新密码。</strong> 管理员重置的临时密码只能用于本次登录，完成修改后才能继续使用其他功能。</p>}
    {feedback.success && <p className="mt-5 border border-[#52755f] bg-[#e2eee4] px-4 py-3 text-sm text-[#31533c]" role="status">{feedback.success}</p>}
    <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,580px)_1fr]">
      <div className="space-y-6"><PasswordForm /><section className="card"><span className="data-label">SIGNED-IN DEVICES</span><h2 className="mt-1 font-display text-xl font-bold">登录会话</h2><p className="mt-2 text-sm text-[#5d687d]">当前账号共有 {activeSessions} 个有效登录会话。发现陌生设备时，可保留当前设备并退出其他会话。</p><form action={revokeOtherSessionsAction} className="mt-4"><ConfirmSubmitButton className="button-danger" disabled={activeSessions <= 1} message="确认退出当前设备以外的全部登录会话？">退出其他设备</ConfirmSubmitButton></form></section></div>
      <aside className="card h-fit border-l-4 border-l-gold"><span className="data-label">安全建议</span><ul className="mt-3 space-y-2 text-sm text-[#5d687d]"><li>密码至少 10 位，建议混合字母、数字与符号。</li><li>不要与其他网站共用密码。</li><li>若账号由管理员重置，请登录后立即修改。</li></ul></aside>
    </div>
  </div>;
}
