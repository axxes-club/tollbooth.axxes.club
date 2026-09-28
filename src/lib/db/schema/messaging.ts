import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { user } from "./users"

// Enums
export const conversationTypeEnum = pgEnum("conversation_type", [
  "direct",
  "group",
])
export const messageStatusEnum = pgEnum("message_status", [
  "sent",
  "delivered",
  "read",
])

// Conversations table
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    // Conversation Details
    type: conversationTypeEnum("type").notNull().default("direct"),
    name: text("name"), // Only for group conversations
    description: text("description"),
    avatarUrl: text("avatar_url"),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Last Activity (for sorting)
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),

    // Attribution
    createdById: text("created_by_id").notNull(),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("conversations_tenant_idx").on(table.tenantId),
    index("conversations_type_idx").on(table.tenantId, table.type),
    index("conversations_last_message_idx").on(
      table.tenantId,
      table.lastMessageAt
    ),
  ]
)

// Conversation Participants
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),

    // Read Status
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    lastReadMessageId: uuid("last_read_message_id"),

    // Unread Count (denormalized for performance)
    unreadCount: integer("unread_count").default(0).notNull(),

    // Preferences
    isMuted: boolean("is_muted").default(false),
    isPinned: boolean("is_pinned").default(false),

    // Role (for group chats)
    isAdmin: boolean("is_admin").default(false),

    // Audit
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("participants_conversation_idx").on(table.conversationId),
    index("participants_user_idx").on(table.userId),
    uniqueIndex("participants_unique_idx").on(table.conversationId, table.userId),
    index("participants_unread_idx").on(table.userId, table.unreadCount),
  ]
)

// Messages table
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    // Message Content
    content: text("content").notNull(),
    contentType: text("content_type").default("text"), // text, image, file, etc.

    // Attachments
    attachments: jsonb("attachments").$type<MessageAttachment[]>().default([]),

    // Reply/Thread
    replyToId: uuid("reply_to_id"),

    // Status
    status: messageStatusEnum("status").default("sent"),

    // Attribution
    senderId: text("sender_id").notNull(),

    // Edit History
    isEdited: boolean("is_edited").default(false),
    editedAt: timestamp("edited_at", { withTimezone: true }),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId),
    index("messages_tenant_idx").on(table.tenantId),
    index("messages_sender_idx").on(table.senderId),
    index("messages_created_idx").on(table.conversationId, table.createdAt),
  ]
)

// Relations
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [conversations.tenantId],
    references: [tenants.id],
  }),
  createdBy: one(user, {
    fields: [conversations.createdById],
    references: [user.id],
  }),
  participants: many(conversationParticipants),
  messages: many(messages),
}))

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(user, {
      fields: [conversationParticipants.userId],
      references: [user.id],
    }),
  })
)

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  tenant: one(tenants, {
    fields: [messages.tenantId],
    references: [tenants.id],
  }),
  sender: one(user, {
    fields: [messages.senderId],
    references: [user.id],
  }),
  replyTo: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
  }),
}))

// Types
export interface MessageAttachment {
  id: string
  type: "image" | "file" | "video"
  url: string
  name: string
  size: number
  mimeType: string
}

export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type ConversationParticipant = typeof conversationParticipants.$inferSelect
export type NewConversationParticipant = typeof conversationParticipants.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
