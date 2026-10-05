import Link from "next/link";
import { safeNextPath } from "@/lib/validation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PlayerProfileForm, AvatarForm } from "@/components/forms";
import { mediaUrl, privateMediaUrl } from "@/lib/media";
import { ShieldCheck } from "lucide-react";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next, "");
  const user = await requireUser();
  const avatar = user.avatarAssetId ? await db.select({ storageKey: mediaAssets.storageKey }).from(mediaAssets).where(eq(mediaAssets.id, user.avatarAssetId)).limit(1) : [];
  const proofUrl = privateMediaUrl(user.rankScreenshotAssetId);
  const avatarUrl = mediaUrl(avatar[0]?.storageKey);
  const complete = Boolean(user.gameUid && user.gameNickname && user.survivorRank && user.hunterRank && user.rankScreenshotAssetId);
  return <div><p className="eyebrow">PLAYER IDENTITY FILE</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="section-title">个人竞技资料</h1><p className="mt-2 text-[#61584c]">资料集中维护一次，报名赛事时直接引用；UID、段位和截图不会在公开页面展示。</p></div><span className={`badge ${complete ? "border-[#52755f] bg-[#e2eee4] text-[#31533c]" : "border-gold bg-parchment text-[#6a4b25]"}`}><ShieldCheck size={15} />{complete ? "资料完整" : "待完善"}</span></div>{next && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-l-4 border-gold bg-parchment p-4"><p className="text-sm">保存资料后，请返回原来的赛事继续申请。</p><Link className="button-secondary" href={next}>返回赛事报名</Link></div>}<div className="mt-8 grid gap-7 xl:grid-cols-[1fr_340px]"><PlayerProfileForm user={user} /><aside className="space-y-5"><AvatarForm name={user.displayName} src={avatarUrl} /><div className="card"><span className="data-label">审核证明预览</span>{proofUrl ? <a href={proofUrl} target="_blank" rel="noreferrer"><img className="mt-3 max-h-72 w-full border border-line object-contain" src={proofUrl} alt="段位与战绩证明截图" /></a> : <p className="mt-3 text-sm text-[#5d687d]">保存资料后将在这里显示审核截图。</p>}<p className="mt-3 text-xs text-[#6d6458]">仅本人及有权审核赛事报名的管理员可见。</p></div></aside></div></div>;
}
