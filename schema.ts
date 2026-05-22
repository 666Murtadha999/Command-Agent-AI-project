import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Schema for the AI Command Agent.
 * All timestamps are stored as ISO strings (text) for portability.
 * Lists / structured blobs are stored as JSON text (SQLite has no array type).
 */

// ---- Conversations ----------------------------------------------------------

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// ---- Messages ---------------------------------------------------------------

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant" | "tool" | "system"
  mode: text("mode"),            // null | "think" | "draft" | "prepare" | "execute"
  content: text("content").notNull(),
  metadata: text("metadata"),    // JSON-encoded blob
  createdAt: text("created_at").notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export const messageRoles = ["user", "assistant", "tool", "system"] as const;
export const agentModes = ["think", "draft", "prepare", "execute"] as const;
export type AgentMode = (typeof agentModes)[number];

// ---- Memory ----------------------------------------------------------------

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  category: text("category").notNull(), // preference | project | goal | tool | style | other
  confidence: integer("confidence").notNull().default(80), // 0..100
  sourceMessageId: text("source_message_id"),
  enabled: integer("enabled").notNull().default(1), // 0/1 bool
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const memoryCategories = [
  "preference",
  "project",
  "goal",
  "tool",
  "style",
  "other",
] as const;
export type MemoryCategory = (typeof memoryCategories)[number];

export const insertMemorySchema = createInsertSchema(memories)
  .omit({ createdAt: true, updatedAt: true })
  .extend({
    category: z.enum(memoryCategories),
    confidence: z.number().int().min(0).max(100).optional(),
    enabled: z.number().int().min(0).max(1).optional(),
  });
export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type Memory = typeof memories.$inferSelect;

// ---- Approval Requests -----------------------------------------------------

export const approvalRequests = sqliteTable("approval_requests", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  actionType: text("action_type").notNull(),
  summary: text("summary").notNull(),
  finalPayload: text("final_payload").notNull(), // JSON
  riskLevel: text("risk_level").notNull(),       // medium | high | critical
  reversibility: text("reversibility").notNull(), // reversible | partially_reversible | irreversible
  status: text("status").notNull().default("pending"), // pending | approved | denied | expired
  rationale: text("rationale"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const riskLevels = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof riskLevels)[number];

export const insertApprovalSchema = createInsertSchema(approvalRequests).omit({
  createdAt: true,
  resolvedAt: true,
  status: true,
});
export type InsertApprovalRequest = z.infer<typeof insertApprovalSchema>;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;

// ---- Tool Calls / Audit Events ---------------------------------------------

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  toolName: text("tool_name").notNull(),
  input: text("input").notNull(),  // JSON
  output: text("output"),          // JSON
  riskLevel: text("risk_level").notNull(),
  approvalRequestId: text("approval_request_id"),
  status: text("status").notNull(), // queued | running | succeeded | failed | blocked
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export type ToolCall = typeof toolCalls.$inferSelect;

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id"),
  kind: text("kind").notNull(), // user_message | agent_decision | tool_call | approval_request | approval_decision | execution | error
  summary: text("summary").notNull(),
  detail: text("detail"), // JSON
  createdAt: text("created_at").notNull(),
});

export type AuditEvent = typeof auditEvents.$inferSelect;

// ---- Tasks (plan steps) -----------------------------------------------------

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  status: text("status").notNull().default("pending"), // pending | in_progress | blocked | completed
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const taskStatuses = [
  "pending",
  "in_progress",
  "blocked",
  "completed",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const insertTaskSchema = createInsertSchema(tasks).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// ---- Settings (key-value) --------------------------------------------------

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type Setting = typeof settings.$inferSelect;

// ---- Chat send request (API contract) --------------------------------------

export const chatSendSchema = z.object({
  conversationId: z.string().optional(),
  content: z.string().min(1),
  mode: z.enum(agentModes).optional(), // user-forced mode (optional)
});
export type ChatSendInput = z.infer<typeof chatSendSchema>;
