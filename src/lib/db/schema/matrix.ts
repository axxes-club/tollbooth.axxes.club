import { pgTable, text, timestamp, uuid, boolean, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./users"
import { tenants } from "./tenants"

// Matrix user accounts - links our users to Matrix accounts
export const matrixAccounts = pgTable("matrix_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  
  // Matrix identity
  matrixUserId: text("matrix_user_id").notNull().unique(), // @user:matrix.org
  homeserver: text("homeserver").notNull().default("matrix.org"),
  
  // Encrypted credentials (access token stored encrypted)
  accessToken: text("access_token").notNull(), // Encrypted
  deviceId: text("device_id"),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("matrix_accounts_user_idx").on(table.userId),
  index("matrix_accounts_matrix_user_idx").on(table.matrixUserId),
])

// Matrix Spaces for tenants (like Slack workspaces)
export const matrixSpaces = pgTable("matrix_spaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Matrix room info
  roomId: text("room_id").notNull().unique(), // !space:matrix.org
  
  // Settings
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("matrix_spaces_tenant_idx").on(table.tenantId),
  index("matrix_spaces_room_idx").on(table.roomId),
])

// Matrix rooms (channels and DMs)
export const matrixRooms = pgTable("matrix_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  spaceId: uuid("space_id").references(() => matrixSpaces.id, { onDelete: "cascade" }),
  
  // Matrix room info
  roomId: text("room_id").notNull().unique(), // !room:matrix.org
  
  // Room metadata
  type: text("type").notNull().default("channel"), // 'channel', 'dm', 'thread'
  name: text("name"),
  topic: text("topic"),
  avatarUrl: text("avatar_url"),
  
  // Settings
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(false),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("matrix_rooms_tenant_idx").on(table.tenantId),
  index("matrix_rooms_space_idx").on(table.spaceId),
  index("matrix_rooms_room_idx").on(table.roomId),
  index("matrix_rooms_type_idx").on(table.type),
])

// Room membership for users
export const matrixRoomMembers = pgTable("matrix_room_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => matrixRooms.id, { onDelete: "cascade" }),
  matrixAccountId: uuid("matrix_account_id").notNull().references(() => matrixAccounts.id, { onDelete: "cascade" }),
  
  // Membership state
  membership: text("membership").notNull().default("join"), // 'join', 'invite', 'leave', 'ban'
  
  // User preferences
  isMuted: boolean("is_muted").notNull().default(false),
  notificationMode: text("notification_mode").notNull().default("all"), // 'all', 'mentions', 'none'
  
  // Audit
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("matrix_room_members_room_idx").on(table.roomId),
  index("matrix_room_members_account_idx").on(table.matrixAccountId),
])

// Relations
export const matrixAccountsRelations = relations(matrixAccounts, ({ one, many }) => ({
  user: one(user, {
    fields: [matrixAccounts.userId],
    references: [user.id],
  }),
  roomMemberships: many(matrixRoomMembers),
}))

export const matrixSpacesRelations = relations(matrixSpaces, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [matrixSpaces.tenantId],
    references: [tenants.id],
  }),
  rooms: many(matrixRooms),
}))

export const matrixRoomsRelations = relations(matrixRooms, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [matrixRooms.tenantId],
    references: [tenants.id],
  }),
  space: one(matrixSpaces, {
    fields: [matrixRooms.spaceId],
    references: [matrixSpaces.id],
  }),
  members: many(matrixRoomMembers),
}))

export const matrixRoomMembersRelations = relations(matrixRoomMembers, ({ one }) => ({
  room: one(matrixRooms, {
    fields: [matrixRoomMembers.roomId],
    references: [matrixRooms.id],
  }),
  matrixAccount: one(matrixAccounts, {
    fields: [matrixRoomMembers.matrixAccountId],
    references: [matrixAccounts.id],
  }),
}))

// Types
export type MatrixAccount = typeof matrixAccounts.$inferSelect
export type NewMatrixAccount = typeof matrixAccounts.$inferInsert
export type MatrixSpace = typeof matrixSpaces.$inferSelect
export type NewMatrixSpace = typeof matrixSpaces.$inferInsert
export type MatrixRoom = typeof matrixRooms.$inferSelect
export type NewMatrixRoom = typeof matrixRooms.$inferInsert
export type MatrixRoomMember = typeof matrixRoomMembers.$inferSelect
export type NewMatrixRoomMember = typeof matrixRoomMembers.$inferInsert