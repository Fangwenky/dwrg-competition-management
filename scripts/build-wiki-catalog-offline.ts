import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import currentCatalogData from "../data/wiki-catalog.json";

const inputDirectory = process.argv.find((item) => item.startsWith("--input="))?.slice("--input=".length) ?? "/tmp";
const projectRoot = process.cwd();
const posterDirectory = path.join(projectRoot, "public", "catalog", "characters");
const outputFile = path.join(projectRoot, "data", "wiki-catalog.json");
const wikiBase = "https://wiki.biligame.com/dwrg/";

type Member = { pageid: number; title: string };
type ImageInfo = { thumburl?: string; url: string; descriptionurl: string };

async function jsonFile<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(path.join(inputDirectory, fileName), "utf8")) as T;
}

async function savePoster(url: string, fileName: string) {
  const destination = path.join(posterDirectory, fileName);
  if (existsSync(destination)) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`缩略图下载失败：${response.status} ${url}`);
  await sharp(Buffer.from(await response.arrayBuffer()))
    .resize({ width: 360, height: 480, fit: "contain", withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(destination);
}

async function main() {
  await mkdir(posterDirectory, { recursive: true });
  const survivorResponse = await jsonFile<{ query: { categorymembers: Member[] } }>("dwrg-wiki-survivors.json");
  const hunterResponse = await jsonFile<{ query: { categorymembers: Member[] } }>("dwrg-wiki-hunters.json");
  const imageFiles = [0, 12, 18, 24, 30].map((offset) => `dwrg-wiki-hunter-images-${offset}.json`).filter((fileName) => existsSync(path.join(inputDirectory, fileName)));
  const imageMap = new Map<string, ImageInfo>();
  for (const fileName of imageFiles) {
    const response = await jsonFile<{ query: { pages: Array<{ title: string; imageinfo?: ImageInfo[] }> } }>(fileName);
    for (const page of response.query.pages) if (page.imageinfo?.[0]) imageMap.set(page.title.replace(/^文件:/, ""), page.imageinfo[0]);
  }

  const characters = [];
  for (const [faction, members] of [["SURVIVOR", survivorResponse.query.categorymembers], ["HUNTER", hunterResponse.query.categorymembers]] as const) {
    for (let index = 0; index < members.length; index++) {
      const member = members[index];
      const prefix = faction === "SURVIVOR" ? "survivor" : "hunter";
      const fileName = `${prefix}-${member.pageid}.webp`;
      const info = imageMap.get(`${member.title}立绘2.png`) ?? imageMap.get(`${member.title}立绘.png`) ?? null;
      if (info) await savePoster(info.thumburl ?? info.url, fileName);
      const posterPath = existsSync(path.join(posterDirectory, fileName)) ? `/catalog/characters/${fileName}` : null;
      characters.push({
        wikiPageId: member.pageid,
        name: member.title,
        faction,
        orderIndex: index + 1,
        wikiRevisionId: null,
        posterPath,
        sourceUrl: `${wikiBase}${encodeURIComponent(member.title)}`,
        sourceImageUrl: info?.url ?? null,
        sourceImagePageUrl: info?.descriptionurl ?? null
      });
    }
  }

  const now = new Date().toISOString();
  const currentCatalog = currentCatalogData as unknown as { source: Record<string, unknown>; ranks: unknown; generatedAt: string | null };
  const output = {
    source: { ...currentCatalog.source, fetchedAt: now, previousGeneratedAt: currentCatalog.generatedAt },
    generatedAt: now,
    ranks: currentCatalog.ranks,
    characters
  };
  await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
  const withPoster = characters.filter((item) => item.posterPath).length;
  console.log(`离线目录生成完成：${characters.length} 名角色，${withPoster} 张本地立绘缩略图。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
