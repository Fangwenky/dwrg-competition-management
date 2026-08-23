import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const globalRole = pgEnum("global_role", ["USER", "ADMIN"]);
export const eventRole = pgEnum("event_role", ["PLAYER", "COMMENTATOR", "REFEREE", "EVENT_MANAGER"]);
export const reviewStatus = pgEnum("review_status", ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]);
export const eventStatus = pgEnum("event_status", ["DRAFT", "REGISTRATION", "ACTIVE", "COMPLETED", "ARCHIVED"]);
export const stageType = pgEnum("stage_type", ["ROUND_ROBIN", "SINGLE_ELIMINATION", "MANUAL"]);
export const stageStatus = pgEnum("stage_status", ["DRAFT", "ACTIVE", "COMPLETED"]);
export const matchStatus = pgEnum("match_status", ["DRAFT", "SCHEDULED", "IN_PROGRESS", "RESULT_DRAFT", "PUBLISHED"]);
export const eventMode = pgEnum("event_mode", ["PLAYER_TEAMS", "ADMIN_TEAMS", "INDIVIDUAL"]);
export const teamMemberRole = pgEnum("team_member_role", ["CAPTAIN", "VICE_CAPTAIN", "MEMBER"]);
export const matchParticipantSide = pgEnum("match_participant_side", ["A", "B"]);
export const assignmentRole = pgEnum("assignment_role", ["REFEREE", "COMMENTATOR"]);
export const faction = pgEnum("faction", ["SURVIVOR", "HUNTER", "FLEX"]);
export const bpScope = pgEnum("bp_scope", ["MAP", "FACTION", "CHARACTER"]);
export const bpAction = pgEnum("bp_action", ["BAN", "PICK"]);
export const mediaPurpose = pgEnum("media_purpose", ["EVENT_HERO", "TEAM_LOGO", "PLAYER_AVATAR", "RANK_SCREENSHOT"]);

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  purpose: mediaPurpose("purpose").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  uploadedBy: uuid("uploaded_by").notNull(),
  mimeType: text("mime_type").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes").notNull(),
  creditText: text("credit_text"),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("media_assets_uploader_idx").on(t.uploadedBy)]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: globalRole("role").notNull().default("USER"),
  disabled: boolean("disabled").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  avatarAssetId: uuid("avatar_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  gameUid: text("game_uid").unique(),
  gameNickname: text("game_nickname").notNull().default(""),
  survivorRank: text("survivor_rank").notNull().default(""),
  hunterRank: text("hunter_rank").notNull().default(""),
  rankScreenshotAssetId: uuid("rank_screenshot_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expiry_idx").on(t.expiresAt)]);

export const loginRateLimits = pgTable("login_rate_limits", {
  keyHash: text("key_hash").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("login_rate_limits_updated_idx").on(t.updatedAt)]);

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  description: text("description").notNull().default(""),
  status: eventStatus("status").notNull().default("DRAFT"),
  mode: eventMode("mode").notNull().default("PLAYER_TEAMS"),
  registrationStart: timestamp("registration_start", { withTimezone: true }),
  registrationEnd: timestamp("registration_end", { withTimezone: true }),
  eventStart: timestamp("event_start", { withTimezone: true }),
  eventEnd: timestamp("event_end", { withTimezone: true }),
  minRoster: integer("min_roster").notNull().default(5),
  maxRoster: integer("max_roster").notNull().default(7),
  defaultBestOf: integer("default_best_of").notNull().default(3),
  rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default({}),
  heroAssetId: uuid("hero_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  heroFocalX: integer("hero_focal_x").notNull().default(50),
  heroFocalY: integer("hero_focal_y").notNull().default(50),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const eventRoleApplications = pgTable("event_role_applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: eventRole("role").notNull(),
  status: reviewStatus("status").notNull().default("PENDING"),
  profile: jsonb("profile").$type<Record<string, string>>().notNull().default({}),
  reviewReason: text("review_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique("event_user_role_application_unique").on(t.eventId, t.userId, t.role), index("applications_event_status_idx").on(t.eventId, t.status)]);

export const eventRoleGrants = pgTable("event_role_grants", {
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: eventRole("role").notNull(),
  grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.eventId, t.userId, t.role] }), index("event_grants_user_idx").on(t.userId)]);

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull(),
  slogan: text("slogan").notNull().default(""),
  description: text("description").notNull().default(""),
  logoAssetId: uuid("logo_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  captainId: uuid("captain_id").notNull().references(() => users.id),
  createdByAdmin: boolean("created_by_admin").notNull().default(false),
  status: reviewStatus("status").notNull().default("PENDING"),
  locked: boolean("locked").notNull().default(false),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique("event_team_name_unique").on(t.eventId, t.name), unique("event_team_abbr_unique").on(t.eventId, t.abbreviation)]);

export const teamMembers = pgTable("team_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: teamMemberRole("role").notNull().default("MEMBER"),
  specialty: faction("specialty").notNull().default("FLEX"),
  gameNickname: text("game_nickname").notNull().default(""),
  publicBio: text("public_bio").notNull().default(""),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique("event_member_unique").on(t.eventId, t.userId), unique("team_user_unique").on(t.teamId, t.userId), index("team_members_team_idx").on(t.teamId)]);

export const teamInvites = pgTable("team_invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  invitedUserId: uuid("invited_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  status: reviewStatus("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique("team_invitee_unique").on(t.teamId, t.invitedUserId)]);

export const teamJoinRequests = pgTable("team_join_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: reviewStatus("status").notNull().default("PENDING"),
  message: text("message").notNull().default(""),
  reviewReason: text("review_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  unique("team_join_request_user_unique").on(t.teamId, t.userId),
  index("team_join_requests_team_status_idx").on(t.teamId, t.status),
  index("team_join_requests_user_status_idx").on(t.userId, t.status)
]);

export const stages = pgTable("stages", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: stageType("type").notNull(),
  status: stageStatus("status").notNull().default("DRAFT"),
  orderIndex: integer("order_index").notNull(),
  advanceCount: integer("advance_count").notNull().default(1),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique("event_stage_order_unique").on(t.eventId, t.orderIndex)]);

export const matches = pgTable("matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").references(() => stages.id, { onDelete: "set null" }),
  roundLabel: text("round_label").notNull().default(""),
  bracketRound: integer("bracket_round"),
  bracketIndex: integer("bracket_index").notNull().default(0),
  teamAId: uuid("team_a_id").references(() => teams.id, { onDelete: "set null" }),
  teamBId: uuid("team_b_id").references(() => teams.id, { onDelete: "set null" }),
  sideALabel: text("side_a_label").notNull().default(""),
  sideBLabel: text("side_b_label").notNull().default(""),
  bestOf: integer("best_of").notNull().default(3),
  status: matchStatus("status").notNull().default("DRAFT"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  scoreA: integer("score_a").notNull().default(0),
  scoreB: integer("score_b").notNull().default(0),
  winnerTeamId: uuid("winner_team_id").references(() => teams.id, { onDelete: "set null" }),
  winnerSide: matchParticipantSide("winner_side"),
  manualReason: text("manual_reason"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("matches_event_status_idx").on(t.eventId, t.status), index("matches_stage_idx").on(t.stageId)]);

export const matchParticipants = pgTable("match_participants", {
  matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  side: matchParticipantSide("side").notNull(),
  slotIndex: integer("slot_index").notNull().default(0)
}, (t) => [primaryKey({ columns: [t.matchId, t.userId] }), index("match_participants_match_side_idx").on(t.matchId, t.side), index("match_participants_event_user_idx").on(t.eventId, t.userId)]);

export const matchAssignments = pgTable("match_assignments", {
  matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: assignmentRole("role").notNull(),
  assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.matchId, t.userId, t.role] })]);

export const gameRounds = pgTable("game_rounds", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  roundIndex: integer("round_index").notNull(),
  mapKey: text("map_key").notNull(),
  scoreA: integer("score_a").notNull().default(0),
  scoreB: integer("score_b").notNull().default(0),
  winnerTeamId: uuid("winner_team_id").references(() => teams.id, { onDelete: "set null" }),
  winnerSide: matchParticipantSide("winner_side"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique("match_round_unique").on(t.matchId, t.roundIndex)]);

export const halfResults = pgTable("half_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  roundId: uuid("round_id").notNull().references(() => gameRounds.id, { onDelete: "cascade" }),
  halfIndex: integer("half_index").notNull(),
  survivorTeamId: uuid("survivor_team_id").references(() => teams.id),
  hunterTeamId: uuid("hunter_team_id").references(() => teams.id),
  survivorSide: matchParticipantSide("survivor_side"),
  hunterSide: matchParticipantSide("hunter_side"),
  escapes: integer("escapes").notNull(),
  survivorPoints: integer("survivor_points").notNull(),
  hunterPoints: integer("hunter_points").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique("round_half_unique").on(t.roundId, t.halfIndex)]);

export const bpEntries = pgTable("bp_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  roundId: uuid("round_id").notNull().references(() => gameRounds.id, { onDelete: "cascade" }),
  halfIndex: integer("half_index").notNull(),
  orderIndex: integer("order_index").notNull(),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  scope: bpScope("scope").notNull(),
  action: bpAction("action").notNull(),
  targetKey: text("target_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique("round_half_bp_order_unique").on(t.roundId, t.halfIndex, t.orderIndex)]);

export const appearances = pgTable("appearances", {
  id: uuid("id").defaultRandom().primaryKey(),
  halfId: uuid("half_id").notNull().references(() => halfResults.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
  side: matchParticipantSide("side"),
  userId: uuid("user_id").notNull().references(() => users.id),
  faction: faction("faction").notNull(),
  characterKey: text("character_key").notNull(),
  isStarter: boolean("is_starter").notNull().default(true)
}, (t) => [unique("half_user_unique").on(t.halfId, t.userId)]);

export const gameMaps = pgTable("game_maps", {
  key: text("key").primaryKey(), name: text("name").notNull(), enabled: boolean("enabled").notNull().default(true), orderIndex: integer("order_index").notNull().default(0)
});

export const gameCharacters = pgTable("game_characters", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  faction: faction("faction").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  orderIndex: integer("order_index").notNull().default(0),
  wikiPageId: integer("wiki_page_id").unique(),
  wikiRevisionId: integer("wiki_revision_id"),
  posterPath: text("poster_path"),
  sourceUrl: text("source_url"),
  sourceImageUrl: text("source_image_url"),
  sourceImagePageUrl: text("source_image_page_url"),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true })
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(), body: text("body").notNull(), href: text("href"), read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("notifications_user_read_idx").on(t.userId, t.read)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("audit_event_created_idx").on(t.eventId, t.createdAt)]);

export const eventRelations = relations(events, ({ many }) => ({ applications: many(eventRoleApplications), grants: many(eventRoleGrants), teams: many(teams), stages: many(stages), matches: many(matches) }));
export const teamRelations = relations(teams, ({ one, many }) => ({ event: one(events, { fields: [teams.eventId], references: [events.id] }), members: many(teamMembers), joinRequests: many(teamJoinRequests) }));
export const matchRelations = relations(matches, ({ one, many }) => ({ stage: one(stages, { fields: [matches.stageId], references: [stages.id] }), rounds: many(gameRounds), assignments: many(matchAssignments) }));

export type User = typeof users.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Match = typeof matches.$inferSelect;

export const now = sql`now()`;
