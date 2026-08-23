import Link from "next/link";
import { ArrowRight, FileCheck2, GitBranch, Radio, ShieldCheck } from "lucide-react";
import { getPublicEvents } from "@/lib/queries";
import { EventCard, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const events = await getPublicEvents();
  const active = events.find((event) => event.status === "ACTIVE") ?? events[0];

  return (
    <>
      <section className="theme-home-hero">
        <div className="page-wrap flex min-h-[min(780px,calc(100dvh-68px))] items-end py-8 md:py-12 lg:items-center">
          <div className="grid w-full items-end gap-5 lg:grid-cols-[minmax(0,700px)_minmax(300px,390px)] lg:justify-between">
            <div className="moonlight-panel p-6 md:p-9 lg:p-11">
              <p className="font-data text-xs font-extrabold uppercase tracking-[.28em] text-[#a9c9fa]">IDENTITY V COMMUNITY LEAGUE</p>
              <h1 className="mt-5 font-display text-[clamp(2.7rem,7vw,5rem)] font-black leading-[.94] tracking-[-.045em] text-white">
                追逐开始前，<br /><span className="text-[#d9c38e]">档案已经苏醒。</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-[#d5ddec] md:text-lg">从身份审核、临时组队到赛程、BP 与赛果，每一场庄园对局都在这里留下清晰记录。</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/events" className="button-primary">进入赛事档案 <ArrowRight size={18} /></Link>
                <Link href="/register" className="button-secondary border-white/30 bg-white/10 text-white hover:bg-white hover:text-ink">登记参赛身份</Link>
              </div>
              <div className="mt-9 grid grid-cols-3 gap-3 border-t border-white/15 pt-6">
                <div className="theme-metric"><div className="data-label">公开赛事</div><div className="theme-metric-value">{String(events.length).padStart(2, "0")}</div></div>
                <div className="theme-metric"><div className="data-label">身份体系</div><div className="theme-metric-value">05</div></div>
                <div className="theme-metric"><div className="data-label">赛事时区</div><div className="theme-metric-value">CST</div></div>
              </div>
            </div>

            {active && (
              <Link className="active-file-panel group p-5 text-white md:p-6" href={`/events/${active.slug}`}>
                <div className="flex items-start justify-between gap-4">
                  <span className="font-data text-xs font-bold tracking-[.22em] text-[#d9c38e]">CURRENT FILE</span>
                  <StatusBadge status={active.status} />
                </div>
                <p className="mt-10 text-xs tracking-[.16em] text-[#98a8c3]">当前开放赛事</p>
                <h2 className="mt-2 font-display text-3xl font-black leading-tight">{active.name}</h2>
                <p className="mt-2 text-sm text-[#bdc8dc]">{active.tagline || "赛事身份与比赛档案现已开放"}</p>
                <div className="mt-6 flex min-h-11 items-center justify-between border-t border-white/15 pt-4 font-semibold text-[#e9d8ad]">
                  查看赛事全貌 <ArrowRight className="transition-transform group-hover:translate-x-1" size={18} />
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="page-wrap">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow">OPEN FILES</p><h2 className="section-title mt-2">当前赛事</h2><p className="mt-3 text-sm text-[#5d687d]">查看赛程、战队阵容、积分与已发布对局。</p></div>
          <Link className="flex min-h-11 items-center gap-1 font-semibold text-plum" href="/events">全部赛事 <ArrowRight size={17} /></Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{events.slice(0, 3).map((event) => <EventCard event={event} key={event.id} />)}</div>
      </section>

      <section className="border-t border-[#53617d] bg-[#12192c] text-[#eff2f8]">
        <div className="page-wrap grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {[[FileCheck2,"一人多职","每项赛事身份独立申请与审核"],[GitBranch,"阶段编排","循环、单败与手动赛程自由组合"],[Radio,"完整记录","出场、地图、角色 BP 与局分集中归档"],[ShieldCheck,"权责清晰","敏感操作冲突校验并保留审计"]].map(([Icon,title,text]) => { const C = Icon as typeof FileCheck2; return <div className="border-l border-[#54627e] pl-5" key={String(title)}><C className="mb-5 text-[#d4bd85]" size={25} /><h3 className="font-display text-xl font-bold">{String(title)}</h3><p className="mt-2 text-sm text-[#aeb9ce]">{String(text)}</p></div>; })}
        </div>
      </section>
    </>
  );
}
