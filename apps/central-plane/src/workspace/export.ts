/**
 * workspace/export.ts
 *
 * Deterministic "만들기 패키지" (builder pack) generation.
 * No LLM calls — pure string assembly from structured project data.
 * Produces Markdown files ready for Claude Code or Codex.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportTarget = "claude_code" | "codex" | "both";
export type ExportFormat = "json" | "markdown_bundle";

export type ExportProductSpec = {
  productName: string;
  oneLine: string;
  targetUsers: string[];
  problem: string;
  included: string[];
  excluded: string[];
  userFlow: string[];
  decisions: string[];
  openQuestions: string[];
};

export type ExportItem = {
  id: string;
  title: string;
  status: string;
  criteria: string[];
};

export type ExportCheckResult = {
  itemId: string;
  status: string;
  title: string;
  reason: string;
  evidence: string[];
  nextAction: string;
};

export type ExportCheckResults = {
  results: ExportCheckResult[];
  summary: {
    passed: number;
    failed: number;
    inconclusive: number;
    needsDecision: number;
  };
};

export type ExportFixSuggestion = {
  itemId: string;
  suggestion: {
    plainSummary: string;
    builderBrief: {
      title: string;
      goal: string;
      tasks: string[];
      doneWhen: string[];
      doNotDo: string[];
      verifyBy: string[];
    };
  };
};

export type WorkspaceExportBuilderPackRequest = {
  projectId?: string;
  project?: {
    title: string;
    idea?: string;
    productSpec: ExportProductSpec;
    items: ExportItem[];
    checkResults?: ExportCheckResults;
    fixSuggestions?: Record<string, ExportFixSuggestion>;
  };
  target: ExportTarget;
  format: ExportFormat;
  locale?: "ko" | "en";
};

export type ExportFile = {
  path: string;
  content: string;
};

export type WorkspaceExportBuilderPackResponse = {
  ok: true;
  source: "deterministic";
  bundle: {
    files: ExportFile[];
  };
  summary: {
    fileCount: number;
    recommendedNextStep: string;
  };
};

// ─── Status label mapping ─────────────────────────────────────────────────────

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    passed: "통과",
    failed: "안 맞음",
    inconclusive: "확인 부족",
    needs_decision: "결정 필요",
    not_started: "시작 전",
  };
  return map[status] ?? status;
}

// ─── File generators ──────────────────────────────────────────────────────────

function genReadme(title: string, target: ExportTarget): string {
  const lines = [
    `# 만들기 패키지 — ${title}`,
    "",
    "이 패키지는 Conclave Workspace에서 내보낸 제품 설명서와 개발 지시서입니다.",
    "",
    "## 개발 AI에 넘기는 방법",
    "",
  ];

  if (target !== "codex") {
    lines.push("### Claude Code 사용 시");
    lines.push(
      "`CLAUDE_CODE_PROMPT.md` 파일 내용을 복사해서 Claude Code 대화창에 붙여넣으세요.",
    );
    lines.push("");
  }
  if (target !== "claude_code") {
    lines.push("### Codex 사용 시");
    lines.push(
      "`CODEX_PROMPT.md` 파일 내용을 복사해서 Codex 대화창에 붙여넣으세요.",
    );
    lines.push("");
  }

  lines.push(
    "## 읽어야 할 파일 순서",
    "",
    "1. `product.md` — 제품 설명서 (무엇을 만드는지)",
    "2. `items.md` — 꼭 들어가야 할 항목 (무엇을 구현해야 하는지)",
    "3. `checks.md` — 확인 결과 (어떤 항목에 문제가 있는지)",
    "4. `fixes.md` — 고쳐야 할 항목 (어떻게 고쳐야 하는지)",
    "",
    "## 주의사항",
    "",
    "- 범위를 벗어난 기능은 구현하지 마세요.",
    "- 확인 결과는 제품 설명서 기준의 사전 점검입니다. 실제 코드나 GitHub PR을 확인한 결과가 아닙니다.",
    "- 애매한 점이 있으면 구현 전에 질문하세요.",
  );

  return lines.join("\n");
}

function genProductMd(spec: ExportProductSpec): string {
  const sections: string[] = [
    `# 제품 설명서 — ${spec.productName}`,
    "",
    spec.oneLine,
  ];

  if (spec.targetUsers.length > 0) {
    sections.push(
      "",
      "## 누가 쓰는 제품",
      "",
      ...spec.targetUsers.map((u) => `- ${u}`),
    );
  }

  sections.push("", "## 해결하려는 문제", "", spec.problem);

  if (spec.included.length > 0) {
    sections.push(
      "",
      "## 이번 버전에 포함",
      "",
      ...spec.included.map((i) => `- ${i}`),
    );
  }

  if (spec.excluded.length > 0) {
    sections.push(
      "",
      "## 이번 버전에서 제외",
      "",
      ...spec.excluded.map((e) => `- ~~${e}~~`),
    );
  }

  if (spec.userFlow.length > 0) {
    sections.push(
      "",
      "## 사용자 흐름",
      "",
      ...spec.userFlow.map((f, i) => `${i + 1}. ${f}`),
    );
  }

  if (spec.decisions.length > 0) {
    sections.push(
      "",
      "## 결정된 사항",
      "",
      ...spec.decisions.map((d) => `- ${d}`),
    );
  }

  if (spec.openQuestions.length > 0) {
    sections.push(
      "",
      "## 아직 결정이 필요한 사항",
      "",
      ...spec.openQuestions.map((q) => `- [ ] ${q}`),
    );
  }

  return sections.join("\n");
}

function genItemsMd(items: ExportItem[]): string {
  if (items.length === 0) {
    return "# 꼭 들어가야 할 항목\n\n항목이 없습니다.";
  }

  const lines = ["# 꼭 들어가야 할 항목", ""];

  for (const item of items) {
    lines.push(`## ${item.title}`);
    lines.push(`**상태:** ${statusLabel(item.status)}`);
    if (item.criteria.length > 0) {
      lines.push("", "**완성 기준:**", "");
      for (const c of item.criteria) {
        lines.push(`- [ ] ${c}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function genChecksMd(checkResults?: ExportCheckResults): string {
  const disclaimer =
    "> **안내:** 이 확인 결과는 제품 설명서 기준의 사전 점검입니다. 아직 실제 코드나 GitHub PR을 확인한 결과가 아닙니다.";

  if (!checkResults || checkResults.results.length === 0) {
    return [
      "# 확인 결과",
      "",
      disclaimer,
      "",
      "확인 결과가 없습니다. Conclave Workspace에서 확인을 실행해주세요.",
    ].join("\n");
  }

  const { summary, results } = checkResults;
  const lines = ["# 확인 결과", "", disclaimer, ""];

  lines.push(
    "## 요약",
    "",
    "| 통과 | 안 맞음 | 확인 부족 | 결정 필요 |",
    "|------|---------|-----------|----------|",
    `| ${summary.passed} | ${summary.failed} | ${summary.inconclusive} | ${summary.needsDecision} |`,
    "",
  );

  const order = ["passed", "failed", "inconclusive", "needs_decision"];
  const grouped = new Map<string, ExportCheckResult[]>();
  for (const r of results) {
    if (!grouped.has(r.status)) grouped.set(r.status, []);
    grouped.get(r.status)!.push(r);
  }

  for (const status of order) {
    const group = grouped.get(status);
    if (!group || group.length === 0) continue;
    lines.push(`## ${statusLabel(status)} (${group.length}개)`, "");
    for (const r of group) {
      lines.push(`### ${r.title}`, "");
      lines.push(`**이유:** ${r.reason}`, "");
      if (r.evidence.length > 0) {
        lines.push("**확인 근거:**", "");
        for (const e of r.evidence) lines.push(`- ${e}`);
        lines.push("");
      }
      if (r.status !== "passed" && r.nextAction) {
        lines.push(`**다음 행동:** ${r.nextAction}`, "");
      }
    }
  }

  return lines.join("\n");
}

function genFixesMd(
  items: ExportItem[],
  fixSuggestions?: Record<string, ExportFixSuggestion>,
): string {
  const needsFix = items.filter(
    (i) =>
      i.status === "failed" ||
      i.status === "inconclusive" ||
      i.status === "needs_decision",
  );

  if (needsFix.length === 0) {
    return "# 고쳐야 할 항목\n\n모든 항목이 통과됐습니다.";
  }

  const lines = ["# 고쳐야 할 항목", ""];

  for (const item of needsFix) {
    const fix = fixSuggestions?.[item.id];
    lines.push(`## ${item.title}`);
    lines.push(`**상태:** ${statusLabel(item.status)}`, "");

    if (fix) {
      const { plainSummary, builderBrief } = fix.suggestion;
      lines.push("### 수정 제안", "", plainSummary, "");
      lines.push(`### 개발 AI에게 줄 작업 지시`, "");
      lines.push(`**${builderBrief.title}**`, "");
      lines.push(`**목표:** ${builderBrief.goal}`, "");

      if (builderBrief.tasks.length > 0) {
        lines.push("**해야 할 작업:**", "");
        for (const t of builderBrief.tasks) lines.push(`- ${t}`);
        lines.push("");
      }
      if (builderBrief.doneWhen.length > 0) {
        lines.push("**완료 기준:**", "");
        for (const d of builderBrief.doneWhen) lines.push(`- [ ] ${d}`);
        lines.push("");
      }
      if (builderBrief.doNotDo.length > 0) {
        lines.push("**하지 말아야 할 것:**", "");
        for (const d of builderBrief.doNotDo) lines.push(`- ${d}`);
        lines.push("");
      }
    } else {
      lines.push(
        "> 아직 수정 제안이 없습니다. Conclave Workspace에서 고쳐보기를 실행해주세요.",
        "",
      );
    }
  }

  return lines.join("\n");
}

function genClaudeCodePrompt(
  title: string,
  items: ExportItem[],
): string {
  const todoItems = items.filter((i) => i.status !== "passed");
  const itemList =
    todoItems.length > 0
      ? todoItems.map((i) => `- [ ] ${i.title}`).join("\n")
      : items.map((i) => `- [ ] ${i.title}`).join("\n");

  return [
    `# Claude Code용 지시서 — ${title}`,
    "",
    "이 파일 내용을 Claude Code 대화창에 그대로 붙여넣으세요.",
    "",
    "---",
    "",
    "## 지시사항",
    "",
    "1. 먼저 다음 파일을 읽어라:",
    "   - `product.md` — 제품 설명서",
    "   - `items.md` — 꼭 들어가야 할 항목과 완성 기준",
    "   - `checks.md` — 확인 결과",
    "   - `fixes.md` — 고쳐야 할 항목",
    "",
    "2. 전체 제품을 한 번에 만들지 말고, 아래 목록에서 **지금 구현할 항목 하나**를 선택해서 구현하라.",
    "",
    "3. 범위를 벗어난 기능은 구현하지 마라. `product.md`의 '이번 버전에서 제외' 항목은 절대 구현하지 않는다.",
    "",
    "4. 애매한 점이 있으면 코드 작성 전에 질문하라.",
    "",
    "5. 구현 후 `items.md`의 완성 기준을 기준으로 스스로 확인하라.",
    "",
    "6. 완료 시 다음 형식으로 보고하라:",
    "   - 변경한 파일 목록",
    "   - 완료한 항목",
    "   - 실행한 테스트",
    "   - 남은 위험 또는 불확실한 부분",
    "",
    "## 구현할 항목 목록",
    "",
    itemList,
  ].join("\n");
}

function genCodexPrompt(
  title: string,
  spec: ExportProductSpec,
  items: ExportItem[],
  fixSuggestions?: Record<string, ExportFixSuggestion>,
): string {
  const todoItems = items.filter((i) => i.status !== "passed");

  const tasksLines: string[] = [];
  for (const item of todoItems.length > 0 ? todoItems : items) {
    tasksLines.push(`- ${item.title}`);
    const fix = fixSuggestions?.[item.id];
    if (fix?.suggestion.builderBrief.tasks.length) {
      for (const t of fix.suggestion.builderBrief.tasks) {
        tasksLines.push(`  - ${t}`);
      }
    }
  }

  const doneWhenLines: string[] = [];
  for (const item of todoItems.length > 0 ? todoItems : items) {
    const fix = fixSuggestions?.[item.id];
    const criteria = fix?.suggestion.builderBrief.doneWhen.length
      ? fix.suggestion.builderBrief.doneWhen
      : item.criteria;
    for (const d of criteria) doneWhenLines.push(`- [ ] ${d}`);
  }
  if (doneWhenLines.length === 0) {
    doneWhenLines.push("- (완성 기준을 items.md에서 확인하세요)");
  }

  const doNotDoLines: string[] = spec.excluded.map(
    (e) => `- ${e}을(를) 구현하지 마세요`,
  );
  for (const fix of Object.values(fixSuggestions ?? {})) {
    for (const d of fix.suggestion.builderBrief.doNotDo) {
      doNotDoLines.push(`- ${d}`);
    }
  }

  return [
    `# Codex용 지시서 — ${title}`,
    "",
    "이 파일 내용을 Codex 대화창에 그대로 붙여넣으세요.",
    "",
    "---",
    "",
    "## Goal",
    "",
    spec.oneLine,
    "",
    "## Context",
    "",
    `제품: ${spec.productName}`,
    `대상 사용자: ${spec.targetUsers.join(", ") || "미정"}`,
    `핵심 문제: ${spec.problem}`,
    "",
    "이번 버전에 포함할 기능:",
    ...spec.included.map((i) => `- ${i}`),
    "",
    "## Constraints",
    "",
    "- 이번 버전 범위의 기능만 구현한다.",
    "- 아래 'Do not do' 항목은 절대 구현하지 않는다.",
    "- 애매한 부분이 있으면 코드 작성 전에 명확하게 정의하라.",
    "- 기존 코드베이스가 있다면 기존 패턴을 따른다.",
    "",
    "## Tasks",
    "",
    ...(tasksLines.length > 0 ? tasksLines : ["- (items.md 참고)"]),
    "",
    "## Done when",
    "",
    ...doneWhenLines,
    "",
    "## Do not do",
    "",
    ...(doNotDoLines.length > 0
      ? doNotDoLines
      : ["- (product.md의 이번 버전 제외 항목을 확인하세요)"]),
    "",
    "## Verify by",
    "",
    "- 각 항목의 완성 기준(items.md)을 기준으로 직접 확인한다.",
    "- 범위 밖 기능이 포함되지 않았는지 확인한다.",
    "- 아직 결정이 필요한 사항(product.md)이 구현에 영향을 미치지 않았는지 확인한다.",
    "",
    "## Final response format",
    "",
    "완료 시 다음 형식으로 보고하라:",
    "",
    "```",
    "완료한 항목:",
    "- [항목명]",
    "",
    "변경한 파일:",
    "- [파일명]",
    "",
    "실행한 테스트:",
    "- [테스트명]",
    "",
    "남은 위험:",
    "- [위험 항목 또는 없음]",
    "```",
  ].join("\n");
}

// ─── Main export function ─────────────────────────────────────────────────────

export function generateBuilderPack(
  req: WorkspaceExportBuilderPackRequest,
): WorkspaceExportBuilderPackResponse {
  const project = req.project;
  if (!project) {
    return {
      ok: true,
      source: "deterministic",
      bundle: { files: [] },
      summary: { fileCount: 0, recommendedNextStep: "project 데이터를 포함해서 다시 요청해주세요." },
    };
  }

  const { title, productSpec, items, checkResults, fixSuggestions } = project;
  const target = req.target;

  const baseFiles: ExportFile[] = [
    { path: "conclave-build-pack/README.md", content: genReadme(title, target) },
    { path: "conclave-build-pack/product.md", content: genProductMd(productSpec) },
    { path: "conclave-build-pack/items.md", content: genItemsMd(items) },
    { path: "conclave-build-pack/checks.md", content: genChecksMd(checkResults) },
    { path: "conclave-build-pack/fixes.md", content: genFixesMd(items, fixSuggestions) },
  ];

  if (target !== "codex") {
    baseFiles.push({
      path: "conclave-build-pack/CLAUDE_CODE_PROMPT.md",
      content: genClaudeCodePrompt(title, items),
    });
  }
  if (target !== "claude_code") {
    baseFiles.push({
      path: "conclave-build-pack/CODEX_PROMPT.md",
      content: genCodexPrompt(title, productSpec, items, fixSuggestions),
    });
  }

  const hasIssues =
    checkResults &&
    (checkResults.summary.failed > 0 ||
      checkResults.summary.inconclusive > 0 ||
      checkResults.summary.needsDecision > 0);

  const recommendedNextStep = hasIssues
    ? "fixes.md에서 고쳐야 할 항목을 확인하고, 해당 지시서를 개발 AI에 넘기세요."
    : "CLAUDE_CODE_PROMPT.md 또는 CODEX_PROMPT.md를 복사해서 개발 AI에 붙여넣으세요.";

  return {
    ok: true,
    source: "deterministic",
    bundle: { files: baseFiles },
    summary: { fileCount: baseFiles.length, recommendedNextStep },
  };
}
