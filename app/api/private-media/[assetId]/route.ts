import { readFile } from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventRoleApplications, eventRoleGrants, mediaAssets, users } from "@/lib/db/schema";
import { canReadRankProof } from "@/lib/private-media-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const { assetId } = await params;
  const [asset] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.purpose, "RANK_SCREENSHOT"))).limit(1);
  if (!asset) return new Response("Not found", { status: 404 });
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.rankScreenshotAssetId, asset.id)).limit(1);
  if (!owner) return new Response("Not found", { status: 404 });

  const eventId = new URL(request.url).searchParams.get("eventId");
  let hasEventManagerGrant = false;
  let hasPlayerApplication = false;
  if (eventId && user.role !== "ADMIN" && owner.id !== user.id) {
    const [grant, application] = await Promise.all([
      db.select({ userId: eventRoleGrants.userId }).from(eventRoleGrants).where(and(
        eq(eventRoleGrants.eventId, eventId),
        eq(eventRoleGrants.userId, user.id),
        eq(eventRoleGrants.role, "EVENT_MANAGER")
      )).limit(1),
      db.select({ id: eventRoleApplications.id }).from(eventRoleApplications).where(and(
        eq(eventRoleApplications.eventId, eventId),
        eq(eventRoleApplications.userId, owner.id),
        eq(eventRoleApplications.role, "PLAYER")
      )).limit(1)
    ]);
    hasEventManagerGrant = Boolean(grant[0]);
    hasPlayerApplication = Boolean(application[0]);
  }
  const allowed = canReadRankProof({ viewerId: user.id, viewerRole: user.role, ownerId: owner.id, eventId, hasEventManagerGrant, hasPlayerApplication });
  if (!allowed) return new Response("Not found", { status: 404 });

  const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));
  const target = path.resolve(uploadRoot, asset.storageKey);
  const rankRoot = path.join(uploadRoot, "rank_screenshot") + path.sep;
  if (!target.startsWith(rankRoot)) return new Response("Not found", { status: 404 });
  const body = await readFile(target).catch(() => null);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="rank-proof-${asset.id}.webp"`,
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin"
    }
  });
}
