import { pgTable, text, integer, timestamp, uuid, jsonb } from "drizzle-orm/pg-core"

export const participants = pgTable("participants", {
  id: text("id").primaryKey(),        // e.g. "P001" — given by researcher
  createdAt: timestamp("created_at").defaultNow(),
  memory: text("memory"),             // AI-generated summary of past sessions
  alias: text("alias").notNull().default(""),
})

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantId: text("participant_id").references(() => participants.id),
  alias: text("alias").notNull(),     // chosen by participant at login
  sycophancyScore: integer("sycophancy_score").default(5),
  loginAt: timestamp("login_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  // Prolific-specific metadata (null for standalone logins)
  prolificStudyId: text("prolific_study_id"),
  prolificSessionId: text("prolific_session_id"),
})

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantId: text("participant_id").references(() => participants.id),
  title: text("title").notNull().default("New conversation"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  thinking: text("thinking"),
  sycophancyScore: integer("sycophancy_score"),
  createdAt: timestamp("created_at").defaultNow(),
})

export const mentalModels = pgTable("mental_models", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  turnIndex: integer("turn_index").notNull(),
  inductData: jsonb("induct_data"),
  typesSupportData: jsonb("types_support_data"),
  inductUserData: jsonb("induct_user_data"),
  typesSupportUserData: jsonb("types_support_user_data"),
  inductUserReasons: jsonb("induct_user_reasons"),
  typesSupportUserReasons: jsonb("types_support_user_reasons"),
  inductUserReactions: jsonb("induct_user_reactions"),     // per-dim "up" | "down"
  typesSupportUserReactions: jsonb("types_support_user_reactions"),
  createdAt: timestamp("created_at").defaultNow(),
})

export const highlights = pgTable("highlights", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  participantId: text("participant_id").references(() => participants.id),
  messageIndex: integer("message_index").notNull(),  // index in full messages array
  selectedText: text("selected_text").notNull(),
  reaction: text("reaction"),                        // "up" | "down" | null
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
})

export const feedbackRatings = pgTable("feedback_ratings", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantId: text("participant_id").references(() => participants.id),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  feelingScore: integer("feeling_score"),
  helpfulnessScore: integer("helpfulness_score"),
  createdAt: timestamp("created_at").defaultNow(),
})

export const mentorRequests = pgTable("mentor_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantId: text("participant_id").references(() => participants.id),
  content: text("content").notNull(),
  editorSnapshot: text("editor_snapshot"),
  resolved: integer("resolved").default(0),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
})