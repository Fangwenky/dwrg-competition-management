export const RANKS = [
  "一阶",
  "二阶",
  "三阶",
  "四阶",
  "五阶",
  "六阶",
  "七阶",
  "巅峰七阶"
] as const;

export const SURVIVOR_RANKS = RANKS;
export const HUNTER_RANKS = RANKS;

export function isValidRank(faction: "SURVIVOR" | "HUNTER", value: string) {
  return (faction === "SURVIVOR" ? SURVIVOR_RANKS : HUNTER_RANKS).some((rank) => rank === value);
}

export const RANK_SOURCE_URL = "https://wiki.biligame.com/dwrg/%E6%8E%92%E4%BD%8D%E6%A8%A1%E5%BC%8F";
