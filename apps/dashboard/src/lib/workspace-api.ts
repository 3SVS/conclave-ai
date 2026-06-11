/**
 * Dashboard-side API client for the central-plane workspace endpoint.
 * Falls back to local mock generators on network error or API failure
 * so the user-facing flow never breaks.
 */

import type { IdeaToSpecDraftResponse } from "./workspace-types";
import {
  generateUnderstanding,
  generateQuestions,
  generateSpec,
  generateRequirements,
} from "./mock-generators";

export type { IdeaToSpecDraftResponse };

// Configurable in `.env.local` for local development:
//   NEXT_PUBLIC_CENTRAL_PLANE_URL=http://localhost:8787
const CENTRAL_PLANE_URL =
  process.env.NEXT_PUBLIC_CENTRAL_PLANE_URL ??
  "https://conclave-ai.seunghunbae.workers.dev";

export type WorkspaceApiInput = {
  idea: string;
  answers?: Array<{ questionId: string; answer: string }>;
};

export type WorkspaceApiResult =
  | { ok: true; data: IdeaToSpecDraftResponse }
  | { ok: false; error: string; fallback: IdeaToSpecDraftResponse };

/**
 * Call central-plane /workspace/idea-to-spec-draft.
 * On any failure, transparently falls back to local mock generators.
 */
export async function callWorkspaceApi(
  input: WorkspaceApiInput,
): Promise<WorkspaceApiResult> {
  const url = `${CENTRAL_PLANE_URL}/workspace/idea-to-spec-draft`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idea: input.idea,
        answers: input.answers ?? [],
        locale: "ko",
        mode: "standard",
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as IdeaToSpecDraftResponse;
    if (!data.ok) throw new Error("server returned ok:false");

    return { ok: true, data };
  } catch (err) {
    console.warn("[workspace-api] falling back to mock:", err);
    return { ok: false, error: String(err), fallback: buildLocalFallback(input) };
  }
}

function buildLocalFallback(input: WorkspaceApiInput): IdeaToSpecDraftResponse {
  const answersMap: Record<string, string> = Object.fromEntries(
    (input.answers ?? []).map((a) => [a.questionId, a.answer]),
  );

  const understood = generateUnderstanding(input.idea);
  const questions = generateQuestions(input.idea);
  const spec = generateSpec(input.idea, answersMap);
  const reqs = generateRequirements(input.idea, answersMap);

  return {
    ok: true,
    source: "mock-fallback",
    understood,
    questions: questions.map((q) => ({
      id: q.id,
      question: q.question,
      recommendation: q.recommendation,
      reason: q.recommendationReason,
      options: q.options.map((o) => o.label),
      allowCustom: true,
      allowLater: true,
    })),
    productSpec: {
      productName: spec.productName,
      oneLine: spec.tagline,
      targetUsers: [spec.targetUser],
      problem: spec.problem,
      included: spec.included,
      excluded: spec.excluded,
      userFlow: spec.userFlows,
      decisions: spec.decisions,
      openQuestions: spec.openDecisions,
    },
    items: reqs.map((r) => ({
      id: r.id,
      title: r.title,
      status: "not_started",
      criteria: [],
    })),
    warnings: ["임시 초안으로 보여드리고 있어요. 다시 시도하면 더 맞춤형으로 만들 수 있습니다."],
  };
}
