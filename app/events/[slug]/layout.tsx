import { notFound } from "next/navigation";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { getEventBySlug } from "@/lib/queries";
import { EventNavigation } from "@/components/event-navigation";
import { EventHero } from "@/components/event-hero";
import { EVENT_MODE_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PublicEventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") notFound();
  return <>
    <EventHero
      slug={event.slug}
      name={event.name}
      tagline={event.tagline}
      status={event.status}
      eventStartLabel={event.eventStart ? format(event.eventStart, "yyyy年M月d日 HH:mm", { locale: zhCN }) : "待定"}
      modeLabel={EVENT_MODE_LABELS[event.mode]}
      rosterLabel={event.mode !== "INDIVIDUAL" ? `每队 ${event.minRoster}–${event.maxRoster} 人` : undefined}
      bestOf={event.defaultBestOf}
      heroUrl={event.heroUrl}
      heroFocalX={event.heroFocalX}
      heroFocalY={event.heroFocalY}
      heroCredit={event.heroCredit}
      heroSourceUrl={event.heroSourceUrl}
    />
    <EventNavigation slug={slug} mode={event.mode} />
    {children}
  </>;
}
