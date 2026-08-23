export const ROLE_LABELS = {
  PLAYER: "选手", COMMENTATOR: "解说", REFEREE: "裁判", EVENT_MANAGER: "赛事管理员"
} as const;

export const STATUS_LABELS = {
  DRAFT: "草稿", REGISTRATION: "报名中", ACTIVE: "进行中", COMPLETED: "已结束", ARCHIVED: "已归档",
  PENDING: "待审核", APPROVED: "已通过", REJECTED: "已拒绝", WITHDRAWN: "已撤回",
  SCHEDULED: "已排期", IN_PROGRESS: "进行中", RESULT_DRAFT: "结果待发布", PUBLISHED: "已发布"
} as const;

export const STAGE_LABELS = { ROUND_ROBIN: "小组循环", SINGLE_ELIMINATION: "单败淘汰", MANUAL: "手动赛程" } as const;
export const EVENT_MODE_LABELS = { PLAYER_TEAMS: "玩家自由组队", ADMIN_TEAMS: "管理员统一编队", INDIVIDUAL: "个人报名与排赛" } as const;

export const PROFILE_FIELD_LABELS: Record<string, string> = {
  gameNickname: "游戏昵称",
  gameUid: "游戏 UID",
  survivorRank: "求生者最高段位",
  hunterRank: "监管者最高段位",
  rankScreenshotAssetId: "证明截图档案",
  specialty: "阵营专长",
  experience: "相关经历",
  portfolioUrl: "作品链接",
  availability: "可用时间"
};

export const ESCAPE_POINTS: Record<number, [number, number]> = { 0: [0, 5], 1: [1, 3], 2: [2, 2], 3: [3, 1], 4: [5, 0] };
