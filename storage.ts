import {
  conversations,
  messages,
  memories,
  approvalRequests,
  toolCalls,
  auditEvents,
  tasks,
  settings,
} from "@shared/schema";
import type {
  Conversation,
  InsertConversation,
  Message,
  InsertMessage,
  Memory,
  InsertMemory,
  ApprovalRequest,
  InsertApprovalRequest,
  ToolCall,
  AuditEvent,
  Task,
  InsertTask,
  Setting,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Ensure tables exist (lightweight bootstrap; drizzle-kit push is preferred but
// keeps the MVP runnable without a separate migration step).
function ensureSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      mode TEXT,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 80,
      source_message_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      final_payload TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      reversibility TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      rationale TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      risk_level TEXT NOT NULL,
      approval_request_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
ensureSchema();

const now = () => new Date().toISOString();
const uid = () => randomUUID();

export interface IStorage {
  // conversations
  listConversations(): Conversation[];
  getConversation(id: string): Conversation | undefined;
  createConversation(input: Partial<InsertConversation> & { title?: string }): Conversation;
  updateConversationTitle(id: string, title: string): Conversation | undefined;
  touchConversation(id: string): void;

  // messages
  listMessages(conversationId: string): Message[];
  appendMessage(input: Omit<InsertMessage, "id"> & { id?: string }): Message;

  // memory
  listMemories(): Memory[];
  createMemory(input: Omit<InsertMemory, "id"> & { id?: string }): Memory;
  updateMemory(id: string, patch: Partial<InsertMemory>): Memory | undefined;
  deleteMemory(id: string): void;
  enabledMemories(): Memory[];

  // approvals
  listApprovals(): ApprovalRequest[];
  getApproval(id: string): ApprovalRequest | undefined;
  createApproval(input: Omit<InsertApprovalRequest, "id"> & { id?: string }): ApprovalRequest;
  resolveApproval(id: string, status: "approved" | "denied"): ApprovalRequest | undefined;

  // tool calls
  recordToolCall(t: Omit<ToolCall, "id" | "createdAt" | "output" | "completedAt" | "approvalRequestId"> & { id?: string; output?: string | null; completedAt?: string | null; approvalRequestId?: string | null }): ToolCall;
  completeToolCall(id: string, output: unknown, status: ToolCall["status"]): ToolCall | undefined;
  listToolCalls(conversationId?: string): ToolCall[];

  // audit
  logAudit(e: Omit<AuditEvent, "id" | "createdAt">): AuditEvent;
  listAudit(): AuditEvent[];

  // tasks
  listTasks(conversationId: string): Task[];
  createTask(input: Omit<InsertTask, "id"> & { id?: string }): Task;
  updateTask(id: string, patch: Partial<InsertTask>): Task | undefined;
  deleteTask(id: string): void;

  // settings
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
  allSettings(): Setting[];
}

export class DatabaseStorage implements IStorage {
  // conversations
  listConversations(): Conversation[] {
    return db.select().from(conversations).orderBy(desc(conversations.updatedAt)).all();
  }
  getConversation(id: string): Conversation | undefined {
    return db.select().from(conversations).where(eq(conversations.id, id)).get();
  }
  createConversation(input: Partial<InsertConversation> & { title?: string }): Conversation {
    const row = {
      id: input.id ?? uid(),
      title: input.title ?? "New conversation",
      createdAt: now(),
      updatedAt: now(),
    };
    return db.insert(conversations).values(row).returning().get();
  }
  updateConversationTitle(id: string, title: string): Conversation | undefined {
    return db
      .update(conversations)
      .set({ title, updatedAt: now() })
      .where(eq(conversations.id, id))
      .returning()
      .get();
  }
  touchConversation(id: string): void {
    db.update(conversations).set({ updatedAt: now() }).where(eq(conversations.id, id)).run();
  }

  // messages
  listMessages(conversationId: string): Message[] {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .all();
  }
  appendMessage(input: Omit<InsertMessage, "id"> & { id?: string }): Message {
    const row = {
      id: input.id ?? uid(),
      conversationId: input.conversationId,
      role: input.role,
      mode: input.mode ?? null,
      content: input.content,
      metadata: input.metadata ?? null,
      createdAt: now(),
    };
    const result = db.insert(messages).values(row).returning().get();
    this.touchConversation(input.conversationId);
    return result;
  }

  // memory
  listMemories(): Memory[] {
    return db.select().from(memories).orderBy(desc(memories.updatedAt)).all();
  }
  enabledMemories(): Memory[] {
    return db.select().from(memories).where(eq(memories.enabled, 1)).all();
  }
  createMemory(input: Omit<InsertMemory, "id"> & { id?: string }): Memory {
    const row = {
      id: input.id ?? uid(),
      content: input.content,
      category: input.category,
      confidence: input.confidence ?? 80,
      sourceMessageId: input.sourceMessageId ?? null,
      enabled: input.enabled ?? 1,
      createdAt: now(),
      updatedAt: now(),
    };
    return db.insert(memories).values(row).returning().get();
  }
  updateMemory(id: string, patch: Partial<InsertMemory>): Memory | undefined {
    return db
      .update(memories)
      .set({ ...patch, updatedAt: now() })
      .where(eq(memories.id, id))
      .returning()
      .get();
  }
  deleteMemory(id: string): void {
    db.delete(memories).where(eq(memories.id, id)).run();
  }

  // approvals
  listApprovals(): ApprovalRequest[] {
    return db.select().from(approvalRequests).orderBy(desc(approvalRequests.createdAt)).all();
  }
  getApproval(id: string): ApprovalRequest | undefined {
    return db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).get();
  }
  createApproval(input: Omit<InsertApprovalRequest, "id"> & { id?: string }): ApprovalRequest {
    const row = {
      id: input.id ?? uid(),
      conversationId: input.conversationId,
      actionType: input.actionType,
      summary: input.summary,
      finalPayload: input.finalPayload,
      riskLevel: input.riskLevel,
      reversibility: input.reversibility,
      status: "pending" as const,
      rationale: input.rationale ?? null,
      createdAt: now(),
      resolvedAt: null,
    };
    return db.insert(approvalRequests).values(row).returning().get();
  }
  resolveApproval(id: string, status: "approved" | "denied"): ApprovalRequest | undefined {
    return db
      .update(approvalRequests)
      .set({ status, resolvedAt: now() })
      .where(eq(approvalRequests.id, id))
      .returning()
      .get();
  }

  // tool calls
  recordToolCall(t: Omit<ToolCall, "id" | "createdAt" | "output" | "completedAt" | "approvalRequestId"> & { id?: string; output?: string | null; completedAt?: string | null; approvalRequestId?: string | null }): ToolCall {
    const row = {
      id: t.id ?? uid(),
      conversationId: t.conversationId,
      toolName: t.toolName,
      input: t.input,
      output: t.output ?? null,
      riskLevel: t.riskLevel,
      approvalRequestId: t.approvalRequestId ?? null,
      status: t.status,
      createdAt: now(),
      completedAt: t.completedAt ?? null,
    };
    return db.insert(toolCalls).values(row).returning().get();
  }
  completeToolCall(id: string, output: unknown, status: ToolCall["status"]): ToolCall | undefined {
    return db
      .update(toolCalls)
      .set({
        output: typeof output === "string" ? output : JSON.stringify(output),
        status,
        completedAt: now(),
      })
      .where(eq(toolCalls.id, id))
      .returning()
      .get();
  }
  listToolCalls(conversationId?: string): ToolCall[] {
    const q = db.select().from(toolCalls).orderBy(desc(toolCalls.createdAt));
    if (conversationId) {
      return db
        .select()
        .from(toolCalls)
        .where(eq(toolCalls.conversationId, conversationId))
        .orderBy(desc(toolCalls.createdAt))
        .all();
    }
    return q.all();
  }

  // audit
  logAudit(e: Omit<AuditEvent, "id" | "createdAt">): AuditEvent {
    const row = {
      id: uid(),
      conversationId: e.conversationId ?? null,
      kind: e.kind,
      summary: e.summary,
      detail: e.detail ?? null,
      createdAt: now(),
    };
    return db.insert(auditEvents).values(row).returning().get();
  }
  listAudit(): AuditEvent[] {
    return db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(500)
      .all();
  }

  // tasks
  listTasks(conversationId: string): Task[] {
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.conversationId, conversationId))
      .orderBy(asc(tasks.orderIndex))
      .all();
  }
  createTask(input: Omit<InsertTask, "id"> & { id?: string }): Task {
    const row = {
      id: input.id ?? uid(),
      conversationId: input.conversationId,
      title: input.title,
      detail: input.detail ?? null,
      status: input.status ?? "pending",
      orderIndex: input.orderIndex ?? 0,
      createdAt: now(),
      updatedAt: now(),
    };
    return db.insert(tasks).values(row).returning().get();
  }
  updateTask(id: string, patch: Partial<InsertTask>): Task | undefined {
    return db
      .update(tasks)
      .set({ ...patch, updatedAt: now() })
      .where(eq(tasks.id, id))
      .returning()
      .get();
  }
  deleteTask(id: string): void {
    db.delete(tasks).where(eq(tasks.id, id)).run();
  }

  // settings
  getSetting(key: string): string | undefined {
    return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
  }
  setSetting(key: string, value: string): void {
    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) {
      db.update(settings).set({ value, updatedAt: now() }).where(eq(settings.key, key)).run();
    } else {
      db.insert(settings).values({ key, value, updatedAt: now() }).run();
    }
  }
  allSettings(): Setting[] {
    return db.select().from(settings).all();
  }
}

export const storage = new DatabaseStorage();
