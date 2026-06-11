import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BANNED_USER_FACING_TERMS } from "./fixtures/workspace-ideas.mjs";

const { generateFixSuggestion } = await import("../dist/workspace/fix.js");

const FAILED_ITEM = {
  id: "req_003",
  title: "실시간 녹음 기능을 제공해야 함",
  status: "failed",
  criteria: ["실시간 마이크 입력"],
};

const INCONCLUSIVE_ITEM = {
  id: "req_002",
  title: "업로드된 녹음을 텍스트로 바꿔야 함",
  status: "inconclusive",
  criteria: [],
};

const DECISION_ITEM = {
  id: "req_004",
  title: "파일 크기 상한선을 안내해야 함",
  status: "needs_decision",
  criteria: ["파일 크기 제한 안내"],
};

const CHECK_RESULT = {
  reason: "이 항목은 제외 범위에 있는 기능입니다.",
  evidence: ["실시간 녹음 — 이번 버전에서 제외"],
  nextAction: "제품 설명서의 포함/제외 범위를 확인하세요.",
};

const MOCK_SPEC = {
  productName: "회의록 자동 요약 앱",
  excluded: ["실시간 녹음"],
  openQuestions: ["파일 크기 상한선 결정 필요"],
};

describe("workspace fix-suggestion", () => {
  it("returns expected shape for failed item (mock fallback)", async () => {
    const result = await generateFixSuggestion(
      { item: FAILED_ITEM , checkResult: CHECK_RESULT, productSpec: MOCK_SPEC },
      undefined,
    );
    assert.equal(result.ok, true);
    assert.equal(result.itemId, "req_003");
    assert.ok(typeof result.suggestion.plainSummary === "string" && result.suggestion.plainSummary.length > 0);
    assert.ok(result.suggestion.productSpecPatch !== undefined);
    assert.ok(Array.isArray(result.suggestion.productSpecPatch.addDecisions));
    assert.ok(result.suggestion.builderBrief !== undefined);
    assert.ok(typeof result.suggestion.builderBrief.title === "string");
    assert.ok(Array.isArray(result.suggestion.builderBrief.tasks));
    assert.ok(Array.isArray(result.suggestion.builderBrief.doneWhen));
    assert.ok(Array.isArray(result.suggestion.builderBrief.doNotDo));
    assert.ok(Array.isArray(result.suggestion.builderBrief.verifyBy));
  });

  it("failed item: builderBrief has tasks and doNotDo", async () => {
    const result = await generateFixSuggestion(
      { item: FAILED_ITEM , checkResult: CHECK_RESULT, productSpec: MOCK_SPEC },
      undefined,
    );
    assert.ok(result.suggestion.builderBrief.tasks.length > 0, "tasks should not be empty");
    assert.ok(result.suggestion.builderBrief.doNotDo.length > 0, "doNotDo should not be empty");
  });

  it("inconclusive item: productSpecPatch.addCriteria is populated", async () => {
    const result = await generateFixSuggestion(
      { item: INCONCLUSIVE_ITEM , checkResult: { reason: "완성 기준이 없습니다.", evidence: [], nextAction: "완성 기준을 추가하세요." }, productSpec: MOCK_SPEC },
      undefined,
    );
    assert.ok(result.suggestion.productSpecPatch.addCriteria.length > 0, "addCriteria should be populated for inconclusive");
  });

  it("needs_decision item: addOpenQuestions is populated", async () => {
    const result = await generateFixSuggestion(
      { item: DECISION_ITEM , checkResult: { reason: "결정이 필요합니다.", evidence: [], nextAction: "결정하세요." }, productSpec: MOCK_SPEC },
      undefined,
    );
    assert.ok(result.suggestion.productSpecPatch.addOpenQuestions.length > 0, "addOpenQuestions should be populated");
  });

  it("no banned developer terms in suggestion text", async () => {
    const result = await generateFixSuggestion(
      { item: FAILED_ITEM , checkResult: CHECK_RESULT, productSpec: MOCK_SPEC },
      undefined,
    );
    const allText = [
      result.suggestion.plainSummary,
      result.suggestion.builderBrief.title,
      result.suggestion.builderBrief.goal,
      ...result.suggestion.builderBrief.context,
      ...result.suggestion.builderBrief.tasks,
      ...result.suggestion.builderBrief.doneWhen,
      ...result.suggestion.builderBrief.doNotDo,
      ...result.suggestion.builderBrief.verifyBy,
      ...result.suggestion.productSpecPatch.addDecisions,
      ...result.suggestion.productSpecPatch.addCriteria,
    ].join(" ");
    for (const term of BANNED_USER_FACING_TERMS) {
      assert.ok(!allText.includes(term), `banned term "${term}" in fix suggestion`);
    }
  });
});
