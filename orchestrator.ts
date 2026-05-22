/**
 * Agent orchestrator.
 *
 * Given a user message:
 *   1. Persist the user message.
 *   2. Classify into a mode + risk level.
 *   3. If execute + approval-required: create approval request, do not run.
 *   4. Otherwise: call the LLM provider and persist the assistant response.
 *   5. Auto-extract trivial "remember" requests into memory.
 *   6. Audit-log every step.
 */

import type { Message, AgentMode, Conversation, ApprovalRequest } from "@shared/schema";
import { storage } from "../storage";
import { classify, type Classification } from "./policy";
import { buildSystemPrompt } from "./prompts";
import { getProvider, type ProviderMessage } from "./provider";
import { classifyHarm, buildHarmRefusal } from "./safety";
import { extractSearchQuery, formatSearchAnswer, looksLikeResearchRequest, runWebSearch } from "./search";

export type OrchestratorResult = {
  conversation: Conversation;
  userMessage: Message;
  assistantMessage: Message;
  classification: Classification;
  approval?: ApprovalRequest;
  memoryCreated?: string[];
};

export async function handleUserTurn(input: {
  conversationId?: string;
  content: string;
  forcedMode?: AgentMode;
}): Promise<OrchestratorResult> {
  // 1. Ensure conversation
  let conversation =
    input.conversationId !== undefined ? storage.getConversation(input.conversationId) : undefined;
  if (!conversation) {
    conversation = storage.createConversation({
      title: input.content.slice(0, 48).trim() || "New conversation",
    });
  }

  // 2. Persist user message
  const userMessage = storage.appendMessage({
    conversationId: conversation.id,
    role: "user",
    content: input.content,
    mode: null,
  });
  storage.logAudit({
    conversationId: conversation.id,
    kind: "user_message",
    summary: input.content.slice(0, 120),
    detail: null,
  });

  // 3a. Safety check — operational-harm requests are refused, not drafted.
  const harm = classifyHarm(input.content);
  if (harm.blocked) {
    const refusal = buildHarmRefusal(harm);
    const assistant = storage.appendMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: refusal,
      mode: "think",
      metadata: JSON.stringify({ refused: true, harm }),
    });
    storage.logAudit({
      conversationId: conversation.id,
      kind: "agent_decision",
      summary: `Refused: ${harm.category}`,
      detail: JSON.stringify(harm),
    });
    return {
      conversation: storage.getConversation(conversation.id)!,
      userMessage,
      assistantMessage: assistant,
      classification: {
        mode: "think",
        risk: "low",
        reversibility: "reversible",
        actionType: "refused",
        approvalRequired: false,
        rationale: harm.rationale ?? "Operational-harm request refused.",
      },
    };
  }

  // 3. Classify
  const classification = classify(input.content, input.forcedMode);
  storage.logAudit({
    conversationId: conversation.id,
    kind: "agent_decision",
    summary: `Mode=${classification.mode} risk=${classification.risk} approval=${classification.approvalRequired}`,
    detail: JSON.stringify(classification),
  });

  // 4. Memory auto-capture for explicit "remember ..." statements (durable preferences only).
  const memoryCreated = maybeAutoMemory(input.content, userMessage.id);

  // 5. Approval gate
  let approval: ApprovalRequest | undefined;
  if (classification.approvalRequired) {
    approval = storage.createApproval({
      conversationId: conversation.id,
      actionType: classification.actionType,
      summary: `Execute: ${input.content.slice(0, 120)}`,
      finalPayload: JSON.stringify({
        intent: input.content,
        mode: classification.mode,
        risk: classification.risk,
        reversibility: classification.reversibility,
      }),
      riskLevel: classification.risk === "low" ? "medium" : classification.risk,
      reversibility: classification.reversibility,
      rationale: classification.rationale,
    });
    storage.logAudit({
      conversationId: conversation.id,
      kind: "approval_request",
      summary: `Created approval ${approval.id} for ${classification.actionType}`,
      detail: JSON.stringify(approval),
    });
  }

  // 5b. Real web research tool. This is non-private, non-destructive, and does
  // not require approval. It records tool activity and returns cited links.
  if (!approval && looksLikeResearchRequest(input.content)) {
    const query = extractSearchQuery(input.content);
    const tc = storage.recordToolCall({
      conversationId: conversation.id,
      toolName: "web_search",
      input: JSON.stringify({ query }),
      riskLevel: "medium",
      status: "running",
    });

    try {
      const search = await runWebSearch(query, 5);
      storage.completeToolCall(tc.id, search, "succeeded");
      storage.logAudit({
        conversationId: conversation.id,
        kind: "tool_call",
        summary: `web_search: ${query}`,
        detail: JSON.stringify({ provider: search.provider, resultCount: search.results.length }),
      });

      const assistantMessage = storage.appendMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: formatSearchAnswer(search),
        mode: "prepare",
        metadata: JSON.stringify({
          provider: "web_search",
          model: search.provider,
          classification,
          toolCallId: tc.id,
        }),
      });

      return {
        conversation: storage.getConversation(conversation.id)!,
        userMessage,
        assistantMessage,
        classification: { ...classification, mode: "prepare", actionType: "web_search" },
        memoryCreated,
      };
    } catch (e: any) {
      storage.completeToolCall(tc.id, { error: e?.message ?? "search_failed" }, "failed");
      storage.logAudit({
        conversationId: conversation.id,
        kind: "error",
        summary: "web_search failed",
        detail: JSON.stringify({ query, message: e?.message }),
      });
      // Fall through to the normal provider so the user still gets a response.
    }
  }

  // 6. Build prompt and call provider
  const memories = storage.enabledMemories();
  const system = buildSystemPrompt(memories);
  const history = storage.listMessages(conversation.id);
  const providerMessages: ProviderMessage[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const provider = getProvider();
  const response = await provider.complete({
    system,
    messages: providerMessages,
    mode: classification.mode,
    intent: classification.actionType,
    riskLevel: classification.risk,
  });

  // 7. If approval required, override response with a clear pending-approval message
  //    that also references the approval id so the UI can open the modal.
  let assistantContent = response.content;
  if (approval) {
    assistantContent =
      `**Approval required** — I will not execute this without your review.\n\n` +
      `- Action: \`${classification.actionType}\`\n` +
      `- Risk: \`${classification.risk}\`\n` +
      `- Reversibility: \`${classification.reversibility}\`\n` +
      `- Rationale: ${classification.rationale}\n\n` +
      `Open the approval panel on the right to inspect the final payload and decide.`;
  }

  const assistantMessage = storage.appendMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: assistantContent,
    mode: classification.mode,
    metadata: JSON.stringify({
      provider: response.provider,
      model: response.model,
      classification,
      approvalId: approval?.id,
    }),
  });

  storage.logAudit({
    conversationId: conversation.id,
    kind: "agent_decision",
    summary: `Assistant reply (${classification.mode})`,
    detail: JSON.stringify({ provider: response.provider, model: response.model }),
  });

  // 8. If think/draft, auto-derive task plan when user explicitly asks for one.
  if (/\bplan\b|\bsteps?\b|\bbreak (it )?down\b/i.test(input.content)) {
    derivePlan(conversation.id, input.content);
  }

  // Refresh conversation row
  conversation = storage.getConversation(conversation.id)!;

  return {
    conversation,
    userMessage,
    assistantMessage,
    classification,
    approval,
    memoryCreated,
  };
}

/**
 * Naive "remember that ..." parser. Captures durable preferences only; refuses
 * to store anything that looks like a secret.
 */
function maybeAutoMemory(text: string, sourceMessageId: string): string[] {
  const created: string[] = [];
  const m = text.match(/^\s*(?:please\s+)?remember(?:\s+that)?\s*[:,-]?\s*(.+)$/i);
  if (!m) return created;
  const content = m[1].trim();
  if (!content) return created;
  if (/\b(password|api[-_ ]?key|secret|token|private key|ssn)\b/i.test(content)) {
    // Refuse — security policy.
    return created;
  }
  const category = inferCategory(content);
  const row = storage.createMemory({
    content,
    category,
    confidence: 90,
    sourceMessageId,
    enabled: 1,
  });
  created.push(row.id);
  return created;
}

function inferCategory(content: string): "preference" | "project" | "goal" | "tool" | "style" | "other" {
  if (/\bprefer|like|hate|avoid|always|never\b/i.test(content)) return "preference";
  if (/\bproject\b/i.test(content)) return "project";
  if (/\bgoal|objective|target\b/i.test(content)) return "goal";
  if (/\bstack|tool|framework|library\b/i.test(content)) return "tool";
  if (/\btone|style|voice|writing\b/i.test(content)) return "style";
  return "other";
}

/**
 * Trivial plan derivation: split a request into numbered steps and persist them.
 * Real LLM-driven planning replaces this without changing call sites.
 */
function derivePlan(conversationId: string, request: string) {
  const baseSteps = [
    { title: "Clarify goal", detail: "State the goal in one sentence; confirm constraints." },
    { title: "Identify options", detail: "List 2–3 concrete approaches with tradeoffs." },
    { title: "Pick the recommendation", detail: "Choose the option with the best risk/reward; state the assumption that would flip it." },
    { title: "Execute first step", detail: "Smallest action that proves the plan can work." },
    { title: "Review and adjust", detail: "Check the result against the goal; revise plan if needed." },
  ];
  // Avoid duplicating an existing plan for the same conversation.
  const existing = storage.listTasks(conversationId);
  if (existing.length > 0) return;

  baseSteps.forEach((step, i) => {
    storage.createTask({
      conversationId,
      title: step.title,
      detail: step.detail,
      status: "pending",
      orderIndex: i,
    });
  });

  storage.logAudit({
    conversationId,
    kind: "agent_decision",
    summary: `Created plan with ${baseSteps.length} steps`,
    detail: JSON.stringify({ request }),
  });
}

/**
 * Execute (simulated) an approved action. Real implementations would dispatch
 * to a tool router here.
 */
export async function executeApproved(approvalId: string): Promise<{
  approval: ApprovalRequest;
  toolCallId: string;
}> {
  const approval = storage.getApproval(approvalId);
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "approved") throw new Error("Approval not in approved state");

  const tc = storage.recordToolCall({
    conversationId: approval.conversationId,
    toolName: approval.actionType,
    input: approval.finalPayload,
    riskLevel: approval.riskLevel as any,
    approvalRequestId: approval.id,
    status: "running",
  });

  // Simulated execution — never performs the real side effect in the MVP.
  storage.completeToolCall(tc.id, { simulated: true, ok: true }, "succeeded");

  storage.appendMessage({
    conversationId: approval.conversationId,
    role: "tool",
    content: `Executed (simulated): ${approval.actionType}. No real external side effects were performed.`,
    mode: "execute",
    metadata: JSON.stringify({ approvalId, toolCallId: tc.id }),
  });

  storage.logAudit({
    conversationId: approval.conversationId,
    kind: "execution",
    summary: `Executed ${approval.actionType} (simulated)`,
    detail: JSON.stringify({ approvalId, toolCallId: tc.id }),
  });

  return { approval, toolCallId: tc.id };
}
