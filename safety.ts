/**
 * Safety policy module.
 *
 * Purpose
 * -------
 * The Command Agent is built to help its user think, plan, research, code,
 * write, study, and decide. It is also built so that one specific category of
 * use is permanently out of scope: producing instructions, scripts, drafts, or
 * automated workflows whose primary purpose is to deceive, coerce, exploit,
 * isolate, blackmail, stalk, emotionally abuse, or otherwise harm another
 * person.
 *
 * This file is the single, explicit place where that limit lives.
 *
 * What stays in scope
 * -------------------
 * The agent can still discuss sensitive interpersonal topics in benign ways.
 * Specifically allowed:
 *   - Education and analysis (e.g. explaining how manipulation tactics work so
 *     a user can recognize them).
 *   - Ethical negotiation, communication coaching, conflict de-escalation.
 *   - Self-defense and personal-safety planning for the user.
 *   - Helping a user who believes they are being targeted to document events,
 *     seek professional or legal help, or plan a safe exit.
 *   - Research, journalism, policy work, academic study of these topics.
 *
 * What is unsupported by design
 * -----------------------------
 * The agent will not produce material whose primary purpose is operational
 * harm to a third party — for example, scripts to gaslight a partner, plans to
 * isolate someone from their support network, blackmail templates, stalking
 * playbooks, or coercive-control checklists. Refusal of those requests is a
 * permanent product property, not a configuration switch.
 *
 * No dormant, commented-out, or feature-flagged code paths that would enable
 * those workflows exist in this codebase. If you are reading this file looking
 * for one: there isn't one, and adding one would violate the project's intent.
 *
 * Implementation notes
 * --------------------
 * The classifier below is intentionally minimal. It exists to:
 *   1. Flag requests that read as operational-harm asks so the orchestrator
 *      can respond with a refusal-plus-redirect rather than a draft.
 *   2. Provide a stable hook that regression tests can target.
 *
 * It is not a content filter for the model's own output and is not meant to
 * catch every adversarial phrasing. The real safeguard is the behavior
 * contract in the system prompt plus the approval gate on execution.
 */

export type HarmCheck = {
  blocked: boolean;
  category?:
    | "abuse_operational"
    | "stalking_operational"
    | "coercion_operational"
    | "blackmail_operational";
  rationale?: string;
};

/**
 * Phrases that read as "help me operationally harm a specific person".
 * Each entry must combine an operational verb with a clearly abusive target
 * pattern; single keywords like "manipulation" or "abuse" alone are explicitly
 * NOT blocked because they appear in legitimate educational, analytical, and
 * self-protective contexts.
 */
const OPERATIONAL_HARM_PATTERNS: Array<{ re: RegExp; category: HarmCheck["category"]; reason: string }> = [
  {
    re: /\b(help|write|draft|give|create)\b[^.]{0,80}\b(script|plan|playbook|message|text)\b[^.]{0,80}\b(gaslight|emotionally abuse|coerce|coercively control|isolate)\b/i,
    category: "abuse_operational",
    reason: "Request reads as producing an operational tool for emotional abuse or coercive control.",
  },
  {
    re: /\bhow (do|can) i\b[^.]{0,80}\b(isolate|cut off)\b[^.]{0,80}\b(from (?:her|his|their) (?:friends|family|support))\b/i,
    category: "abuse_operational",
    reason: "Request reads as planning to isolate a person from their support network.",
  },
  {
    re: /\b(stalk|track|surveil)\b[^.]{0,80}\b(without (?:them|her|his|their) knowing|secretly)\b/i,
    category: "stalking_operational",
    reason: "Request reads as covert stalking or surveillance of a person.",
  },
  {
    re: /\b(blackmail|extort)\b[^.]{0,80}\b(template|script|message|plan)\b/i,
    category: "blackmail_operational",
    reason: "Request reads as producing blackmail or extortion material.",
  },
  {
    re: /\b(threaten|coerce|force)\b[^.]{0,80}\b(into (?:sex|sending money|signing|complying))\b/i,
    category: "coercion_operational",
    reason: "Request reads as producing coercive pressure against a specific person.",
  },
];

/**
 * Explicit benign research/education wording. This allow path only applies
 * when the request does NOT also contain operational wording like scripts,
 * templates, step-by-step instructions, secrecy, threats, force, or coercion.
 */
const BENIGN_RESEARCH_PATTERNS = [
  /\b(research|study|academic|policy paper|journalism|analysis|analyze|explain|summarize|literature review)\b[^.]{0,160}\b(coercive control|gaslighting|manipulation|abuse|blackmail|stalking|emotional abuse)\b/i,
  /\b(coercive control|gaslighting|manipulation|abuse|blackmail|stalking|emotional abuse)\b[^.]{0,160}\b(research|study|academic|policy paper|journalism|analysis|analyze|explain|summarize|literature review)\b/i,
];

const OPERATIONAL_WORDS =
  /\b(script|template|playbook|step-by-step|how do i|how can i|make them|force|threaten|coerce|secretly|without them knowing|without (?:her|him|them) noticing|isolate|cut off|extort|blackmail)\b/i;

export function classifyHarm(userText: string): HarmCheck {
  const t = userText ?? "";

  const looksLikeBenignResearch = BENIGN_RESEARCH_PATTERNS.some((re) => re.test(t));
  if (looksLikeBenignResearch && !OPERATIONAL_WORDS.test(t)) {
    return { blocked: false };
  }

  for (const p of OPERATIONAL_HARM_PATTERNS) {
    if (p.re.test(t)) {
      return { blocked: true, category: p.category, rationale: p.reason };
    }
  }
  return { blocked: false };
}

/**
 * Canonical refusal text. Brief, non-preachy, and points the user toward the
 * benign adjacent help the agent IS willing to give.
 */
export function buildHarmRefusal(check: HarmCheck): string {
  return [
    `I won't help with that. This product does not produce operational material whose purpose is to harm, deceive, coerce, isolate, stalk, or blackmail another person.`,
    ``,
    `What I can help with on adjacent ground:`,
    `- Explain how a tactic works so you can recognize it.`,
    `- Help you document a situation, plan a safe exit, or draft what to say to a professional, lawyer, or trusted contact.`,
    `- Coach honest, non-coercive communication or negotiation.`,
    `- Research the topic for study, policy, or journalism.`,
    ``,
    `Tell me which of those (or something else benign) you actually want, and I'll go.`,
  ].join("\n");
}
