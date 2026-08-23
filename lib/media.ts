import "server-only";

import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, mediaAssets, teams, users } from "@/lib/db/schema";

export type MediaPurpose = "EVENT_HERO" | "TEAM_LOGO" | "PLAYER_AVATAR" | "RANK_SCREENSHOT";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;

export function mediaUrl(storageKey?: string | null) {
  return storageKey ? `/uploads/${storageKey}` : null;
}

export function privateMediaUrl(assetId?: string | null, eventId?: string | null) {
  if (!assetId) return null;
  const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
  return `/api/private-media/${assetId}${query}`;
}

export async function storeImage(input: {
  file: File;
  purpose: MediaPurpose;
  uploadedBy: string;
  creditText?: string;
  sourceUrl?: string;
}) {
  const { file, purpose, uploadedBy } = input;
  if (!ACCEPTED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
    throw new Error("仅支持 5MB 内的 JPG、PNG 或 WebP 图片");
  }

  const original = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).metadata().catch(() => null);
  if (!metadata?.format || !ACCEPTED_FORMATS.has(metadata.format)) throw new Error("图片内容无法识别");

  const transformer = sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const output = purpose === "EVENT_HERO"
    ? await transformer.resize({ width: 2560, height: 1440, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true })
    : purpose === "RANK_SCREENSHOT"
      ? await transformer.resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true })
      : await transformer.resize(512, 512, { fit: "cover", position: "attention", withoutEnlargement: false }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true });

  const storageKey = `${purpose.toLowerCase()}/${randomUUID()}.webp`;
  const uploadRoot = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  const target = path.join(uploadRoot, storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, output.data, { flag: "wx" });

  try {
    const [asset] = await db.insert(mediaAssets).values({
      purpose,
      storageKey,
      uploadedBy,
      mimeType: "image/webp",
      width: output.info.width,
      height: output.info.height,
      bytes: output.info.size,
      creditText: input.creditText?.trim() || null,
      sourceUrl: input.sourceUrl?.trim() || null
    }).returning();
    return asset;
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }
}

export async function removeAssetIfUnused(assetId?: string | null) {
  if (!assetId) return;
  const [userReferences, eventReferences, teamReferences] = await Promise.all([
    db.$count(users, or(eq(users.avatarAssetId, assetId), eq(users.rankScreenshotAssetId, assetId))),
    db.$count(events, eq(events.heroAssetId, assetId)),
    db.$count(teams, eq(teams.logoAssetId, assetId))
  ]);
  if (userReferences + eventReferences + teamReferences > 0) return;
  const [asset] = await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId)).returning({ storageKey: mediaAssets.storageKey });
  if (!asset) return;
  const uploadRoot = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  await unlink(path.join(uploadRoot, asset.storageKey)).catch(() => undefined);
}
