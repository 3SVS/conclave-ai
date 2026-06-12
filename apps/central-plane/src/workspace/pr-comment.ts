/**
 * workspace/pr-comment.ts
 *
 * Builds the Markdown body for GitHub PR comments generated from a
 * PR code review run. Deterministic — no LLM.
 *
 * GitHub issue comments support GFM; we keep the body readable both
 * as raw text and rendered markdown.
 */
import type { FetchLike } from "../github.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommentResultItem = {
  itemId: string;
  title: string;
  status: "passed" | "failed" | "inconclusive" | "needs_decision";
  userLabel: string;
  reason: string;
  evidence: string[];
  nextAction: string;
};

export type CommentSummary = {
  failed: number;
  inconclusive: number;
  needsDecision: number;
  passed: number;
};

export type ComparisonDataForComment = {
  previousSummary: { passed: number; failed: number; inconclusive: number; needsDecision: number };
  latestSummary: { passed: number; failed: number; inconclusive: number; needsDecision: number };
  improved: Array<{ itemId: string; title: string; from: string; to: string; reason: string }>;
  stillOpen: Array<{ itemId: string; title: string; status: string; reason: string }>;
  newlyProblematic: Array<{ itemId: string; title: string; from: string; to: string; reason: string }>;
};

export type BuildCommentOptions = {
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  selectedItems: CommentResultItem[];
  summary: CommentSummary;
  includeFixBrief?: boolean;
  fixBriefSummary?: string;
  includeComparison?: boolean;
  comparisonData?: ComparisonDataForComment;
};

export type PostCommentInput = {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
  token: string;
};

export type PostCommentResult =
  | { ok: true; id: string; url: string }
  | { ok: false; error: string; status: number };

const MAX_COMMENT_CHARS = 60000;
const PREVIEW_CHARS = 300;

const STATUS_KO: Record<string, string> = {
  passed: "✅ 통과",
  failed: "❌ 안 맞음",
  inconclusive: "⚠️ 확인 부족",
  needs_decision: "🟣 결정 필요",
};

const STATUS_KO_PLAIN: Record<string, string> = {
  passed: "통과",
  failed: "안 맞음",
  inconclusive: "확인 부족",
  needs_decision: "결정 필요",
};

// ─── Section builders ─────────────────────────────────────────────────────────

function buildRequiredPart(opts: BuildCommentOptions): string {
  const { repoFullName, prNumber, prTitle, selectedItems, summary } = opts;

  const fixable = selectedItems.filter(
    (i) => i.status === "failed" || i.status === "inconclusive" || i.status === "needs_decision",
  );

  const lines: string[] = [
    "## 🔍 Conclave PR 확인 결과",
    "",
    `**저장소:** \`${repoFullName}\`  `,
    `**PR:** #${prNumber} ${prTitle}`,
    "",
    "> 이 코멘트는 연결된 제품 설명서와 선택된 항목 기준으로 생성되었습니다.  ",
    "> 전체 저장소나 배포된 서비스 전체를 확인한 것은 아닙니다.",
    "",
    "### 요약",
    "",
    `| 결과 | 개수 |`,
    `|------|------|`,
    `| ❌ 안 맞음 | ${summary.failed} |`,
    `| ⚠️ 확인 부족 | ${summary.inconclusive} |`,
    `| 🟣 결정 필요 | ${summary.needsDecision} |`,
    `| ✅ 통과 | ${summary.passed} |`,
    "",
  ];

  if (fixable.length === 0) {
    lines.push("### 고쳐야 할 항목", "", "선택된 항목 중 수정이 필요한 항목이 없습니다.", "");
  } else {
    lines.push(`### 고쳐야 할 항목 (${fixable.length}개)`, "");
    for (const item of fixable) {
      lines.push(`#### ${STATUS_KO[item.status] ?? item.status} — ${item.title}`, "");
      lines.push(`**이유:** ${item.reason}`, "");
      if (item.evidence.length > 0) {
        lines.push("**확인 근거:**");
        for (const e of item.evidence) lines.push(`- \`${e}\``);
        lines.push("");
      }
      if (item.nextAction) {
        lines.push(`**다음 단계:** ${item.nextAction}`, "");
      }
      lines.push("---", "");
    }
  }

  return lines.join("\n");
}

function buildCompSummaryPart(data: ComparisonDataForComment): string {
  const { previousSummary: prev, latestSummary: latest } = data;

  const fmt = (from: number, to: number) =>
    from === to ? `${to}개` : `${from}개 → ${to}개`;

  const lines: string[] = [
    "",
    "## 이전/최신 비교",
    "",
    "이 비교는 같은 PR을 다시 확인한 결과를 이전 결과와 비교한 것입니다. 연결된 PR의 변경 내용 기준이며, 전체 저장소나 배포된 서비스 전체를 확인한 것은 아닙니다.",
    "",
    "### 요약",
    "",
    `- 안 맞음: ${fmt(prev.failed, latest.failed)}`,
    `- 확인 부족: ${fmt(prev.inconclusive, latest.inconclusive)}`,
    `- 결정 필요: ${fmt(prev.needsDecision, latest.needsDecision)}`,
    `- 통과: ${fmt(prev.passed, latest.passed)}`,
    "",
  ];

  return lines.join("\n");
}

function buildCompDetailPart(data: ComparisonDataForComment): string {
  const { improved, stillOpen, newlyProblematic } = data;
  if (improved.length === 0 && stillOpen.length === 0 && newlyProblematic.length === 0) return "";

  const lines: string[] = [];

  if (improved.length > 0) {
    lines.push(`### 좋아진 항목 (${improved.length}개)`, "");
    for (const item of improved) {
      lines.push(`- ${item.title}`);
      lines.push(`  - 이전: ${STATUS_KO_PLAIN[item.from] ?? item.from}`);
      lines.push(`  - 최신: ${STATUS_KO_PLAIN[item.to] ?? item.to}`);
      lines.push(`  - 이유: ${item.reason}`);
      lines.push("");
    }
  }

  if (stillOpen.length > 0) {
    lines.push(`### 아직 남은 항목 (${stillOpen.length}개)`, "");
    for (const item of stillOpen) {
      lines.push(`- ${item.title}`);
      lines.push(`  - 상태: ${STATUS_KO_PLAIN[item.status] ?? item.status}`);
      lines.push(`  - 이유: ${item.reason}`);
      lines.push("");
    }
  }

  if (newlyProblematic.length > 0) {
    lines.push(`### 새로 생긴 문제 (${newlyProblematic.length}개)`, "");
    for (const item of newlyProblematic) {
      lines.push(`- ${item.title}`);
      lines.push(`  - 이전: ${STATUS_KO_PLAIN[item.from] ?? item.from}`);
      lines.push(`  - 최신: ${STATUS_KO_PLAIN[item.to] ?? item.to}`);
      lines.push(`  - 이유: ${item.reason}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function buildFixBriefPart(summary: string): string {
  return ["", "### 수정 제안 요약", "", summary, ""].join("\n");
}

function buildFooterPart(): string {
  return [
    "<details>",
    "<summary>이 코멘트에 대하여</summary>",
    "",
    "이 코멘트는 [Conclave](https://conclave-ai.dev)에서 PR 코드 확인 결과를 바탕으로 자동 생성했습니다.  ",
    "이 단계에서는 코드를 자동으로 고치지 않습니다.",
    "",
    "</details>",
  ].join("\n");
}

// ─── Comment body builder ─────────────────────────────────────────────────────

export function buildCommentBody(opts: BuildCommentOptions): {
  body: string;
  truncated: boolean;
  comparisonIncluded: boolean;
} {
  const TRUNCATION = "\n\n> ⚠️ 코멘트가 너무 길어 일부 내용이 잘렸습니다.";

  const required = buildRequiredPart(opts);
  const footer = buildFooterPart();
  const hasComparison = opts.includeComparison === true && opts.comparisonData !== undefined;
  const compSummary = hasComparison ? buildCompSummaryPart(opts.comparisonData!) : "";
  const compDetail = hasComparison ? buildCompDetailPart(opts.comparisonData!) : "";
  const fixBrief =
    opts.includeFixBrief === true && opts.fixBriefSummary
      ? buildFixBriefPart(opts.fixBriefSummary)
      : "";

  const fits = (...parts: string[]) => parts.join("").length <= MAX_COMMENT_CHARS;

  // Priority: required > compSummary > compDetail > fixBrief. Drop from lowest priority first.
  if (fits(required, compSummary, compDetail, fixBrief, footer)) {
    return { body: required + compSummary + compDetail + fixBrief + footer, truncated: false, comparisonIncluded: hasComparison };
  }
  if (fits(required, compSummary, compDetail, footer)) {
    return { body: required + compSummary + compDetail + footer, truncated: false, comparisonIncluded: hasComparison };
  }
  if (fits(required, compSummary, footer)) {
    return { body: required + compSummary + footer, truncated: false, comparisonIncluded: hasComparison };
  }
  if (fits(required, footer)) {
    return { body: required + footer, truncated: false, comparisonIncluded: false };
  }

  // Even the base is too long — truncate
  const base = required + footer;
  const cutAt = MAX_COMMENT_CHARS - TRUNCATION.length;
  return { body: base.slice(0, cutAt) + TRUNCATION, truncated: true, comparisonIncluded: false };
}

// ─── Preview helper ───────────────────────────────────────────────────────────

export function bodyPreview(body: string): string {
  if (body.length <= PREVIEW_CHARS) return body;
  return body.slice(0, PREVIEW_CHARS) + "…";
}

// ─── GitHub Issues Comments API ───────────────────────────────────────────────

export async function postGitHubComment(
  input: PostCommentInput,
  fetchImpl: FetchLike,
): Promise<PostCommentResult> {
  const url = `https://api.github.com/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`;
  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "conclave-ai/1.0",
      },
      body: JSON.stringify({ body: input.body }),
    });
  } catch (err) {
    return { ok: false, error: `network_error: ${(err as Error).message}`, status: 0 };
  }

  if (!resp.ok) {
    // 403 = scope/auth issue, 404 = repo not found or private
    const errBody = await resp.json().catch(() => ({})) as Record<string, unknown>;
    const msg = typeof errBody["message"] === "string" ? errBody["message"] : `HTTP ${resp.status}`;
    return { ok: false, error: msg, status: resp.status };
  }

  const data = await resp.json().catch(() => ({})) as { id?: number; html_url?: string };
  return {
    ok: true,
    id: String(data.id ?? ""),
    url: data.html_url ?? `https://github.com/${input.owner}/${input.repo}/issues/${input.issueNumber}#issuecomment-${data.id ?? ""}`,
  };
}

// ─── GitHub Issues Comments Update API ───────────────────────────────────────

export type UpdateCommentInput = {
  owner: string;
  repo: string;
  githubCommentId: string;
  body: string;
  token: string;
};

export async function updateGitHubComment(
  input: UpdateCommentInput,
  fetchImpl: FetchLike,
): Promise<PostCommentResult> {
  const url = `https://api.github.com/repos/${input.owner}/${input.repo}/issues/comments/${input.githubCommentId}`;
  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "conclave-ai/1.0",
      },
      body: JSON.stringify({ body: input.body }),
    });
  } catch (err) {
    return { ok: false, error: `network_error: ${(err as Error).message}`, status: 0 };
  }

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({})) as Record<string, unknown>;
    const msg = typeof errBody["message"] === "string" ? errBody["message"] : `HTTP ${resp.status}`;
    return { ok: false, error: msg, status: resp.status };
  }

  const data = await resp.json().catch(() => ({})) as { id?: number; html_url?: string };
  return {
    ok: true,
    id: String(data.id ?? input.githubCommentId),
    url: data.html_url ?? `https://github.com/${input.owner}/${input.repo}/issues/comments/${input.githubCommentId}`,
  };
}

// ─── Scope check ─────────────────────────────────────────────────────────────

export function hasPrCommentScope(scopes: string | undefined): boolean {
  if (!scopes) return false;
  const parts = scopes.split(/[\s,]+/);
  return parts.includes("public_repo") || parts.includes("repo");
}
