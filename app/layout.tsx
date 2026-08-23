import type { Metadata } from "next";
import "./globals.css";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-600.css";
import "@fontsource/noto-serif-sc/chinese-simplified-700.css";
import "@fontsource/noto-serif-sc/chinese-simplified-900.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/800.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { default: "DWRG 庄园联赛", template: "%s · DWRG 庄园联赛" },
  description: "第五人格社区赛事报名、编排与赛果档案平台"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1001] focus:bg-paper focus:px-4 focus:py-2">跳到主要内容</a>
        <SiteHeader />
        <main id="main" className="paper-shell">{children}</main>
        <footer className="site-footer mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-6 text-xs md:px-8"><span>DWRG 庄园联赛 · 社区赛事档案平台</span><span>非《第五人格》官方产品；游戏名称及相关素材版权归其权利人所有。</span></footer>
      </body>
    </html>
  );
}
