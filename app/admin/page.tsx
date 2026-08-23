import Link from "next/link";
import { ArrowRight, LibraryBig, Trophy, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { events, gameCharacters, users } from "@/lib/db/schema";
import { requirePageAdmin } from "@/lib/auth";

export default async function AdminPage(){
  await requirePageAdmin("/admin");
  const [eventRows, userRows, characterRows] = await Promise.all([db.select({id:events.id}).from(events), db.select({id:users.id}).from(users), db.select({key:gameCharacters.key}).from(gameCharacters)]);
  const items = [
    { href:"/admin/events", label:"赛事与授权", note:"创建赛事、选择编制方式并维护赛事管理员。", count:eventRows.length, unit:"项赛事", Icon:Trophy },
    { href:"/admin/users", label:"用户档案", note:"检索账号状态，并在明确确认后重置密码。", count:userRows.length, unit:"个账号", Icon:UsersRound },
    { href:"/admin/catalog", label:"角色与立绘目录", note:"维护比赛可选角色、阵营、素材来源与启用状态。", count:characterRows.length, unit:"名角色", Icon:LibraryBig }
  ];
  return <div><div className="mb-5"><p className="eyebrow">CONTROL OVERVIEW</p><h2 className="section-title mt-1">管理总览</h2><p className="mt-2 text-[#61584c]">从全局资料进入具体赛事工作台；高风险操作均保留审计记录。</p></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map(({href,label,note,count,unit,Icon}) => <Link className="admin-control-card group" href={href} key={href}><div className="flex items-start justify-between"><Icon className="text-gold" size={25} /><ArrowRight className="text-plum transition-transform group-hover:translate-x-1" size={18} /></div><strong className="mt-8 block font-data text-4xl text-plum">{count}</strong><span className="data-label">{unit}</span><h3 className="mt-4 font-display text-2xl font-bold">{label}</h3><p className="mt-2 text-sm text-[#5d687d]">{note}</p></Link>)}</div></div>;
}
