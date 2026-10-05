import clsx from "clsx";
import { Archive, CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { STATUS_LABELS } from "@/lib/constants";
import type { Event } from "@/lib/db/schema";
import { SafeImage } from "@/components/safe-image";

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "ACTIVE" || status === "APPROVED" || status === "PUBLISHED" ? "border-[#4f725f] bg-[#dfe9df] text-[#284636]"
    : status === "REJECTED" ? "border-danger/50 bg-[#f3dedd] text-danger"
      : "border-gold/50 bg-[#eee2cd] text-[#6a4b25]";
  return <span className={clsx("badge", tone)}>{STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}</span>;
}

export function EventCard({ event }: { event: Event & { heroUrl?: string | null } }) {
  return (
    <Link href={`/events/${event.slug}`} className="group relative flex min-h-[320px] flex-col overflow-hidden border border-[#7d8aa4] bg-[#141b2e] p-5 text-white shadow-[5px_6px_0_rgba(34,45,74,.14)] transition duration-200 hover:-translate-y-1 hover:border-[#b69d68]">
      <SafeImage className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-500 group-hover:scale-[1.025] group-hover:opacity-68" src={event.heroUrl} alt="" fallback={<img className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-500 group-hover:scale-[1.025] group-hover:opacity-68" src="/images/identity-v-theme.webp" alt="" />} />
      <span className="absolute inset-0 bg-gradient-to-t from-[#0c1225] via-[#10162a]/80 to-[#11172a]/20" />
      <div className="relative flex h-full flex-1 flex-col">
      <div className="flex items-start justify-between gap-4"><span className="font-data text-xs font-extrabold uppercase tracking-[.22em] text-[#c6d5ed]">EVENT FILE / {event.slug.slice(0, 8)}</span><StatusBadge status={event.status} /></div>
      <div className="my-auto py-8">
        <h3 className="font-display text-3xl font-black leading-tight drop-shadow-lg">{event.name}</h3>
        <p className="mt-3 text-sm text-[#d3dbea]">{event.tagline || "赛事规则与对局记录已归档"}</p>
      </div>
      <div className="flex items-center justify-between border-t border-white/20 pt-4 text-sm text-[#d6dfed]">
        <span className="flex items-center gap-2"><CalendarDays size={16} />{event.eventStart ? format(event.eventStart, "yyyy年M月d日", { locale: zhCN }) : "时间待定"}</span>
        <span className="flex items-center gap-1 font-semibold text-[#e5cd94]">打开档案 <ChevronRight className="transition-transform group-hover:translate-x-1" size={16} /></span>
      </div>
      </div>
    </Link>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="card grid min-h-52 place-items-center text-center"><div><Archive className="mx-auto mb-4 text-gold" size={30} /><h3 className="font-display text-xl font-bold">{title}</h3><p className="mt-2 max-w-md text-sm text-[#5d687d]">{description}</p>{action && <div className="mt-5">{action}</div>}</div></div>;
}

export function Metric({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return <div className="border-l-2 border-gold pl-4"><div className="data-label">{label}</div><div className="font-display text-3xl font-bold">{value}</div>{detail && <div className="text-xs text-[#657187]">{detail}</div>}</div>;
}
