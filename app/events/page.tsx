import { EventCard, EmptyState } from "@/components/ui";
import { getPublicEvents } from "@/lib/queries";

export const metadata = { title: "赛事档案" };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getPublicEvents();
  const groups = [
    { status: "REGISTRATION", title: "开放报名", description: "查看报名时间与条件，申请参赛或工作人员身份。" },
    { status: "ACTIVE", title: "正在进行", description: "关注赛程、战队阵容和最新发布的赛果。" },
    { status: "COMPLETED", title: "已结束赛事", description: "回看完整赛事记录与最终排名。" }
  ];
  return <div className="page-wrap">
    <div className="archive-page-intro mb-8 p-6 md:p-9"><p className="eyebrow">PUBLIC ARCHIVE</p><div className="mt-3 flex flex-wrap items-end justify-between gap-5"><div><h1 className="display-title">赛事档案</h1><p className="mt-4 text-[#536077]">按赛事进度浏览报名、赛程、战队与比赛结果。</p></div><span className="stamp px-3 py-1 text-sm text-plum">共 {events.length} 份档案</span></div></div>
    {events.length ? <div className="space-y-10">{groups.map((group) => {
      const items = events.filter((event) => event.status === group.status);
      if (!items.length) return null;
      return <section key={group.status} aria-labelledby={`events-${group.status}`}><div className="mb-5 border-l-2 border-gold pl-4"><h2 className="section-title" id={`events-${group.status}`}>{group.title}<span className="ml-3 font-sans text-sm font-normal text-[#5d687d]">{items.length} 项</span></h2><p className="mt-2 text-sm text-[#5d687d]">{group.description}</p></div><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{items.map((event) => <EventCard event={event} key={event.id} />)}</div></section>;
    })}</div> : <EmptyState title="暂无公开赛事" description="赛事管理员发布后会出现在这里。" />}
  </div>;
}
