import { EventCard, EmptyState } from "@/components/ui";
import { getPublicEvents } from "@/lib/queries";

export const metadata = { title: "赛事档案" };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getPublicEvents();
  return <div className="page-wrap"><div className="archive-page-intro mb-10 p-6 md:p-9"><p className="eyebrow">PUBLIC ARCHIVE</p><div className="mt-3 flex flex-wrap items-end justify-between gap-5"><div><h1 className="display-title">赛事档案</h1><p className="mt-4 text-[#536077]">公开赛程、参赛战队、BP 与比赛结果。</p></div><span className="stamp px-3 py-1 text-sm text-plum">共 {events.length} 份档案</span></div></div>{events.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{events.map((event) => <EventCard event={event} key={event.id} />)}</div> : <EmptyState title="暂无公开赛事" description="赛事管理员发布后会出现在这里。" />}</div>;
}
