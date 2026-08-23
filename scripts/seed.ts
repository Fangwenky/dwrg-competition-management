import argon2 from "argon2";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, sqlClient } from "../lib/db";
import { appearances, bpEntries, eventRoleGrants, events, gameCharacters, gameMaps, gameRounds, halfResults, matches, stages, teamMembers, teams, users } from "../lib/db/schema";
import wikiCatalogData from "../data/wiki-catalog.json";

type WikiCharacter = {
  wikiPageId: number;
  name: string;
  faction: "SURVIVOR" | "HUNTER";
  orderIndex: number;
  wikiRevisionId: number | null;
  posterPath: string | null;
  sourceUrl: string;
  sourceImageUrl: string | null;
  sourceImagePageUrl: string | null;
};
const wikiCatalog = wikiCatalogData as unknown as { source: { fetchedAt: string | null }; characters: WikiCharacter[] };

async function main() {
const adminUsername = (process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin").toLowerCase();
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!adminPassword || adminPassword.length < 10) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 10 characters");

let [admin] = await db.select().from(users).where(eq(users.username, adminUsername)).limit(1);
if (!admin) {
  [admin] = await db.insert(users).values({ username: adminUsername, displayName: "庄园总管", passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }), role: "ADMIN", mustChangePassword: true }).returning();
}

const maps = [
  ["arms-factory", "军工厂"], ["red-church", "红教堂"], ["sacred-heart", "圣心医院"], ["lakeside", "湖景村"], ["moon-river", "月亮河公园"],
  ["leos-memory", "里奥的回忆"], ["eversleeping", "永眠镇"], ["china-town", "唐人街"], ["darkwoods", "不归林"]
] as const;
await db.insert(gameMaps).values(maps.map(([key,name],orderIndex)=>({key,name,orderIndex}))).onConflictDoNothing();

const survivors = ["医生","律师","园丁","佣兵","空军","祭司","先知","前锋","机械师","调香师","勘探员","击球手","昆虫学者","病患","心理学家","古董商","记者","飞行家","拉拉队员","木偶师","火灾调查员"];
const hunters = ["厂长","小丑","鹿头","杰克","蜘蛛","红蝶","黄衣之主","宿伞之魂","摄影师","疯眼","梦之女巫","爱哭鬼","红夫人","26号守卫","雕刻家","破轮","渔女","隐士","歌剧演员","时空之影"];
await db.insert(gameCharacters).values([...survivors.map((name,index)=>({key:`s-${index+1}`,name,faction:"SURVIVOR" as const,orderIndex:index})),...hunters.map((name,index)=>({key:`h-${index+1}`,name,faction:"HUNTER" as const,orderIndex:index}))]).onConflictDoNothing();

const normalizedCharacterName = (name: string) => name.replace(/[“”"'\s]/g, "");
const storedCharacters = await db.select().from(gameCharacters);
const byWikiPageId = new Map(storedCharacters.filter((item) => item.wikiPageId !== null).map((item) => [item.wikiPageId, item]));
const byName = new Map(storedCharacters.map((item) => [normalizedCharacterName(item.name), item]));
const sourceUpdatedAt = wikiCatalog.source.fetchedAt ? new Date(wikiCatalog.source.fetchedAt) : new Date();
for (const character of wikiCatalog.characters) {
  const existing = byWikiPageId.get(character.wikiPageId) ?? byName.get(normalizedCharacterName(character.name));
  const values = {
    name: character.name,
    faction: character.faction,
    orderIndex: character.orderIndex,
    wikiPageId: character.wikiPageId,
    wikiRevisionId: character.wikiRevisionId,
    posterPath: character.posterPath,
    sourceUrl: character.sourceUrl,
    sourceImageUrl: character.sourceImageUrl,
    sourceImagePageUrl: character.sourceImagePageUrl,
    sourceUpdatedAt
  };
  if (existing) {
    await db.update(gameCharacters).set(values).where(eq(gameCharacters.key, existing.key));
  } else {
    await db.insert(gameCharacters).values({ key: `wiki-${character.faction === "SURVIVOR" ? "s" : "h"}-${character.wikiPageId}`, enabled: true, ...values });
  }
}

let [event] = await db.select().from(events).where(eq(events.slug,"manor-invitational-2026")).limit(1);
if (!event) {
  [event] = await db.insert(events).values({
    slug:"manor-invitational-2026", name:"DWRG 庄园邀请赛", tagline:"雾都档案 · 2026 夏季赛",
    description:"面向第五人格玩家的社区邀请赛。参赛者须先完成赛事身份审核，再以临时战队提交报名名单。赛事结果、地图与角色 BP 将在比赛结束后公开归档。",
    status:"ACTIVE", minRoster:5, maxRoster:7, defaultBestOf:3, createdBy:admin.id,
    registrationStart:new Date("2026-08-01T00:00:00+08:00"), registrationEnd:new Date("2026-08-20T23:59:00+08:00"), eventStart:new Date("2026-08-22T19:00:00+08:00"), eventEnd:new Date("2026-09-06T22:00:00+08:00"),
    rules:{scoring:"0/1/2/3/4 escapes => 0/1/2/3/5 survivor points",timezone:"Asia/Shanghai"}
  }).returning();
}

const demoUsers = [];
for (let i=1;i<=10;i++) {
  const username=`demo_player_${i}`;
  let [user]=await db.select().from(users).where(eq(users.username,username)).limit(1);
  if(!user)[user]=await db.insert(users).values({username,displayName:`演示选手 ${String(i).padStart(2,"0")}`,passwordHash:await argon2.hash(randomBytes(24).toString("hex")),disabled:true}).returning();
  demoUsers.push(user);
  await db.insert(eventRoleGrants).values({eventId:event.id,userId:user.id,role:"PLAYER",grantedBy:admin.id}).onConflictDoNothing();
}

const teamSpecs = [["夜莺档案局","NIG"],["缄默钟楼","CLK"]] as const;
const seededTeams=[];
for (let index=0;index<teamSpecs.length;index++) {
  const [name,abbreviation]=teamSpecs[index];
  let [team]=await db.select().from(teams).where(and(eq(teams.eventId,event.id),eq(teams.abbreviation,abbreviation))).limit(1);
  if(!team)[team]=await db.insert(teams).values({eventId:event.id,name,abbreviation,slogan:index===0?"循声而来，循迹而战。":"钟声落下前，答案仍未揭晓。",description:index===0?"以稳定运营和灵活阵容见长的庄园调查队，擅长在长局中寻找转机。":"围绕监管者节奏构建战术的对抗型战队，追求迅速建立优势。",captainId:demoUsers[index*5].id,status:"APPROVED",locked:true}).returning();
  else if(!team.description) await db.update(teams).set({description:index===0?"以稳定运营和灵活阵容见长的庄园调查队，擅长在长局中寻找转机。":"围绕监管者节奏构建战术的对抗型战队，追求迅速建立优势。"}).where(eq(teams.id,team.id));
  seededTeams.push(team);
  for(let memberIndex=0;memberIndex<5;memberIndex++){const user=demoUsers[index*5+memberIndex];await db.insert(teamMembers).values({eventId:event.id,teamId:team.id,userId:user.id,role:memberIndex===0?"CAPTAIN":"MEMBER",specialty:memberIndex===4?"HUNTER":"SURVIVOR",gameNickname:`${abbreviation}_${memberIndex+1}`,publicBio:memberIndex===4?"监管者位，擅长控场与残局运营。":"求生者位，重视团队沟通与牵制节奏。"}).onConflictDoNothing();}
}

let [stage]=await db.select().from(stages).where(and(eq(stages.eventId,event.id),eq(stages.orderIndex,1))).limit(1);
if(!stage)[stage]=await db.insert(stages).values({eventId:event.id,name:"揭幕对抗",type:"MANUAL",status:"ACTIVE",orderIndex:1,advanceCount:1}).returning();
let [match]=await db.select().from(matches).where(and(eq(matches.eventId,event.id),eq(matches.bracketIndex,1))).limit(1);
if(!match){
  [match]=await db.insert(matches).values({eventId:event.id,stageId:stage.id,roundLabel:"揭幕战",bracketIndex:1,teamAId:seededTeams[0].id,teamBId:seededTeams[1].id,bestOf:3,status:"PUBLISHED",scheduledAt:new Date("2026-08-22T19:00:00+08:00"),scoreA:2,scoreB:0,winnerTeamId:seededTeams[0].id,winnerSide:"A",publishedAt:new Date()}).returning();
  const roundData=[{mapKey:"red-church",a:6,b:3,e1:3,e2:2},{mapKey:"moon-river",a:8,b:2,e1:4,e2:1}];
  for(let i=0;i<roundData.length;i++){const item=roundData[i];const [round]=await db.insert(gameRounds).values({matchId:match.id,roundIndex:i+1,mapKey:item.mapKey,scoreA:item.a,scoreB:item.b,winnerTeamId:seededTeams[0].id,winnerSide:"A"}).returning();await db.insert(halfResults).values([{roundId:round.id,halfIndex:1,survivorTeamId:seededTeams[0].id,hunterTeamId:seededTeams[1].id,survivorSide:"A",hunterSide:"B",escapes:item.e1,survivorPoints:item.e1===4?5:item.e1,hunterPoints:item.e1===4?0:item.e1===3?1:item.e1===2?2:item.e1===1?3:5},{roundId:round.id,halfIndex:2,survivorTeamId:seededTeams[1].id,hunterTeamId:seededTeams[0].id,survivorSide:"B",hunterSide:"A",escapes:item.e2,survivorPoints:item.e2===4?5:item.e2,hunterPoints:item.e2===4?0:item.e2===3?1:item.e2===2?2:item.e2===1?3:5}]);await db.insert(bpEntries).values([{roundId:round.id,halfIndex:1,orderIndex:1,teamId:seededTeams[1].id,scope:"CHARACTER",action:"BAN",targetKey:"先知"},{roundId:round.id,halfIndex:1,orderIndex:2,teamId:seededTeams[0].id,scope:"CHARACTER",action:"PICK",targetKey:"佣兵"}]);}
}

if(await db.$count(appearances,eq(appearances.userId,demoUsers[0].id))===0){
  const seededRounds=await db.select().from(gameRounds).where(eq(gameRounds.matchId,match.id));
  for(const round of seededRounds){
    const seededHalves=await db.select().from(halfResults).where(eq(halfResults.roundId,round.id));
    for(const half of seededHalves){
      if(!half.survivorTeamId||!half.hunterTeamId)continue;
      const survivorTeamId=half.survivorTeamId;const hunterTeamId=half.hunterTeamId;
      const survivorMembers=await db.select().from(teamMembers).where(eq(teamMembers.teamId,survivorTeamId));
      const hunterMembers=await db.select().from(teamMembers).where(eq(teamMembers.teamId,hunterTeamId));
      await db.insert(appearances).values([
        ...survivorMembers.slice(0,4).map((member,index)=>({halfId:half.id,teamId:survivorTeamId,side:half.survivorSide,userId:member.userId,faction:"SURVIVOR" as const,characterKey:`s-${index+4}`})),
        {halfId:half.id,teamId:hunterTeamId,side:half.hunterSide,userId:hunterMembers[4]?.userId??hunterMembers[0].userId,faction:"HUNTER" as const,characterKey:`h-${round.roundIndex+10}`}
      ]).onConflictDoNothing();
    }
  }
}

console.log(`Seed complete. Bootstrap admin: ${adminUsername}`);
await sqlClient.end();
}

main().catch(async (error) => {
  console.error(error);
  await sqlClient.end();
  process.exit(1);
});
