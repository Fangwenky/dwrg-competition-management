import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const API_URL = "https://wiki.biligame.com/dwrg/api.php";
const WIKI_BASE_URL = "https://wiki.biligame.com/dwrg/";
const OUTPUT_FILE = path.join(process.cwd(), "data", "wiki-catalog.json");
const POSTER_DIR = path.join(process.cwd(), "public", "catalog", "characters");
const CACHE_DIR = path.join(process.cwd(), ".cache", "dwrg-wiki");
const USER_AGENT = "DWRG-Community-League-Catalog/1.0 (dwrg.fangwenky.dpdns.org)";
const refreshImages = process.argv.includes("--refresh-images");
const refreshApi = process.argv.includes("--refresh-api");

type Faction = "SURVIVOR" | "HUNTER";
type CategoryMember = { pageid: number; title: string };
type Character = {
  wikiPageId: number;
  name: string;
  faction: Faction;
  orderIndex: number;
  wikiRevisionId: number | null;
  posterPath: string | null;
  sourceUrl: string;
  sourceImageUrl: string | null;
  sourceImagePageUrl: string | null;
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchJson<T>(parameters: Record<string, string>, attempt = 1): Promise<T> {
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries({ ...parameters, format: "json", formatversion: "2" })) url.searchParams.set(key, value);
  const cachePath = path.join(CACHE_DIR, `${createHash("sha256").update(url.toString()).digest("hex")}.json`);
  if (!refreshApi && existsSync(cachePath)) return JSON.parse(await readFile(cachePath, "utf8")) as T;
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
  } catch (error) {
    if (attempt < 4) {
      await wait(attempt * 3_000);
      return fetchJson<T>(parameters, attempt + 1);
    }
    throw error;
  }
  if (!response.ok) {
    if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
      await wait(attempt * 3_000);
      return fetchJson<T>(parameters, attempt + 1);
    }
    throw new Error(`BWIKI API 请求失败：${response.status} ${url.pathname}`);
  }
  const body = await response.text();
  if (body.includes("请求已被站点的安全策略拦截")) {
    if (attempt < 4) {
      await wait(attempt * 4_000);
      return fetchJson<T>(parameters, attempt + 1);
    }
    throw new Error("BWIKI 暂时限制了同步请求，请稍后重试");
  }
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, body);
  await wait(850);
  return JSON.parse(body) as T;
}

async function categoryMembers(category: string): Promise<CategoryMember[]> {
  const result: CategoryMember[] = [];
  let continuation = "";
  do {
    const response = await fetchJson<{
      continue?: { cmcontinue?: string };
      query: { categorymembers: CategoryMember[] };
    }>({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmnamespace: "0",
      cmlimit: "max",
      ...(continuation ? { cmcontinue: continuation } : {})
    });
    result.push(...response.query.categorymembers);
    continuation = response.continue?.cmcontinue ?? "";
  } while (continuation);
  return result;
}

function batches<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function characterMetadata(members: CategoryMember[]) {
  const result = new Map<number, { orderIndex: number; revisionId: number | null }>();
  let completed = 0;
  for (const batch of batches(members, 6)) {
    const response = await fetchJson<{
      query: { pages: Array<{ pageid: number; revisions?: Array<{ revid: number; slots?: { main?: { content?: string } } }> }> };
    }>({
      action: "query",
      pageids: batch.map((item) => item.pageid).join("|"),
      prop: "revisions",
      rvprop: "ids|content",
      rvslots: "main"
    });
    for (const page of response.query.pages) {
      const revision = page.revisions?.[0];
      const content = revision?.slots?.main?.content ?? "";
      const order = Number(content.match(/\|\s*出场顺序\s*=\s*([0-9]+)/)?.[1] ?? content.match(/\|\s*上线顺序\s*=\s*([0-9]+)/)?.[1]);
      result.set(page.pageid, { orderIndex: Number.isFinite(order) ? order : 100_000 + page.pageid, revisionId: revision?.revid ?? null });
    }
    completed += batch.length;
    console.log(`已读取角色资料 ${completed}/${members.length}`);
  }
  return result;
}

type ImageInfo = {
  thumburl?: string;
  url: string;
  descriptionurl: string;
  mime: string;
};

async function characterImages(members: CategoryMember[]) {
  const result = new Map<string, ImageInfo>();
  let completed = 0;
  for (const batch of batches(members, 12)) {
    const titles = batch.flatMap((item) => [`File:${item.title}立绘2.png`, `File:${item.title}立绘.png`]);
    const response = await fetchJson<{
      query: { pages: Array<{ title: string; missing?: boolean; imageinfo?: ImageInfo[] }> };
    }>({
      action: "query",
      titles: titles.join("|"),
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "360"
    });
    for (const page of response.query.pages) {
      const info = page.imageinfo?.[0];
      if (info) result.set(page.title.replace(/^文件:/, ""), info);
    }
    completed += batch.length;
    console.log(`已读取立绘索引 ${completed}/${members.length}`);
  }
  return result;
}

function parseRankRows(section: string) {
  const rows: Array<{ tier: string; name: string; label: string }> = [];
  const pattern = /\|\s*\[\[文件:[^\]]+\]\]\s*\|\|\s*([^|\n]+?)\s*\|\|\s*([^|\n]+?)\s*\|\|/g;
  for (const match of section.matchAll(pattern)) {
    const tier = match[1].replace(/\s+/g, "").trim();
    const name = match[2].replace(/\s+/g, "").trim();
    rows.push({ tier, name, label: tier });
  }
  return rows;
}

async function rankCatalog() {
  const response = await fetchJson<{ parse: { revid?: number; wikitext: string } }>({
    action: "parse",
    page: "排位模式",
    prop: "wikitext|revid"
  });
  const source = response.parse.wikitext;
  const survivorSection = source.match(/===求生者段位===([\s\S]*?)===监管者段位===/)?.[1] ?? "";
  const hunterSection = source.match(/===监管者段位===([\s\S]*?)==机制==/)?.[1] ?? "";
  const survivor = parseRankRows(survivorSection);
  const hunter = parseRankRows(hunterSection);
  if (survivor.length !== 8 || hunter.length !== 8) throw new Error(`段位解析结果异常：求生者 ${survivor.length}，监管者 ${hunter.length}`);
  return { survivor, hunter, revisionId: response.parse.revid ?? null };
}

async function downloadPoster(character: Character, info: ImageInfo) {
  const outputName = `${character.faction === "SURVIVOR" ? "survivor" : "hunter"}-${character.wikiPageId}.webp`;
  const outputPath = path.join(POSTER_DIR, outputName);
  if (!refreshImages && existsSync(outputPath)) return `/catalog/characters/${outputName}`;
  let response: Response | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      response = await fetch(info.thumburl ?? info.url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (response.ok) break;
    } catch {
      response = null;
    }
    await wait(attempt * 2_000);
  }
  if (!response) throw new Error(`立绘下载失败：${character.name}（网络连接中断）`);
  if (!response.ok) throw new Error(`立绘下载失败：${character.name} (${response.status})`);
  const source = Buffer.from(await response.arrayBuffer());
  await sharp(source)
    .resize({ width: 360, height: 480, fit: "contain", withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(outputPath);
  await wait(160);
  return `/catalog/characters/${outputName}`;
}

async function buildCharacters(faction: Faction, members: CategoryMember[]) {
  const metadata = await characterMetadata(members);
  const images = await characterImages(members);
  const characters: Character[] = [];
  for (const member of members) {
    const meta = metadata.get(member.pageid);
    const preferred = images.get(`${member.title}立绘2.png`) ?? images.get(`${member.title}立绘.png`) ?? null;
    const character: Character = {
      wikiPageId: member.pageid,
      name: member.title,
      faction,
      orderIndex: meta?.orderIndex ?? 100_000 + member.pageid,
      wikiRevisionId: meta?.revisionId ?? null,
      posterPath: null,
      sourceUrl: `${WIKI_BASE_URL}${encodeURIComponent(member.title)}`,
      sourceImageUrl: preferred?.url ?? null,
      sourceImagePageUrl: preferred?.descriptionurl ?? null
    };
    if (preferred) character.posterPath = await downloadPoster(character, preferred);
    characters.push(character);
    if (characters.length % 10 === 0 || characters.length === members.length) console.log(`已处理${faction === "SURVIVOR" ? "求生者" : "监管者"}立绘 ${characters.length}/${members.length}`);
  }
  return characters.sort((a, b) => a.orderIndex - b.orderIndex || a.wikiPageId - b.wikiPageId);
}

async function main() {
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await mkdir(POSTER_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  const survivorMembers = await categoryMembers("求生者");
  const hunterMembers = await categoryMembers("监管者");
  const ranks = await rankCatalog();
  const survivors = await buildCharacters("SURVIVOR", survivorMembers);
  const hunters = await buildCharacters("HUNTER", hunterMembers);
  const existing = existsSync(OUTPUT_FILE) ? JSON.parse(await readFile(OUTPUT_FILE, "utf8")) as { generatedAt?: string } : null;
  const catalog = {
    source: {
      name: "第五人格WIKI_BWIKI_哔哩哔哩",
      url: `${WIKI_BASE_URL}首页`,
      rankUrl: `${WIKI_BASE_URL}${encodeURIComponent("排位模式")}`,
      note: "社区 Wiki 数据；游戏角色及原始美术素材版权归其权利人所有。",
      fetchedAt: new Date().toISOString(),
      previousGeneratedAt: existing?.generatedAt ?? null
    },
    generatedAt: new Date().toISOString(),
    ranks,
    characters: [...survivors, ...hunters]
  };
  await writeFile(OUTPUT_FILE, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`BWIKI 目录同步完成：${survivors.length} 名求生者、${hunters.length} 名监管者、${survivors.filter((item) => item.posterPath).length + hunters.filter((item) => item.posterPath).length} 张立绘。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
