import { asc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import { gameCharacters } from "@/lib/db/schema";
import { setGameCharacterEnabled } from "@/app/actions/ops";
import { requirePageAdmin } from "@/lib/auth";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SafeImage } from "@/components/safe-image";
import { FormSubmitButton } from "@/components/form-submit-button";

type Filter = "ALL" | "SURVIVOR" | "HUNTER";

export default async function AdminCatalogPage({ searchParams }: { searchParams: Promise<{ faction?: string; error?: string; success?: string }> }) {
  await requirePageAdmin("/admin/catalog");
  const feedback = await searchParams;
  const { faction: requestedFaction = "ALL" } = feedback;
  const faction: Filter = requestedFaction === "SURVIVOR" || requestedFaction === "HUNTER" ? requestedFaction : "ALL";
  const allCharacters = await db.select().from(gameCharacters).orderBy(asc(gameCharacters.faction), asc(gameCharacters.orderIndex), asc(gameCharacters.name));
  const characters = faction === "ALL" ? allCharacters : allCharacters.filter((item) => item.faction === faction);
  const survivorCount = allCharacters.filter((item) => item.faction === "SURVIVOR").length;
  const hunterCount = allCharacters.filter((item) => item.faction === "HUNTER").length;

  return <div>
    {(feedback.error || feedback.success) && <p role={feedback.error ? "alert" : "status"} className={`mb-6 border px-4 py-3 text-sm font-semibold ${feedback.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`}>{feedback.error ?? feedback.success}</p>}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">GAME CATALOG</p><h2 className="section-title mt-2">比赛角色目录</h2><p className="mt-3 max-w-2xl text-sm text-[#645b4e]">角色名称与立绘缩略图来自第五人格 BWIKI。停用角色不会出现在比赛结果录入选择器中，历史比赛记录不受影响。</p></div>
      <div className="grid grid-cols-2 gap-3 text-center"><div className="border border-line bg-parchment px-5 py-3"><span className="data-label">求生者</span><strong className="block font-data text-3xl">{survivorCount}</strong></div><div className="border border-line bg-parchment px-5 py-3"><span className="data-label">监管者</span><strong className="block font-data text-3xl">{hunterCount}</strong></div></div>
    </div>
    <div className="mt-6 flex flex-wrap gap-2" aria-label="角色阵营筛选">{([ ["ALL", "全部"], ["SURVIVOR", "求生者"], ["HUNTER", "监管者"] ] as const).map(([value, label]) => <Link className={faction === value ? "button-primary" : "button-secondary"} href={value === "ALL" ? "/admin/catalog" : `/admin/catalog?faction=${value}`} key={value}>{label}</Link>)}</div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{characters.map((character) => <article className={`overflow-hidden border bg-[#f8f3e9] ${character.enabled ? "border-line" : "border-danger/35 opacity-70"}`} key={character.key}>
      <div className="relative flex h-56 items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#423b58_0%,#17191f_72%)]"><SafeImage className="h-full w-full object-contain object-bottom" src={character.posterPath} alt={`${character.name}角色立绘`} loading="lazy" fallback={<div className="mb-16 font-display text-5xl text-white/25">{character.name.slice(0, 1)}</div>} /><span className="absolute left-3 top-3 badge border-white/25 bg-black/45 text-white">{character.faction === "SURVIVOR" ? "求生者" : "监管者"}</span></div>
      <div className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-bold">{character.name}</h3><span className="text-xs text-[#6d6458]">Wiki #{character.wikiPageId ?? "未关联"}</span></div><span className={`badge ${character.enabled ? "border-[#52755f] text-[#31533c]" : "border-danger/50 text-danger"}`}>{character.enabled ? "已启用" : "已停用"}</span></div>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">{character.sourceUrl ? <a className="min-h-11 py-3 text-xs font-semibold text-plum underline" href={character.sourceUrl} target="_blank" rel="noreferrer">查看 Wiki 来源</a> : <span className="text-xs text-[#6d6458]">本地基础数据</span>}<form action={setGameCharacterEnabled}><input type="hidden" name="key" value={character.key} /><input type="hidden" name="enabled" value={String(!character.enabled)} />{character.enabled ? <ConfirmSubmitButton className="button-danger" message={`确认停用“${character.name}”？它将不再出现在新的比赛录入选择器中，历史记录不受影响。`}>停用</ConfirmSubmitButton> : <FormSubmitButton className="button-secondary" pendingLabel="正在启用…">启用</FormSubmitButton>}</form></div>
      </div>
    </article>)}</div>
    <p className="mt-7 border-l-4 border-gold bg-parchment p-4 text-xs text-[#645b4e]">数据来源：第五人格WIKI_BWIKI_哔哩哔哩。该目录仅用于社区赛事管理与角色识别；游戏角色及原始美术素材版权归其权利人所有。</p>
  </div>;
}
