"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["", "概览"],
  ["/teams", "战队"],
  ["/standings", "积分"],
  ["/schedule", "赛程"]
] as const;

export function EventNavigation({ slug, mode }: { slug: string; mode: "PLAYER_TEAMS" | "ADMIN_TEAMS" | "INDIVIDUAL" }) {
  const pathname = usePathname();
  const base = `/events/${slug}`;
  const visibleItems = mode === "INDIVIDUAL" ? items.filter(([suffix]) => suffix !== "/teams" && suffix !== "/standings") : items;
  return <nav className="event-nav" aria-label="赛事栏目">{visibleItems.map(([suffix, label]) => {
    const href = `${base}${suffix}`;
    const active = suffix ? pathname.startsWith(href) : pathname === base;
    return <Link className={active ? "event-nav-link event-nav-link-active" : "event-nav-link"} href={href} aria-current={active ? "page" : undefined} key={suffix}>{label}</Link>;
  })}</nav>;
}
