"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <div className="page-wrap py-16"><div className="card mx-auto max-w-2xl text-center"><AlertTriangle className="mx-auto text-danger" size={36} aria-hidden="true" /><p className="eyebrow mt-5">RECOVERY DESK</p><h1 className="section-title mt-2">当前操作未能完成</h1><p className="mt-3 text-sm text-[#61584c]">数据没有按预期更新。可以重试当前页面；若登录状态已失效，请重新登录后继续。</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button className="button-primary" onClick={reset}><RefreshCw size={17} aria-hidden="true" />重试</button><Link className="button-secondary" href="/me">返回用户中心</Link><Link className="button-secondary" href="/events">浏览赛事</Link></div>{error.digest && <p className="mt-5 font-data text-xs text-[#7a7180]">错误档案号：{error.digest}</p>}</div></div>;
}
