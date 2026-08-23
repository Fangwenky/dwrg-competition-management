import { AdminNav } from "@/components/workspace-nav";
export const dynamic="force-dynamic";
export default function AdminLayout({children}:{children:React.ReactNode}){return <div className="page-wrap"><header className="admin-masthead"><div><p className="eyebrow text-[#c7b3de]">GLOBAL ADMINISTRATION</p><h1 className="mt-1 font-display text-3xl font-black text-white">全局管理中枢</h1><p className="mt-1 text-sm text-[#bfc9db]">赛事、用户与比赛基础资料的最高权限工作区</p></div><span className="admin-seal">ADMIN</span></header><AdminNav /><div className="mt-7">{children}</div></div>}
