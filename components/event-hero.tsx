"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui";

type EventHeroProps = {
  slug: string;
  name: string;
  tagline: string;
  status: string;
  eventStartLabel: string;
  modeLabel: string;
  rosterLabel?: string;
  bestOf: number;
  heroUrl?: string | null;
  heroFocalX: number;
  heroFocalY: number;
  heroCredit?: string | null;
  heroSourceUrl?: string | null;
};

export function EventHero({
  slug,
  name,
  tagline,
  status,
  eventStartLabel,
  modeLabel,
  rosterLabel,
  bestOf,
  heroUrl,
  heroFocalX,
  heroFocalY,
  heroCredit,
  heroSourceUrl
}: EventHeroProps) {
  const pathname = usePathname();
  const [heroFailed, setHeroFailed] = useState(false);
  useEffect(() => {
    setHeroFailed(false);
    if (!heroUrl) return;
    const image = new Image();
    image.onerror = () => setHeroFailed(true);
    image.src = heroUrl;
    return () => { image.onerror = null; };
  }, [heroUrl]);
  const eventHref = `/events/${slug}`;
  const compact = pathname !== eventHref && pathname !== `${eventHref}/`;
  const effectiveHeroUrl = heroFailed ? null : heroUrl;
  const style = effectiveHeroUrl ? { backgroundImage: `url("${effectiveHeroUrl}")`, backgroundPosition: `${heroFocalX}% ${heroFocalY}%` } : undefined;

  return <section className={`event-hero ${effectiveHeroUrl ? "event-hero-with-image" : ""} ${compact ? "event-hero-compact" : "event-hero-overview"}`} style={style}>
    <div className="event-hero-overlay" />
    <div className="event-hero-content page-wrap relative z-10 flex flex-col justify-end">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-4xl">
          <p className="eyebrow text-[#d4b279]">EVENT FILE / {slug}</p>
          {compact
            ? <Link href={eventHref} className="event-title event-title-compact mt-3 block" aria-label={`返回${name}赛事概览`}>{name}</Link>
            : <h1 className="event-title mt-3">{name}</h1>}
          <p className={`event-tagline mt-4 max-w-2xl text-[#e7ded1] ${compact ? "event-tagline-compact" : "text-lg md:text-xl"}`}>{tagline}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="event-facts mt-8 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/20 pt-5 text-sm text-[#d7cdbd]">
        <span>开赛 {eventStartLabel}</span>
        <span>{modeLabel}</span>
        {rosterLabel && <span>{rosterLabel}</span>}
        <span>默认 BO{bestOf}</span>
      </div>
      {!compact && heroCredit && <p className="mt-4 text-xs text-[#a9a092]">背景素材：{heroSourceUrl ? <a className="underline" href={heroSourceUrl} target="_blank" rel="noreferrer">{heroCredit}</a> : heroCredit}</p>}
    </div>
  </section>;
}
