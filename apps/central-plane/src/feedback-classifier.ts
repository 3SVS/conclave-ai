/**
 * v0.16.9 — Sprint A: user feedback classifier.
 *
 * Categorizes user-submitted feedback on conclave output into a fixed
 * taxonomy via Claude Haiku. Output is one JSON object with:
 *   - category   (FeedbackCategory enum)
 *   - confidence (0..1)
 *   - reasoning  (one sentence)
 *
 * Two callers:
 *   - POST /feedback — sync at intake time (5s timeout, 1 retry).
 *   - 6h cron / POST /admin/classify-feedback — async retry of rows
 *     whose sync attempt failed (left as status='pending').
 *
 * Cost: ~$0.0001/feedback × low volume = negligible.
 *
 * Why a separate file from external-references.ts: that file's Haiku
 * call extracts JSONL of design lessons from public docs (different
 * prompt, different output shape). Duplicating ~30 lines of Anthropic
 * fetch boilerplate beats premature abstraction; if Sprint B/C add a
 * third caller we can extract llm-haiku.ts then.
 */
import type { Env } from "./env.js";

const CLASSIFIER_MODEL = "claude-haiku-4-5";
const CLASSIFY_TIMEOUT_MS = 5_000;

export type FeedbackCategory =
  | "accessibility"
  | "visual-hierarchy"
  | "design-tokens"
  | "responsive"
  | "consistency"
  | "typography"
  | "spacing-layout"
  | "accuracy"
  | "performance"
  | "correctness"
  | "security"
  | "maintainability"
  | "other";

const CATEGORIES: ReadonlySet<string> = new Set<FeedbackCategory>([
  "accessibility",
  "visual-hierarchy",
  "design-tokens",
  "responsive",
  "consistency",
  "typography",
  "spacing-layout",
  "accuracy",
  "performance",
  "correctness",
  "security",
  "maintainability",
  "other",
]);

export interface ClassifyInput {
  domain: "code" | "design";
  severity: "blocker" | "major" | "minor" | "nit";
  what_user_wanted: string;
  what_we_produced: string;
}

export interface ClassifyResult {
  category: FeedbackCategory;
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You categorize user feedback on AI-generated code/design output.

Output ONE JSON object only — no prose, no markdown fences:
{
  "category": "<one of the categories listed below>",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<one sentence explaining why this category>"
}

Categories (pick exactly one):
- accessibility — a11y issues: keyboard nav, screen readers, contrast ratios, focus management
- visual-hierarchy — layout / sizing / weight not signaling importance correctly
- design-tokens — hardcoded colors / spacing / sizes instead of using the design token system
- responsive — mobile / tablet breakage, breakpoint issues
- consistency — deviation from established patterns elsewhere in the product
- typography — font choices, sizes, weights, line-height issues
- spacing-layout — padding, margin, grid, alignment problems
- accuracy — output didn't match the PRD / requested behavior / user intent
- performance — slow rendering, inefficient queries, bundle size (code-domain)
- correctness — bugs, wrong logic, broken behavior (code-domain)
- security — XSS, injection, auth bypass, data exposure (code-domain)
- maintainability — hard-to-change code, missing types, no tests (code-domain)
- other — does not fit any category above (use confidence ≤ 0.5)

Pick the SINGLE most relevant category. If feedback truly doesn't fit, use "other" with confidence ≤ 0.5.`;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

/**
 * Classify one feedback entry. Throws on Anthropic error / parse failure
 * so the caller (sync route or cron) can decide whether to fall back to
 * 'pending' or surface the error.
 */
export async function classifyFeedback(env: Env, input: ClassifyInput): Promise<ClassifyResult> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  const userMessage =
    `Domain: ${input.domain}\n` +
    `Severity: ${input.severity}\n\n` +
    `What the user wanted:\n${input.what_user_wanted}\n\n` +
    `What we produced:\n${input.what_we_produced}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLASSIFY_TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!r.ok) {
    const tail = await r.text();
    throw new Error(`Anthropic ${r.status}: ${tail.slice(0, 200)}`);
  }

  const j = (await r.json()) as AnthropicResponse;
  const text = j.content?.[0]?.text ?? "";
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    // Some models occasionally wrap JSON in code fences despite instructions.
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    obj = JSON.parse(stripped);
  }
  if (typeof obj !== "object" || obj === null) {
    throw new Error("classifier returned non-object");
  }
  const o = obj as Record<string, unknown>;
  const category = typeof o.category === "string" && CATEGORIES.has(o.category)
    ? (o.category as FeedbackCategory)
    : "other";
  const confidenceRaw = o.confidence;
  const confidence =
    typeof confidenceRaw === "number" && confidenceRaw >= 0 && confidenceRaw <= 1
      ? confidenceRaw
      : 0.5;
  const reasoning = typeof o.reasoning === "string" ? o.reasoning.slice(0, 500) : "";
  return { category, confidence, reasoning };
}
