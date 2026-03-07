import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core"

export const participants = pgTable("participants", {
  id: text("id").primaryKey(),        // e.g. "P001" — given by researcher
  createdAt: timestamp("created_at").defaultNow(),
  memory: text("memory"),             // AI-generated summary of past sessions
})

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantId: text("participant_id").references(() => participants.id),
  alias: text("alias").notNull(),     // chosen by participant at login
  sycophancyScore: integer("sycophancy_score").default(5),
  loginAt: timestamp("login_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
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

export const feedbackRatings = pgTable("feedback_ratings", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantId: text("participant_id").references(() => participants.id),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  feelingScore: integer("feeling_score"),
  helpfulnessScore: integer("helpfulness_score"),
  createdAt: timestamp("created_at").defaultNow(),
})