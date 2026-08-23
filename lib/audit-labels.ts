const ACTION_LABELS: Record<string, string> = {
  USER_REGISTERED: "注册账号",
  PASSWORD_CHANGED: "修改密码",
  OTHER_SESSIONS_REVOKED: "退出其他登录会话",
  USER_DISABLED: "停用账号",
  USER_ENABLED: "恢复账号",
  USER_GLOBAL_ROLE_CHANGED: "变更全局管理员权限",
  USER_SESSIONS_REVOKED: "注销账号会话",
  USER_PASSWORD_RESET: "重置账号密码",
  USER_PROFILE_CORRECTED: "管理员修正用户资料",
  ROLE_APPLICATION_SUBMITTED: "提交身份申请",
  ROLE_APPLICATION_WITHDRAWN: "撤销身份申请",
  ROLE_APPLICATION_APPROVED: "通过身份申请",
  ROLE_APPLICATION_REJECTED: "拒绝身份申请",
  EVENT_ROLE_REVOKED: "撤销赛事身份",
  EVENT_ROLE_RELINQUISHED: "用户主动退出赛事身份",
  EVENT_CREATED: "创建赛事",
  EVENT_SETTINGS_UPDATED: "更新赛事设置",
  EVENT_ARCHIVED: "归档赛事",
  EVENT_RESTORED: "恢复已归档赛事",
  EVENT_HERO_UPDATED: "更新赛事封面",
  EVENT_MANAGER_GRANTED: "授予赛事管理员",
  EVENT_MANAGER_REVOKED: "取消赛事管理员",
  TEAM_CREATION_APPLIED: "申请创建战队",
  TEAM_CREATED: "创建战队",
  TEAM_APPLICATION_WITHDRAWN: "撤销建队申请",
  TEAM_APPLICATION_RESUBMITTED: "重新提交建队申请",
  TEAM_CREATED_BY_MANAGER: "赛事方创建战队",
  TEAM_APPROVED: "通过战队审核",
  TEAM_REJECTED: "拒绝战队审核",
  TEAM_PROFILE_UPDATED: "更新战队资料",
  TEAM_JOIN_REQUESTED: "申请加入战队",
  TEAM_JOIN_REQUEST_WITHDRAWN: "撤销入队申请",
  TEAM_JOIN_REQUEST_APPROVED: "通过入队申请",
  TEAM_JOIN_REQUEST_REJECTED: "拒绝入队申请",
  TEAM_INVITE_ACCEPTED: "接受战队邀请",
  TEAM_INVITE_REJECTED: "拒绝战队邀请",
  TEAM_INVITE_WITHDRAWN: "撤销战队邀请",
  TEAM_MEMBER_ADDED_BY_MANAGER: "赛事方添加战队成员",
  TEAM_MEMBER_REMOVED_BY_MANAGER: "赛事方移出战队成员",
  TEAM_MEMBER_LEFT: "成员退出战队",
  TEAM_VICE_CAPTAIN_SET: "设置副队长",
  TEAM_VICE_CAPTAIN_REMOVED: "取消副队长",
  TEAM_CAPTAIN_TRANSFERRED: "转移队长",
  TEAM_DISSOLVED_BY_CAPTAIN: "队长解散战队",
  TEAM_DISSOLVED_BY_MANAGER: "赛事方解散战队",
  TEAM_ROSTER_LOCKED: "锁定战队名单",
  TEAM_ROSTER_UNLOCKED: "解锁战队名单",
  STAGE_CREATED: "创建赛事阶段",
  STAGE_UPDATED: "修改赛事阶段",
  STAGE_DELETED: "删除赛事阶段",
  STAGE_REOPENED: "重新开启赛事阶段",
  STAGE_MATCHES_GENERATED: "生成阶段赛程",
  MANUAL_MATCH_CREATED: "创建手动战队比赛",
  INDIVIDUAL_MATCH_CREATED: "创建个人编组比赛",
  MATCH_STAFF_ASSIGNED: "指派比赛工作人员",
  MATCH_STAFF_UNASSIGNED: "取消工作人员指派",
  MATCH_STAFF_DECLINED: "工作人员谢绝指派",
  MATCH_SCHEDULE_UPDATED: "调整比赛排期",
  MATCH_SCHEDULE_CANCELLED: "撤销比赛",
  MATCH_RESULT_SAVED: "保存比赛结果草稿",
  MATCH_RESULT_REVISION_SAVED: "保存已发布结果修订",
  MATCH_RESULT_DRAFT_DISCARDED: "放弃比赛结果草稿",
  MATCH_RESULT_PUBLISHED: "发布比赛结果",
  GAME_CHARACTER_ENABLED: "启用角色目录项",
  GAME_CHARACTER_DISABLED: "停用角色目录项",
  PLAYER_AVATAR_UPDATED: "更新用户头像",
  PLAYER_AVATAR_REMOVED: "移除用户头像",
  MEMBER_PUBLIC_PROFILE_UPDATED: "更新选手公开档案",
  PLAYER_PROFILE_UPDATED: "更新竞技资料",
  TEAM_LOGO_UPDATED: "更新战队队徽",
  TEAM_LOGO_REMOVED: "移除战队队徽",
  EVENT_HERO_REMOVED: "移除赛事封面",
  RANK_SCREENSHOT_UPDATED: "更新段位证明"
};

const ENTITY_LABELS: Record<string, string> = {
  user: "用户",
  role_application: "身份申请",
  event: "赛事",
  team: "战队",
  team_invite: "战队邀请",
  team_join_request: "入队申请",
  stage: "赛事阶段",
  match: "比赛",
  game_character: "角色目录"
};

const DETAIL_LABELS: Record<string, string> = {
  reason: "原因",
  role: "身份",
  count: "数量",
  from: "原权限",
  to: "新权限",
  previousStatus: "原状态",
  status: "新状态",
  roundLabel: "比赛名称",
  previousRoundLabel: "原比赛名称",
  scheduledAt: "新开赛时间",
  previousScheduledAt: "原开赛时间",
  bestOf: "新赛制",
  previousBestOf: "原赛制",
  name: "名称",
  type: "类型",
  winsA: "A 方局胜",
  winsB: "B 方局胜",
  totalA: "A 方积分",
  totalB: "B 方积分"
};

const VALUE_LABELS: Record<string, string> = {
  PLAYER: "选手",
  COMMENTATOR: "解说",
  REFEREE: "裁判",
  EVENT_MANAGER: "赛事管理员",
  USER: "注册用户",
  ADMIN: "全局管理员",
  DRAFT: "草稿",
  REGISTRATION: "报名中",
  ACTIVE: "进行中",
  COMPLETED: "已结束",
  ARCHIVED: "已归档",
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  WITHDRAWN: "已撤回",
  SCHEDULED: "已排期",
  IN_PROGRESS: "进行中",
  RESULT_DRAFT: "结果待发布",
  PUBLISHED: "已发布",
  ROUND_ROBIN: "小组循环",
  SINGLE_ELIMINATION: "单败淘汰",
  MANUAL: "手动赛程"
};

export function auditActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

export function auditEntityLabel(entity: string) {
  return ENTITY_LABELS[entity] ?? entity;
}

export function auditDetailEntries(detail: Record<string, unknown>) {
  return Object.entries(detail).map(([key, value]) => {
    let display = "—";
    if (typeof value === "string") display = VALUE_LABELS[value] ?? (/^[0-9a-f-]{20,}$/i.test(value) ? value.slice(0, 8) : value);
    else if (typeof value === "number" || typeof value === "boolean") display = String(value);
    else if (Array.isArray(value)) display = `${value.length} 项`;
    else if (value != null) display = JSON.stringify(value);
    return { label: DETAIL_LABELS[key] ?? key, value: display };
  });
}
