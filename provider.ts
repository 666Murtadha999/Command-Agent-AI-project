/**
 * LLM Provider adapter.
 *
 * The orchestrator only talks to this interface. To swap in OpenAI / Anthropic /
 * a local model, implement `LLMProvider` and register it in providerFactory.
 */

import type { AgentMode } from "@shared/schema";

export type ProviderMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ProviderRequest = {
  system: string;
  messages: ProviderMessage[];
  mode: AgentMode;
  // hints derived from classification — a real provider would just see the prompt
  intent?: string;
  riskLevel?: string;
};

export type ProviderResponse = {
  content: string;
  provider: string;
  model: string;
};

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(req: ProviderRequest): Promise<ProviderResponse>;
}

// -----------------------------------------------------------------------------
// MockProvider — deterministic, no network. Demonstrates the four modes.
// -----------------------------------------------------------------------------

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  readonly model = "mock-command-agent-v1";

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const last = req.messages[req.messages.length - 1]?.content ?? "";
    const content = renderMockResponse(req.mode, last, req);
    return { content, provider: this.name, model: this.model };
  }
}

// -----------------------------------------------------------------------------
// OllamaProvider — local model via http://127.0.0.1:11434.
// -----------------------------------------------------------------------------

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;

  constructor() {
    this.model = process.env.OLLAMA_MODEL || "llama3.2";
    this.baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  }

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const messages = [
      { role: "system", content: req.system },
      ...req.messages
        .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages,
        options: {
          temperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0.4),
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Ollama request failed (${res.status}). Is Ollama running and is model '${this.model}' pulled? ${body}`
      );
    }

    const data = (await res.json()) as any;
    const content = String(data.message?.content ?? "").trim();
    return {
      content: content || "Ollama returned an empty response.",
      provider: this.name,
      model: this.model,
    };
  }
}

function renderMockResponse(mode: AgentMode, userText: string, req: ProviderRequest): string {
  const summary = userText.slice(0, 180).trim();
  switch (mode) {
    case "think":
      return [
        `**Think mode** — analyzing without acting.`,
        ``,
        `Restating the ask: ${summary}`,
        ``,
        `Key considerations:`,
        `- Constraints to confirm before committing to a path.`,
        `- Assumptions I am making, marked explicitly.`,
        `- Where the idea is strong, and where it is weak.`,
        ``,
        `Direct take: this needs more concrete inputs before it is worth executing. Tell me the constraints (time, budget, scope) and I will return a recommendation.`,
        ``,
        `_Mock LLM output. Swap in a real provider in \`server/agent/provider.ts\`._`,
      ].join("\n");

    case "draft":
      return [
        `**Draft mode** — producing reviewable artifact, no execution.`,
        ``,
        `\`\`\``,
        draftArtifact(userText),
        `\`\`\``,
        ``,
        `Review the draft above. I will not send, publish, or apply this without explicit approval.`,
      ].join("\n");

    case "prepare":
      return [
        `**Prepare mode** — staging context, no external side effects.`,
        ``,
        `Steps I would take to prepare this work:`,
        `1. Gather the inputs and assumptions.`,
        `2. Validate the target and reversibility.`,
        `3. Produce a preview for your review.`,
        ``,
        `Nothing has been executed. Approve the next step to move to execute mode.`,
      ].join("\n");

    case "execute":
      return [
        `**Execute mode requested** — this action looks consequential (risk: ${req.riskLevel ?? "unknown"}).`,
        ``,
        `I am not running it. I have created an approval request with the final payload.`,
        `Open the approval modal, review the exact effect, then approve or deny.`,
      ].join("\n");
  }
}

function draftArtifact(userText: string): string {
  // Trivial templated draft so the UI shows something concrete.
  const cleaned = userText.replace(/^\s*(draft|write|compose)\s*/i, "").trim();
  if (/email|message|reply/i.test(userText)) {
    return `Subject: ${cleaned.slice(0, 60) || "Follow-up"}\n\nHi,\n\n${cleaned || "[body]"}\n\nThanks,\n<you>`;
  }
  if (/plan|outline|checklist/i.test(userText)) {
    return `Plan:\n1. Define the goal in one sentence.\n2. List constraints.\n3. List options.\n4. Pick the option with the best risk/reward.\n5. Execute the first concrete step.`;
  }
  if (/code|function|script/i.test(userText)) {
    return `// Sketch — review before running\nfunction run() {\n  // TODO: ${cleaned || "implement"}\n}`;
  }
  return cleaned || "[draft content]";
}

// -----------------------------------------------------------------------------
// Provider factory
// -----------------------------------------------------------------------------

let cached: LLMProvider | null = null;
export function getProvider(): LLMProvider {
  if (cached) return cached;
  const name = process.env.AGENT_PROVIDER ?? "mock";
  switch (name) {
    case "ollama":
    case "local":
      cached = new OllamaProvider();
      break;
    // Add real providers here. Keep the MockProvider as a deterministic fallback
    // so the app boots even without API keys.
    case "mock":
    default:
      cached = new MockProvider();
      break;
  }
  return cached;
}
