import Link from "next/link";
import { Archive, Bell, LogIn, LogOut, Shield, UserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "./logo";
import { logoutAction } from "@/app/actions/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unreadNotifications = user ? await db.$count(notifications, and(eq(notifications.userId, user.id), eq(notifications.read, false))) : 0;
  return (
    <header className="site-header sticky top-0 z-50">
      <div className="mx-auto flex min-h-[68px] max-w-[1440px] items-center justify-between px-4 md:px-8">
        <Logo compact={Boolean(user)} />
        <nav className="flex items-center gap-1 md:gap-3" aria-label="主导航">
          <Link href="/events" aria-label="赛事档案" className="site-nav-link flex size-11 items-center justify-center text-sm font-semibold sm:w-auto sm:px-3"><Archive className="sm:hidden" size={19} /><span className="hidden sm:inline">赛事档案</span></Link>
          {user ? (
            <>
              {user.role === "ADMIN" && <Link href="/admin" aria-label="全局管理" className="site-nav-link flex size-11 shrink-0 items-center justify-center gap-2 text-sm font-semibold sm:w-auto sm:px-3"><Shield size={17} /><span className="hidden sm:inline">管理</span></Link>}
              <Link href="/me/notifications" className="site-nav-link relative grid h-11 w-11 place-items-center" aria-label={unreadNotifications ? `通知，${unreadNotifications} 条未读` : "通知"}><Bell size={19} />{unreadNotifications > 0 && <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger px-1 font-data text-[10px] font-bold leading-4 text-white" aria-hidden="true">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}</Link>
              <Link href="/me" aria-label={`用户中心：${user.displayName}`} className="flex size-11 items-center justify-center gap-2 border-l border-white/10 text-sm font-semibold sm:w-auto sm:px-3"><UserRound size={18} /><span className="hidden sm:inline">{user.displayName}</span></Link>
              <form action={logoutAction}><button aria-label="退出登录" className="grid size-11 place-items-center text-[#bfb5a5] hover:text-white"><LogOut size={17} /><span className="sr-only">退出</span></button></form>
            </>
          ) : (
            <Link href="/login" className="site-login flex min-h-11 items-center gap-2 px-4 text-sm font-semibold"><LogIn size={17} />登录</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
