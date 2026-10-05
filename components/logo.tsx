import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex min-h-11 items-center gap-2 sm:gap-3" aria-label="DWRG 庄园联赛首页">
      <span className="relative grid h-9 w-9 place-items-center border border-gold/70 text-gold before:absolute before:inset-1 before:border before:border-gold/30">
        <span className="font-display text-sm font-black tracking-tight">V</span>
      </span>
      <span className={compact ? "hidden leading-none min-[400px]:block" : "leading-none"}>
        <span className="block font-display text-xl font-black tracking-[.12em]">DWRG</span>
        <span className="mt-1 block text-[10px] tracking-[.28em] text-[#aebbd0]">庄园联赛</span>
      </span>
    </Link>
  );
}
