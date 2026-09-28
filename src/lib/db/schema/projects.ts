// @ts-nocheck
import { pgTable, text, timestamp, uuid, integer, jsonb, pgEnum, index, boolean } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { user } from "./users"
import { contacts } from "./contacts"

// Enums
export const projectVisibilityEnum = pgEnum("project_visibility", ["private", "public", "team"])
export const projectStatusEnum = pgEnum("project_status", ["active", "archived", "completed", "on_hold"])
export const cardPriorityEnum = pgEnum("card_priority", ["low", "medium", "high", "urgent"])

// Projects table (similar to boards in kan)
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Identity
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull(),

  // Classification
  visibility: projectVisibilityEnum("visibility").notNull().default("team"),
  status: projectStatusEnum("status").notNull().default("active"),
  color: text("color"),
  icon: text("icon"),

  // Template support
  isTemplate: boolean("is_template").default(false),
  sourceProjectId: uuid("source_project_id"),

  // Dates
  startDate: timestamp("start_date", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // Attribution
  createdById: text("created_by_id").references(() => user.id),
  archivedById: text("archived_by_id").references(() => user.id),

  // Settings
  settings: jsonb("settings").$type<{
    enableDueDates?: boolean
    enableLabels?: boolean
    enableMembers?: boolean
    enableChecklists?: boolean
    enableComments?: boolean
    defaultListColor?: string
  }>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("projects_tenant_idx").on(table.tenantId),
  index("projects_status_idx").on(table.tenantId, table.status),
  index("projects_slug_idx").on(table.tenantId, table.slug),
  index("projects_created_by_idx").on(table.createdById),
])

// Project Lists (columns/stages)
export const projectLists = pgTable("project_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),

  // Identity
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),

  // Position
  position: integer("position").notNull().default(0),

  // Limits
  wipLimit: integer("wip_limit"), // Work in progress limit

  // Settings
  isDoneList: boolean("is_done_list").default(false), // Marks as "completed" column

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("project_lists_project_idx").on(table.projectId),
  index("project_lists_position_idx").on(table.projectId, table.position),
])

// Project Cards (tasks)
export const projectCards = pgTable("project_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  listId: uuid("list_id").notNull().references(() => projectLists.id, { onDelete: "cascade" }),

  // Identity
  title: text("title").notNull(),
  description: text("description"),

  // Position
  position: integer("position").notNull().default(0),

  // Priority & Status
  priority: cardPriorityEnum("priority").default("medium"),

  // Dates
  dueDate: timestamp("due_date", { withTimezone: true }),
  startDate: timestamp("start_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // Time tracking
  estimatedHours: integer("estimated_hours"),
  loggedHours: integer("logged_hours").default(0),

  // External links
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),

  // Attribution
  createdById: text("created_by_id").references(() => user.id),
  completedById: text("completed_by_id").references(() => user.id),

  // Metadata
  customFields: jsonb("custom_fields").$type<Record<string, unknown>>().default({}),

  // Cover image
  coverImageUrl: text("cover_image_url"),
  coverColor: text("cover_color"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  completedAtTimestamp: timestamp("completed_at_timestamp", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("project_cards_project_idx").on(table.projectId),
  index("project_cards_list_idx").on(table.listId),
  index("project_cards_contact_idx").on(table.contactId),
  index("project_cards_due_date_idx").on(table.projectId, table.dueDate),
  index("project_cards_position_idx").on(table.listId, table.position),
])

// Project Labels
export const projectLabels = pgTable("project_labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),

  // Identity
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("project_labels_project_idx").on(table.projectId),
])

// Card to Label mapping (many-to-many)
export const projectCardLabels = pgTable("project_card_labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").notNull().references(() => projectCards.id, { onDelete: "cascade" }),
  labelId: uuid("label_id").notNull().references(() => projectLabels.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("project_card_labels_card_idx").on(table.cardId),
  index("project_card_labels_label_idx").on(table.labelId),
])

// Card Members (many-to-many)
export const projectCardMembers = pgTable("project_card_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").notNull().references(() => projectCards.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("project_card_members_card_idx").on(table.cardId),
  index("project_card_members_user_idx").on(table.userId),
])

// Project Checklists
export const projectChecklists = pgTable("project_checklists", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").notNull().references(() => projectCards.id, { onDelete: "cascade" }),

  // Identity
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("project_checklists_card_idx").on(table.cardId),
])

// Checklist Items
export const projectChecklistItems = pgTable("project_checklist_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  checklistId: uuid("checklist_id").notNull().references(() => projectChecklists.id, { onDelete: "cascade" }),

  // Identity
  text: text("text").notNull(),
  position: integer("position").notNull().default(0),

  // Status
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedById: text("completed_by_id").references(() => user.id),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("project_checklist_items_checklist_idx").on(table.checklistId),
])

// Card Comments
export const projectCardComments = pgTable("project_card_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").notNull().references(() => projectCards.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Content
  content: text("content").notNull(),

  // Attribution
  userId: text("user_id").notNull().references(() => user.id),

  // Parent comment for threading
  parentCommentId: uuid("parent_comment_id").references(() => projectCardComments.id, { onDelete: "cascade" }),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("project_card_comments_card_idx").on(table.cardId),
  index("project_card_comments_tenant_idx").on(table.tenantId),
  index("project_card_comments_user_idx").on(table.userId),
])

// Project Activity Log
export const projectActivity = pgTable("project_activity", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Related entity
  cardId: uuid("card_id").references(() => projectCards.id, { onDelete: "set null" }),
  listId: uuid("list_id").references(() => projectLists.id, { onDelete: "set null" }),

  // Activity details
  type: text("type").notNull(), // e.g., "card.created", "card.moved", "member.added"
  description: text("description"),

  // Change tracking
  previousValue: jsonb("previous_value").$type<unknown>(),
  newValue: jsonb("new_value").$type<unknown>(),

  // Attribution
  userId: text("user_id").references(() => user.id),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("project_activity_project_idx").on(table.projectId),
  index("project_activity_tenant_idx").on(table.tenantId),
  index("project_activity_card_idx").on(table.cardId),
  index("project_activity_created_at_idx").on(table.createdAt),
])

// Project Members (for access control)
export const projectMembers = pgTable("project_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),

  // Role
  role: text("role").notNull().default("member"), // "admin", "member", "viewer"

  // Audit
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  invitedById: text("invited_by_id").references(() => user.id),
}, (table) => [
  index("project_members_project_idx").on(table.projectId),
  index("project_members_user_idx").on(table.userId),
])

// Relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [projects.tenantId],
    references: [tenants.id],
  }),
  createdBy: one(user, {
    fields: [projects.createdById],
    references: [user.id],
    relationName: "projectCreatedBy",
  }),
  archivedBy: one(user, {
    fields: [projects.archivedById],
    references: [user.id],
    relationName: "projectArchivedBy",
  }),
  lists: many(projectLists),
  cards: many(projectCards),
  labels: many(projectLabels),
  members: many(projectMembers),
  activity: many(projectActivity),
}))

export const projectListsRelations = relations(projectLists, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectLists.projectId],
    references: [projects.id],
  }),
  cards: many(projectCards),
}))

export const projectCardsRelations = relations(projectCards, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectCards.projectId],
    references: [projects.id],
  }),
  list: one(projectLists, {
    fields: [projectCards.listId],
    references: [projectLists.id],
  }),
  contact: one(contacts, {
    fields: [projectCards.contactId],
    references: [contacts.id],
  }),
  createdBy: one(user, {
    fields: [projectCards.createdById],
    references: [user.id],
    relationName: "cardCreatedBy",
  }),
  completedBy: one(user, {
    fields: [projectCards.completedById],
    references: [user.id],
    relationName: "cardCompletedBy",
  }),
  labels: many(projectCardLabels),
  members: many(projectCardMembers),
  checklists: many(projectChecklists),
  comments: many(projectCardComments),
}))

export const projectLabelsRelations = relations(projectLabels, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectLabels.projectId],
    references: [projects.id],
  }),
  cardLabels: many(projectCardLabels),
}))

export const projectCardLabelsRelations = relations(projectCardLabels, ({ one }) => ({
  card: one(projectCards, {
    fields: [projectCardLabels.cardId],
    references: [projectCards.id],
  }),
  label: one(projectLabels, {
    fields: [projectCardLabels.labelId],
    references: [projectLabels.id],
  }),
}))

export const projectCardMembersRelations = relations(projectCardMembers, ({ one }) => ({
  card: one(projectCards, {
    fields: [projectCardMembers.cardId],
    references: [projectCards.id],
  }),
  user: one(user, {
    fields: [projectCardMembers.userId],
    references: [user.id],
  }),
}))

export const projectChecklistsRelations = relations(projectChecklists, ({ one, many }) => ({
  card: one(projectCards, {
    fields: [projectChecklists.cardId],
    references: [projectCards.id],
  }),
  items: many(projectChecklistItems),
}))

export const projectChecklistItemsRelations = relations(projectChecklistItems, ({ one }) => ({
  checklist: one(projectChecklists, {
    fields: [projectChecklistItems.checklistId],
    references: [projectChecklists.id],
  }),
  completedBy: one(user, {
    fields: [projectChecklistItems.completedById],
    references: [user.id],
  }),
}))

export const projectCardCommentsRelations = relations(projectCardComments, ({ one, many }) => ({
  card: one(projectCards, {
    fields: [projectCardComments.cardId],
    references: [projectCards.id],
  }),
  user: one(user, {
    fields: [projectCardComments.userId],
    references: [user.id],
  }),
  parent: one(projectCardComments, {
    fields: [projectCardComments.parentCommentId],
    references: [projectCardComments.id],
    relationName: "commentReplies",
  }),
  replies: many(projectCardComments, { relationName: "commentReplies" }),
}))

export const projectActivityRelations = relations(projectActivity, ({ one }) => ({
  project: one(projects, {
    fields: [projectActivity.projectId],
    references: [projects.id],
  }),
  card: one(projectCards, {
    fields: [projectActivity.cardId],
    references: [projectCards.id],
  }),
  list: one(projectLists, {
    fields: [projectActivity.listId],
    references: [projectLists.id],
  }),
  user: one(user, {
    fields: [projectActivity.userId],
    references: [user.id],
  }),
}))

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(user, {
    fields: [projectMembers.userId],
    references: [user.id],
  }),
  invitedBy: one(user, {
    fields: [projectMembers.invitedById],
    references: [user.id],
    relationName: "projectMemberInvitedBy",
  }),
}))

// Types
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ProjectList = typeof projectLists.$inferSelect
export type NewProjectList = typeof projectLists.$inferInsert
export type ProjectCard = typeof projectCards.$inferSelect
export type NewProjectCard = typeof projectCards.$inferInsert
export type ProjectLabel = typeof projectLabels.$inferSelect
export type NewProjectLabel = typeof projectLabels.$inferInsert
export type ProjectCardLabel = typeof projectCardLabels.$inferSelect
export type ProjectCardMember = typeof projectCardMembers.$inferSelect
export type ProjectChecklist = typeof projectChecklists.$inferSelect
export type NewProjectChecklist = typeof projectChecklists.$inferInsert
export type ProjectChecklistItem = typeof projectChecklistItems.$inferSelect
export type NewProjectChecklistItem = typeof projectChecklistItems.$inferInsert
export type ProjectCardComment = typeof projectCardComments.$inferSelect
export type NewProjectCardComment = typeof projectCardComments.$inferInsert
export type ProjectActivity = typeof projectActivity.$inferSelect
export type ProjectMember = typeof projectMembers.$inferSelect