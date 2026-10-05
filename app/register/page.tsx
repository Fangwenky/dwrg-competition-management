import Link from "next/link";
import { safeNextPath } from "@/lib/validation";
import { RegisterForm } from "@/components/forms";

export const metadata = { title: "注册" };
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { const next = safeNextPath((await searchParams).next); return <div className="auth-stage grid min-h-[calc(100dvh-180px)] place-items-center px-4 py-12"><div className="w-full max-w-md"><p className="eyebrow">NEW RECORD</p><h1 className="display-title mt-3">建立账号</h1><p className="mt-4 text-[#566279]">同一个账号可在不同赛事申请多种身份。</p><div className="card mt-8"><RegisterForm next={next} /><p className="mt-5 text-center text-sm text-[#5d687d]">已有账号？ <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-plum underline">返回登录</Link></p></div></div></div>; }
