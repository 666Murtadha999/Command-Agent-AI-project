import type { Express, Request, Response } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  chatSendSchema,
  insertMemorySchema,
  memoryCategories,
  taskStatuses,
} from "@shared/schema";
import { executeApproved, handleUserTurn } from "./agent/orchestrator";
import { TOOL_REGISTRY } from "./agent/policy";
import { runWebSearch } from "./agent/search";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ---- Conversations -------------------------------------------------------

  app.get("/api/conversations", (_req, res) => {
    res.json(storage.listConversations());
  });

  app.post("/api/conversations", (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title : "New conversation";
    res.json(storage.createConversation({ title }));
  });

  app.get("/api/conversations/:id", (req, res) => {
    const c = storage.getConversation(req.params.id);
    if (!c) return res.status(404).json({ error: "not_found" });
    res.json(c);
  });

  app.patch("/api/conversations/:id", (req, res) => {
    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "title_required" });
    const c = storage.updateConversationTitle(req.params.id, title);
    if (!c) return res.status(404).json({ error: "not_found" });
    res.json(c);
  });

  app.get("/api/conversations/:id/messages", (req, res) => {
    res.json(storage.listMessages(req.params.id));
  });

  app.get("/api/conversations/:id/tasks", (req, res) => {
    res.json(storage.listTasks(req.params.id));
  });

  app.get("/api/conversations/:id/tool-calls", (req, res) => {
    res.json(storage.listToolCalls(req.params.id));
  });

  // ---- Chat ---------------------------------------------------------------

  app.post("/api/chat", async (req: Request, res: Response) => {
    const parsed = chatSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", details: parsed.error.format() });
    }
    try {
      const result = await handleUserTurn({
        conversationId: parsed.data.conversationId,
        content: parsed.data.content,
        forcedMode: parsed.data.mode,
      });
      res.json(result);
    } catch (e: any) {
      storage.logAudit({
        conversationId: parsed.data.conversationId ?? null,
        kind: "error",
        summary: "Chat handler error",
        detail: JSON.stringify({ message: e?.message }),
      });
      res.status(500).json({ error: "chat_failed", message: e?.message });
    }
  });

  // ---- Tasks --------------------------------------------------------------

  const taskPatchSchema = z.object({
    title: z.string().optional(),
    detail: z.string().nullable().optional(),
    status: z.enum(taskStatuses).optional(),
    orderIndex: z.number().int().optional(),
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const parsed = taskPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    const t = storage.updateTask(req.params.id, parsed.data as any);
    if (!t) return res.status(404).json({ error: "not_found" });
    res.json(t);
  });

  app.delete("/api/tasks/:id", (req, res) => {
    storage.deleteTask(req.params.id);
    res.json({ ok: true });
  });

  const taskCreateSchema = z.object({
    conversationId: z.string(),
    title: z.string().min(1),
    detail: z.string().optional(),
    orderIndex: z.number().int().optional(),
  });

  app.post("/api/tasks", (req, res) => {
    const parsed = taskCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    res.json(storage.createTask(parsed.data));
  });

  // ---- Memory -------------------------------------------------------------

  app.get("/api/memory", (_req, res) => {
    res.json(storage.listMemories());
  });

  app.post("/api/memory", (req, res) => {
    const parsed = insertMemorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    res.json(storage.createMemory(parsed.data));
  });

  const memoryPatchSchema = z.object({
    content: z.string().optional(),
    category: z.enum(memoryCategories).optional(),
    confidence: z.number().int().min(0).max(100).optional(),
    enabled: z.number().int().min(0).max(1).optional(),
  });

  app.patch("/api/memory/:id", (req, res) => {
    const parsed = memoryPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    const m = storage.updateMemory(req.params.id, parsed.data as any);
    if (!m) return res.status(404).json({ error: "not_found" });
    res.json(m);
  });

  app.delete("/api/memory/:id", (req, res) => {
    storage.deleteMemory(req.params.id);
    res.json({ ok: true });
  });

  // ---- Approvals ----------------------------------------------------------

  app.get("/api/approvals", (_req, res) => {
    res.json(storage.listApprovals());
  });

  app.get("/api/approvals/:id", (req, res) => {
    const a = storage.getApproval(req.params.id);
    if (!a) return res.status(404).json({ error: "not_found" });
    res.json(a);
  });

  app.post("/api/approvals/:id/decision", async (req, res) => {
    const decision = req.body?.decision;
    if (decision !== "approved" && decision !== "denied") {
      return res.status(400).json({ error: "invalid_decision" });
    }
    const approval = storage.resolveApproval(req.params.id, decision);
    if (!approval) return res.status(404).json({ error: "not_found" });

    storage.logAudit({
      conversationId: approval.conversationId,
      kind: "approval_decision",
      summary: `Approval ${approval.id} -> ${decision}`,
      detail: JSON.stringify(approval),
    });

    if (decision === "approved") {
      try {
        const exec = await executeApproved(approval.id);
        return res.json({ approval: exec.approval, executed: true, toolCallId: exec.toolCallId });
      } catch (e: any) {
        return res.status(500).json({ error: "execution_failed", message: e?.message });
      }
    }

    // denied -> also record a tool call as blocked for the audit trail
    storage.recordToolCall({
      conversationId: approval.conversationId,
      toolName: approval.actionType,
      input: approval.finalPayload,
      riskLevel: approval.riskLevel as any,
      approvalRequestId: approval.id,
      status: "blocked",
    });

    res.json({ approval, executed: false });
  });

  // ---- Audit / Tool activity ---------------------------------------------

  app.get("/api/audit", (_req, res) => {
    res.json(storage.listAudit());
  });

  app.get("/api/tool-calls", (_req, res) => {
    res.json(storage.listToolCalls());
  });

  app.get("/api/tools", (_req, res) => {
    res.json(TOOL_REGISTRY);
  });

  const webSearchSchema = z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(10).optional(),
  });

  app.post("/api/tools/web-search", async (req, res) => {
    const parsed = webSearchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });

    try {
      const result = await runWebSearch(parsed.data.query, parsed.data.limit ?? 5);
      storage.logAudit({
        conversationId: null,
        kind: "tool_call",
        summary: `manual web_search: ${parsed.data.query}`,
        detail: JSON.stringify({ provider: result.provider, resultCount: result.results.length }),
      });
      res.json(result);
    } catch (e: any) {
      storage.logAudit({
        conversationId: null,
        kind: "error",
        summary: "manual web_search failed",
        detail: JSON.stringify({ query: parsed.data.query, message: e?.message }),
      });
      res.status(500).json({ error: "search_failed", message: e?.message });
    }
  });

  // ---- Settings -----------------------------------------------------------

  app.get("/api/settings", (_req, res) => {
    res.json(storage.allSettings());
  });

  const settingPutSchema = z.object({
    key: z.string().min(1),
    value: z.string(),
  });

  app.put("/api/settings", (req, res) => {
    const parsed = settingPutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    storage.setSetting(parsed.data.key, parsed.data.value);
    res.json({ ok: true });
  });

  return httpServer;
}
