import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BANNED_USER_FACING_TERMS } from "./fixtures/workspace-ideas.mjs";

const { generateBuilderPack } = await import("../dist/workspace/export.js");

const MOCK_SPEC = {
  productName: "회의록 자동 요약 앱",
  oneLine: "회의를 녹음하면 요약과 할 일이 자동으로 정리됩니다",
  targetUsers: ["회의가 많은 팀"],
  problem: "회의 후 내용 정리에 시간이 많이 걸립니다.",
  included: ["녹음 파일 업로드", "STT 변환", "요약 생성", "할 일 추출"],
  excluded: ["실시간 녹음", "화상 회의 연동", "번역"],
  userFlow: ["파일 업로드", "변환·요약", "확인"],
  decisions: ["사용자가 확인한 할 일만 전송"],
  openQuestions: ["파일 크기 상한선 결정 필요"],
};

const MOCK_ITEMS = [
  { id: "req_001", title: "녹음 파일을 올릴 수 있어야 함", status: "not_started", criteria: ["mp3 지원"] },
  { id: "req_002", title: "텍스트로 변환되어야 함", status: "failed", criteria: [] },
  { id: "req_003", title: "요약이 생성되어야 함", status: "inconclusive", criteria: ["요약 길이 명시"] },
];

const MOCK_CHECK_RESULTS = {
  results: [
    { itemId: "req_001", status: "passed", title: "녹음 파일을 올릴 수 있어야 함", reason: "포함 기능과 일치합니다.", evidence: ["포함 목록에 있음"], nextAction: "" },
    { itemId: "req_002", status: "failed", title: "텍스트로 변환되어야 함", reason: "완성 기준이 없습니다.", evidence: [], nextAction: "완성 기준을 추가하세요." },
  ],
  summary: { passed: 1, failed: 1, inconclusive: 0, needsDecision: 0 },
};

const MOCK_FIX = {
  req_002: {
    itemId: "req_002",
    suggestion: {
      plainSummary: "완성 기준을 추가하면 됩니다.",
      builderBrief: {
        title: "STT 변환 완성 기준 추가",
        goal: "STT 결과를 검증할 수 있도록 완성 기준을 추가한다.",
        tasks: ["완성 기준 항목을 추가한다"],
        doneWhen: ["텍스트 변환 결과가 화면에 표시된다"],
        doNotDo: ["번역 기능은 포함하지 않는다"],
        verifyBy: ["변환 결과 확인"],
      },
    },
  },
};

function makeReq(target, overrides = {}) {
  return {
    project: {
      title: MOCK_SPEC.productName,
      productSpec: MOCK_SPEC,
      items: MOCK_ITEMS,
      ...overrides,
    },
    target,
    format: "json",
    locale: "ko",
  };
}

describe("workspace export-builder-pack", () => {
  it("returns ok:true and files array", () => {
    const res = generateBuilderPack(makeReq("both"));
    assert.equal(res.ok, true);
    assert.equal(res.source, "deterministic");
    assert.ok(Array.isArray(res.bundle.files));
    assert.ok(res.bundle.files.length > 0);
    assert.ok(res.summary.fileCount === res.bundle.files.length);
  });

  it("claude_code target includes CLAUDE_CODE_PROMPT.md, not CODEX_PROMPT.md", () => {
    const res = generateBuilderPack(makeReq("claude_code"));
    const paths = res.bundle.files.map((f) => f.path);
    assert.ok(paths.some((p) => p.endsWith("CLAUDE_CODE_PROMPT.md")), "CLAUDE_CODE_PROMPT.md missing");
    assert.ok(!paths.some((p) => p.endsWith("CODEX_PROMPT.md")), "CODEX_PROMPT.md should not be present");
  });

  it("codex target includes CODEX_PROMPT.md, not CLAUDE_CODE_PROMPT.md", () => {
    const res = generateBuilderPack(makeReq("codex"));
    const paths = res.bundle.files.map((f) => f.path);
    assert.ok(paths.some((p) => p.endsWith("CODEX_PROMPT.md")), "CODEX_PROMPT.md missing");
    assert.ok(!paths.some((p) => p.endsWith("CLAUDE_CODE_PROMPT.md")), "CLAUDE_CODE_PROMPT.md should not be present");
  });

  it("both target includes both prompt files", () => {
    const res = generateBuilderPack(makeReq("both"));
    const paths = res.bundle.files.map((f) => f.path);
    assert.ok(paths.some((p) => p.endsWith("CLAUDE_CODE_PROMPT.md")), "CLAUDE_CODE_PROMPT.md missing");
    assert.ok(paths.some((p) => p.endsWith("CODEX_PROMPT.md")), "CODEX_PROMPT.md missing");
  });

  it("product.md includes product name", () => {
    const res = generateBuilderPack(makeReq("both"));
    const productFile = res.bundle.files.find((f) => f.path.endsWith("product.md"));
    assert.ok(productFile, "product.md missing");
    assert.ok(productFile.content.includes(MOCK_SPEC.productName), "product name not found in product.md");
  });

  it("checks.md includes 사전 점검 안내", () => {
    const res = generateBuilderPack(makeReq("both", { checkResults: MOCK_CHECK_RESULTS }));
    const checksFile = res.bundle.files.find((f) => f.path.endsWith("checks.md"));
    assert.ok(checksFile, "checks.md missing");
    assert.ok(checksFile.content.includes("사전 점검"), "사전 점검 안내 not found in checks.md");
    assert.ok(checksFile.content.includes("실제 코드"), "실제 코드 disclaimer not found");
  });

  it("checks.md without results still includes 사전 점검 안내", () => {
    const res = generateBuilderPack(makeReq("both"));
    const checksFile = res.bundle.files.find((f) => f.path.endsWith("checks.md"));
    assert.ok(checksFile, "checks.md missing");
    assert.ok(checksFile.content.includes("사전 점검"), "안내 missing even without results");
  });

  it("fixes.md includes fix suggestion when provided", () => {
    const res = generateBuilderPack(makeReq("both", { checkResults: MOCK_CHECK_RESULTS, fixSuggestions: MOCK_FIX }));
    const fixFile = res.bundle.files.find((f) => f.path.endsWith("fixes.md"));
    assert.ok(fixFile, "fixes.md missing");
    assert.ok(fixFile.content.includes("완성 기준을 추가하면 됩니다"), "fix summary not in fixes.md");
  });

  it("all files use conclave-build-pack/ path prefix", () => {
    const res = generateBuilderPack(makeReq("both"));
    for (const f of res.bundle.files) {
      assert.ok(f.path.startsWith("conclave-build-pack/"), `${f.path} does not start with conclave-build-pack/`);
    }
  });

  it("no banned developer terms in generated file content", () => {
    const res = generateBuilderPack(makeReq("both", { checkResults: MOCK_CHECK_RESULTS, fixSuggestions: MOCK_FIX }));
    for (const file of res.bundle.files) {
      for (const term of BANNED_USER_FACING_TERMS) {
        assert.ok(
          !file.content.includes(term),
          `Banned term "${term}" found in ${file.path}`,
        );
      }
    }
  });

  it("returns empty files when no project provided", () => {
    const res = generateBuilderPack({ target: "both", format: "json" });
    assert.equal(res.ok, true);
    assert.equal(res.bundle.files.length, 0);
  });

  it("CLAUDE_CODE_PROMPT.md contains all 6 required instructions", () => {
    const res = generateBuilderPack(makeReq("claude_code"));
    const file = res.bundle.files.find((f) => f.path.endsWith("CLAUDE_CODE_PROMPT.md"));
    assert.ok(file, "file missing");
    // 6 numbered instructions
    assert.ok(file.content.includes("1."), "instruction 1 missing");
    assert.ok(file.content.includes("2."), "instruction 2 missing");
    assert.ok(file.content.includes("완성 기준"), "완성 기준 instruction missing");
    assert.ok(file.content.includes("범위를 벗어난"), "scope constraint missing");
    assert.ok(file.content.includes("질문"), "ask-before-code instruction missing");
    assert.ok(file.content.includes("보고"), "report instruction missing");
  });

  it("CODEX_PROMPT.md has all required sections", () => {
    const res = generateBuilderPack(makeReq("codex"));
    const file = res.bundle.files.find((f) => f.path.endsWith("CODEX_PROMPT.md"));
    assert.ok(file, "file missing");
    assert.ok(file.content.includes("## Goal"), "Goal section missing");
    assert.ok(file.content.includes("## Context"), "Context section missing");
    assert.ok(file.content.includes("## Constraints"), "Constraints section missing");
    assert.ok(file.content.includes("## Done when"), "Done when section missing");
    assert.ok(file.content.includes("## Do not do"), "Do not do section missing");
    assert.ok(file.content.includes("## Verify by"), "Verify by section missing");
    assert.ok(file.content.includes("## Final response format"), "Final response format section missing");
  });
});
