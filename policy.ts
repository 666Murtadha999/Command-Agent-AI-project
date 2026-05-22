/**
 * Policy + classification engine.
 *
 * Pure functions over text — no I/O. The orchestrator calls these to:
 *   - classify the user's intent into a mode (think / draft / prepare / execute)
 *   - estimate risk
 *   - decide whether approval is required
 *
 * Real LLM-based classification can replace these heuristics later; the calling
 * code only depends on the returned shapes.
 */

import type { AgentMode, RiskLevel } from "@shared/schema";

export type Classification = {
  mode: AgentMode;
  risk: RiskLevel;
  reversibility: "reversible" | "partially_reversible" | "irreversible";
  actionType: string;
  approvalRequired: boolean;
  rationale: string;
};

const EXECUTE_PATTERNS: Array<{ re: RegExp; action: string; risk: RiskLevel; rev: Classification["reversibility"] }> = [
  { re: /\bsend\b.*\b(email|message|dm|text|sms)\b|\bemail\b\s+(?:to\s+)?\S+@\S+/i, action: "send_email", risk: "high", rev: "irreversible" },
  { re: /\bpost\b.*\b(twitter|x|linkedin|reddit|facebook|forum|blog|public)\b|\bpublish\b/i, action: "publish_content", risk: "high", rev: "partially_reversible" },
  { re: /\b(delete|rm\s+-rf|drop\s+table|truncate)\b/i, action: "delete_data", risk: "critical", rev: "irreversible" },
  { re: /\b(purchase|buy|pay|charge|transfer|wire|donate|trade)\b/i, action: "financial_transaction", risk: "critical", rev: "irreversible" },
  { re: /\b(change|reset|update)\b.*\b(password|account|billing|subscription|permissions?)\b/i, action: "account_change", risk: "high", rev: "partially_reversible" },
  { re: /\bsudo\b|\bchmod\b|\bchown\b/i, action: "privileged_shell", risk: "high", rev: "partially_reversible" },
  { re: /\b(schedule|enable)\b.*\b(recurring|cron|daily|weekly)\b/i, action: "recurring_task", risk: "medium", rev: "reversible" },
  { re: /\bmerge\b.*\b(pr|pull request|main|master|production)\b|\bdeploy\b.*\b(prod|production)\b/i, action: "deploy_or_merge", risk: "high", rev: "partially_reversible" },
];

const DRAFT_HINTS = /\b(draft|write|compose|outline|template|reply|sketch)\b/i;
const PREPARE_HINTS = /\b(prepare|stage|preview|dry[- ]?run|gather|collect|assemble)\b/i;
const EXECUTE_HINTS = /\b(execute|run|send|publish|delete|deploy|push|apply|commit|charge|buy|pay)\b/i;
const THINK_HINTS = /\b(think|analyze|brainstorm|critique|compare|evaluate|should i|what if|why)\b/i;

export function classify(userText: string, forcedMode?: AgentMode): Classification {
  const text = userText ?? "";

  // 1. Match against known risky actions first.
  for (const p of EXECUTE_PATTERNS) {
    if (p.re.test(text)) {
      const mode: AgentMode = forcedMode ?? "execute";
      return {
        mode,
        risk: p.risk,
        reversibility: p.rev,
        actionType: p.action,
        approvalRequired: mode === "execute" && p.risk !== "low",
        rationale: `Pattern match: ${p.action} (${p.risk}, ${p.rev}).`,
      };
    }
  }

  // 2. Otherwise, use mode hints (forced mode wins).
  let mode: AgentMode = "think";
  if (forcedMode) {
    mode = forcedMode;
  } else if (EXECUTE_HINTS.test(text)) {
    mode = "execute";
  } else if (PREPARE_HINTS.test(text)) {
    mode = "prepare";
  } else if (DRAFT_HINTS.test(text)) {
    mode = "draft";
  } else if (THINK_HINTS.test(text)) {
    mode = "think";
  }

  // 3. Default risk + reversibility per mode.
  const risk: RiskLevel = mode === "execute" ? "medium" : "low";
  const reversibility: Classification["reversibility"] =
    mode === "execute" ? "partially_reversible" : "reversible";

  return {
    mode,
    risk,
    reversibility,
    actionType: mode === "execute" ? "generic_execute" : `${mode}_only`,
    approvalRequired: mode === "execute" && risk !== "low",
    rationale: `Heuristic mode classification: ${mode}.`,
  };
}

/**
 * Decide whether a candidate tool call requires approval. Tool registry below.
 */
export type ToolDescriptor = {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  approvalRequired: boolean | "depends_on_command";
  privateDataAccess: boolean;
};

export const TOOL_REGISTRY: ToolDescriptor[] = [
  { name: "web_search", description: "Search the public web.", riskLevel: "medium", approvalRequired: false, privateDataAccess: false },
  { name: "read_file", description: "Read a file from the project workspace.", riskLevel: "low", approvalRequired: false, privateDataAccess: false },
  { name: "write_note", description: "Write a Markdown note to the local notes directory.", riskLevel: "low", approvalRequired: false, privateDataAccess: false },
  { name: "send_email", description: "Send an email from a connected account.", riskLevel: "high", approvalRequired: true, privateDataAccess: true },
  { name: "publish_content", description: "Publish content to a public surface.", riskLevel: "high", approvalRequired: true, privateDataAccess: true },
  { name: "delete_file", description: "Delete a local file.", riskLevel: "high", approvalRequired: true, privateDataAccess: true },
  { name: "run_shell_command", description: "Run a shell command in the sandbox.", riskLevel: "medium", approvalRequired: "depends_on_command", privateDataAccess: true },
  { name: "make_purchase", description: "Make a purchase or transfer funds.", riskLevel: "critical", approvalRequired: true, privateDataAccess: true },
];

export function toolRequiresApproval(toolName: string, input?: string): boolean {
  const t = TOOL_REGISTRY.find((x) => x.name === toolName);
  if (!t) return true; // unknown tool — require approval by default
  if (t.approvalRequired === true) return true;
  if (t.approvalRequired === false) return false;
  // depends_on_command
  const cmd = (input ?? "").toLowerCase();
  return /\b(rm|mv|chmod|chown|sudo|curl\s+.*\|\s*sh|wget\s+.*\|\s*sh|dd\s+if=)\b/.test(cmd);
}
