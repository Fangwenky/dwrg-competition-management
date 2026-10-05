"use client";

import { useActionState, useState } from "react";
import { pointsForEscapes } from "@/lib/scoring";
import { saveMatchResult, type OpsState } from "@/app/actions/ops";
import { FormMessage as Message, preserveFormValues } from "@/components/form-feedback";
import { SafeImage } from "@/components/safe-image";

type RosterEntry = { username: string; label: string };
type TeamOption = { name: string; roster: RosterEntry[] };
type CharacterOption = { key: string; name: string; faction: "SURVIVOR" | "HUNTER" | "FLEX"; posterPath: string | null; sourceUrl: string | null };
type InitialAppearance = { username: string; characterKey: string };
type InitialBp = { scope: "MAP" | "FACTION" | "CHARACTER"; action: "BAN" | "PICK"; targetKey: string };
type InitialHalf = { escapes: number; survivors: InitialAppearance[]; hunter: InitialAppearance | null; bp: InitialBp[] };
export type InitialRoundResult = { index: number; mapKey: string; firstSurvivor: "A" | "B"; halves: { 1: InitialHalf; 2: InitialHalf } };


function PlayerSelect({ name, roster, label, initialValue = "" }: { name: string; roster: RosterEntry[]; label: string; initialValue?: string }) {
  const historical = initialValue && !roster.some((player) => player.username === initialValue);
  return <div><label className="label" htmlFor={name}>{label}</label><select className="input" id={name} name={name} defaultValue={initialValue}><option value="" disabled>选择选手</option>{historical && <option value={initialValue}>历史出场 · {initialValue}</option>}{roster.map((player) => <option value={player.username} key={player.username}>{player.label}</option>)}</select></div>;
}

function CharacterSelect({ name, characters, faction, initialValue = "" }: { name: string; characters: CharacterOption[]; faction: "SURVIVOR" | "HUNTER"; initialValue?: string }) {
  const options = characters.filter((item) => item.faction === faction);
  const [selectedKey, setSelectedKey] = useState(initialValue);
  const selected = options.find((item) => item.key === selectedKey);
  const historical = selectedKey && !selected;
  return <div className="grid min-h-20 grid-cols-[64px_1fr] items-stretch overflow-hidden border border-line bg-white/55">
    <div className="flex items-end justify-center bg-[radial-gradient(circle_at_50%_35%,#423b58_0%,#17191f_80%)]"><SafeImage className="h-20 w-full object-contain object-bottom" src={selected?.posterPath} alt="" fallback={<span className="pb-5 font-display text-xl text-white/35">?</span>} /></div>
    <div className="flex min-w-0 flex-col justify-center p-2"><label className="sr-only" htmlFor={name}>使用角色</label><select className="input h-11 py-2" id={name} name={name} value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}><option value="">选择{faction === "SURVIVOR" ? "求生者" : "监管者"}</option>{historical && <option value={selectedKey}>历史角色 · {selectedKey}</option>}{options.map((item) => <option value={item.key} key={item.key}>{item.name}</option>)}</select>{selected?.sourceUrl && <a className="mt-1 truncate text-[11px] text-plum underline" href={selected.sourceUrl} target="_blank" rel="noreferrer">查看角色资料来源</a>}</div>
  </div>;
}

function HalfEditor({ round, half, survivorTeam, hunterTeam, characters, maps, initial }: { round: number; half: 1 | 2; survivorTeam: TeamOption; hunterTeam: TeamOption; characters: CharacterOption[]; maps: Array<{ key: string; name: string }>; initial?: InitialHalf }) {
  return <fieldset className="border border-line p-4">
    <legend className="px-2 font-display text-xl font-bold">{half === 1 ? "上半场" : "下半场"}</legend>
    <div className="mb-4 grid gap-3 border-b border-line pb-4 sm:grid-cols-2"><div><span className="data-label">求生者方</span><div className="font-bold">{survivorTeam.name}</div></div><div><span className="data-label">监管者方</span><div className="font-bold">{hunterTeam.name}</div></div></div>
    <div className="space-y-3"><span className="data-label">求生者阵容</span>{Array.from({ length: 4 }, (_, slot) => <div className="grid gap-2 sm:grid-cols-2" key={slot}><PlayerSelect name={`survivor_${half}_${round}_${slot + 1}`} roster={survivorTeam.roster} label={`求生者 ${slot + 1}`} initialValue={initial?.survivors[slot]?.username} /><CharacterSelect name={`survivor_char_${half}_${round}_${slot + 1}`} characters={characters} faction="SURVIVOR" initialValue={initial?.survivors[slot]?.characterKey} /></div>)}</div>
    <div className="mt-5 grid gap-2 sm:grid-cols-2"><PlayerSelect name={`hunter_${half}_${round}`} roster={hunterTeam.roster} label="监管者选手" initialValue={initial?.hunter?.username} /><CharacterSelect name={`hunter_char_${half}_${round}`} characters={characters} faction="HUNTER" initialValue={initial?.hunter?.characterKey} /></div>
    <details className="mt-5 border-t border-line pt-3" open={Boolean(initial?.bp.length)}><summary className="min-h-11 cursor-pointer font-semibold text-plum">BP 顺序（可选，点击展开）</summary><div className="mt-2 space-y-2">{Array.from({ length: 4 }, (_, slot) => {
      const item = initial?.bp[slot];
      return <div className="grid grid-cols-2 gap-2 sm:grid-cols-[90px_90px_minmax(0,1fr)]" key={slot}><select className="input" name={`bp_scope_${half}_${round}_${slot + 1}`} aria-label={`第 ${slot + 1} 项 BP 类型`} defaultValue={item?.scope ?? "CHARACTER"}><option value="CHARACTER">角色</option><option value="MAP">地图</option><option value="FACTION">阵营</option></select><select className="input" name={`bp_action_${half}_${round}_${slot + 1}`} aria-label={`第 ${slot + 1} 项 BP 动作`} defaultValue={item?.action ?? "BAN"}><option value="BAN">禁用</option><option value="PICK">选用</option></select><input className="input col-span-2 sm:col-span-1" name={`bp_target_${half}_${round}_${slot + 1}`} list={`bp-targets-${round}-${half}`} defaultValue={item?.targetKey ?? ""} placeholder="选择或输入目标" aria-label={`第 ${slot + 1} 项 BP 目标`} /></div>;
    })}</div><datalist id={`bp-targets-${round}-${half}`}><option value="SURVIVOR">求生者阵营</option><option value="HUNTER">监管者阵营</option>{maps.map((map) => <option value={map.key} key={`map-${map.key}`}>{map.name}</option>)}{characters.map((character) => <option value={character.key} key={`character-${character.key}`}>{character.name}</option>)}</datalist></details>
  </fieldset>;
}

function RoundEditor({ index, maps, teams, characters, initial }: { index: number; maps: Array<{ key: string; name: string }>; teams: { A: TeamOption; B: TeamOption }; characters: CharacterOption[]; initial?: InitialRoundResult }) {
  const [firstSurvivor, setFirstSurvivor] = useState<"A" | "B">(initial?.firstSurvivor ?? "A");
  const [mapKey, setMapKey] = useState(initial?.mapKey ?? "");
  const [escapes, setEscapes] = useState({ 1: String(initial?.halves[1].escapes ?? 0), 2: String(initial?.halves[2].escapes ?? 0) });
  const other = firstSurvivor === "A" ? "B" : "A";
  const validScores = /^[0-4]$/.test(escapes[1]) && /^[0-4]$/.test(escapes[2]);
  const first = validScores ? pointsForEscapes(Number(escapes[1])) : null;
  const second = validScores ? pointsForEscapes(Number(escapes[2])) : null;
  const scoreFirst = first && second ? first.survivor + second.hunter : null;
  const scoreOther = first && second ? first.hunter + second.survivor : null;
  const scoreA = firstSurvivor === "A" ? scoreFirst : scoreOther;
  const scoreB = firstSurvivor === "A" ? scoreOther : scoreFirst;
  const sameSides = firstSurvivor === (initial?.firstSurvivor ?? "A");
  return <details className="card group" open={index === 1 || Boolean(initial)}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-display text-xl font-bold">
      <span className="min-w-0">第 {index} 局<span className="ml-3 font-sans text-sm font-normal text-[#5d687d]">{maps.find((map) => map.key === mapKey)?.name ?? "未进行"}</span></span>
      <span className="font-data text-lg text-plum">{mapKey && validScores ? `${scoreA} : ${scoreB}` : "＋"}</span>
    </summary>
    <div className="mt-5 border-t border-line pt-5"><div className="grid gap-4 md:grid-cols-2"><div><label className="label" htmlFor={`map-${index}`}>比赛地图</label><select className="input" id={`map-${index}`} name={`map_${index}`} value={mapKey} onChange={(event) => setMapKey(event.target.value)}><option value="">未进行</option>{maps.map((map) => <option value={map.key} key={map.key}>{map.name}</option>)}</select></div><div><label className="label" htmlFor={`first-survivor-${index}`}>上半场求生者方</label><select className="input" id={`first-survivor-${index}`} name={`first_survivor_${index}`} value={firstSurvivor} onChange={(event) => setFirstSurvivor(event.target.value as "A" | "B")}><option value="A">{teams.A.name}</option><option value="B">{teams.B.name}</option></select><p className="mt-1 text-xs text-[#5d687d]">切换阵营后需要重新确认双方出场阵容。</p></div>{([1, 2] as const).map((half) => <div key={half}><label className="label" htmlFor={`escapes-${half}-${index}`}>{half === 1 ? "上" : "下"}半场逃脱人数</label><input className="input" id={`escapes-${half}-${index}`} type="number" min={0} max={4} name={`escapes_${half}_${index}`} value={escapes[half]} onChange={(event) => setEscapes((current) => ({ ...current, [half]: event.target.value }))} /></div>)}</div>
      {mapKey && <output className="mt-4 grid gap-2 border-l-4 border-gold bg-parchment p-4 text-sm" aria-live="polite" aria-label={`第 ${index} 局积分预览`}><strong>本局积分预览 · {validScores ? `${scoreA} : ${scoreB}` : "请填写 0–4 的逃脱人数"}</strong><span>{teams.A.name}（A） 对 {teams.B.name}（B） · 保存时仍会校验阵容与完整局数。</span></output>}
      <div className="mt-5 grid gap-4 xl:grid-cols-2"><HalfEditor key={`first-${firstSurvivor}`} round={index} half={1} survivorTeam={teams[firstSurvivor]} hunterTeam={teams[other]} characters={characters} maps={maps} initial={sameSides ? initial?.halves[1] : undefined} /><HalfEditor key={`second-${firstSurvivor}`} round={index} half={2} survivorTeam={teams[other]} hunterTeam={teams[firstSurvivor]} characters={characters} maps={maps} initial={sameSides ? initial?.halves[2] : undefined} /></div>
    </div>
  </details>;
}

export function StructuredMatchResultForm({ matchId, bestOf, maps, teams, characters, initialRounds = [], manualReason = "", manualWinnerSide = "" }: { matchId: string; bestOf: number; maps: Array<{ key: string; name: string }>; teams: { A: TeamOption; B: TeamOption }; characters: CharacterOption[]; initialRounds?: InitialRoundResult[]; manualReason?: string; manualWinnerSide?: "A" | "B" | "" }) {
  const [state, action, pending] = useActionState<OpsState, FormData>(saveMatchResult, {});
  function preparePayload(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const data = new FormData(form);
    for (let round = 1; round <= bestOf; round++) {
      for (const half of [1, 2] as const) {
        const survivors = Array.from({ length: 4 }, (_, slot) => `${data.get(`survivor_${half}_${round}_${slot + 1}`) ?? ""}=${data.get(`survivor_char_${half}_${round}_${slot + 1}`) ?? ""}`).join(",");
        const hunter = `${data.get(`hunter_${half}_${round}`) ?? ""}=${data.get(`hunter_char_${half}_${round}`) ?? ""}`;
        const bp = Array.from({ length: 4 }, (_, slot) => {
          const target = String(data.get(`bp_target_${half}_${round}_${slot + 1}`) ?? "").trim();
          return target ? `${data.get(`bp_scope_${half}_${round}_${slot + 1}`)}:${data.get(`bp_action_${half}_${round}_${slot + 1}`)}:${target}` : "";
        }).filter(Boolean).join(",");
        (form.elements.namedItem(`survivor_lineup_${half}_${round}`) as HTMLInputElement).value = survivors;
        (form.elements.namedItem(`hunter_lineup_${half}_${round}`) as HTMLInputElement).value = hunter;
        (form.elements.namedItem(`bp_${half}_${round}`) as HTMLInputElement).value = bp;
      }
    }
  }
  return <form action={action} ref={preserveFormValues} className="space-y-5" onSubmit={preparePayload}>
    <input type="hidden" name="matchId" value={matchId} />
    {Array.from({ length: bestOf }, (_, offset) => { const round = offset + 1; return <span key={`payload-${round}`}><input type="hidden" name={`survivor_lineup_1_${round}`} /><input type="hidden" name={`hunter_lineup_1_${round}`} /><input type="hidden" name={`survivor_lineup_2_${round}`} /><input type="hidden" name={`hunter_lineup_2_${round}`} /><input type="hidden" name={`bp_1_${round}`} /><input type="hidden" name={`bp_2_${round}`} /></span>; })}
    <Message state={state} />
    <div className="border-l-4 border-plum bg-parchment p-4 text-sm"><strong>先录比分，再核对阵容。</strong> 选择已进行的地图，填写逃脱人数与双方选手；BP 可按需展开。保存为草稿后再确认发布。</div>
    {Array.from({ length: bestOf }, (_, offset) => <RoundEditor index={offset + 1} maps={maps} teams={teams} characters={characters} initial={initialRounds.find((round) => round.index === offset + 1)} key={offset} />)}
    <div className="card grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]"><div><label className="label" htmlFor="manual-winner">同分时的裁定胜方</label><select className="input" id="manual-winner" name="manualWinnerSide" defaultValue={manualWinnerSide}><option value="">由比分自动判定</option><option value="A">{teams.A.name}</option><option value="B">{teams.B.name}</option></select><p className="mt-2 text-xs text-[#675e52]">仅当双方局胜数相同时生效。</p></div><div><label className="label" htmlFor="manual-reason">人工裁定 / 补充说明</label><textarea className="input min-h-24" id="manual-reason" name="manualReason" defaultValue={manualReason} placeholder="同分时必须公开说明裁定结果及依据" /></div></div>
    <div className="result-save-bar"><p className="text-sm text-[#5d687d]">保存草稿后才能发布；校验失败会保留填写内容。</p><button className="button-primary w-full sm:w-auto" disabled={pending} aria-busy={pending}>{pending ? "正在计算与保存…" : initialRounds.length ? "保存结果修订草稿" : "保存结果草稿"}</button></div>
  </form>;
}
