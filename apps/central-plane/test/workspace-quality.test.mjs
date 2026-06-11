/**
 * Quality minimum tests for workspace generation.
 *
 * All tests run against mock-fallback (no API key needed).
 * Tests verify:
 *   - Response shape compliance
 *   - No banned developer terms in user-facing text
 *   - Minimum question count (3)
 *   - Minimum item count per fixture
 *   - All items have status: "not_started"
 *   - All questions have required fields
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workspaceIdeaFixtures, BANNED_USER_FACING_TERMS } from "./fixtures/workspace-ideas.mjs";

const { generateIdeaToSpecDraft } = await import("../dist/workspace/generate.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function collectUserFacingText(result) {
  const parts = [
    result.understood.summary,
    ...result.understood.targetUsers,
    ...result.understood.mainFlow,
    ...result.questions.flatMap((q) => [q.question, q.recommendation, q.reason, ...q.options]),
    result.productSpec.productName,
    result.productSpec.oneLine,
    ...result.productSpec.targetUsers,
    result.productSpec.problem,
    ...result.productSpec.included,
    ...result.productSpec.excluded,
    ...result.productSpec.userFlow,
    ...result.productSpec.decisions,
    ...result.productSpec.openQuestions,
    ...result.items.flatMap((item) => [item.title, ...item.criteria]),
    ...(result.warnings ?? []),
  ];
  return parts.join(" ");
}

function assertNoBannedTerms(text, bannedTerms, label) {
  for (const term of bannedTerms) {
    assert.ok(
      !text.includes(term),
      `[${label}] banned term "${term}" found in user-facing text`,
    );
  }
}

function assertValidShape(result, label) {
  assert.equal(result.ok, true, `[${label}] ok should be true`);
  assert.ok(["llm", "mock-fallback"].includes(result.source), `[${label}] invalid source`);

  // understood
  assert.ok(result.understood.summary.length > 0, `[${label}] summary is empty`);
  assert.ok(result.understood.targetUsers.length > 0, `[${label}] targetUsers is empty`);
  assert.ok(result.understood.mainFlow.length > 0, `[${label}] mainFlow is empty`);

  // questions: 3-5
  assert.ok(result.questions.length >= 3, `[${label}] questions < 3 (got ${result.questions.length})`);
  assert.ok(result.questions.length <= 6, `[${label}] questions > 6 (got ${result.questions.length})`);

  // each question has required fields
  for (const q of result.questions) {
    assert.ok(q.question.length > 0, `[${label}] question text is empty`);
    assert.ok(q.recommendation.length > 0, `[${label}] recommendation is empty`);
    assert.ok(q.reason.length > 0, `[${label}] reason is empty`);
    assert.ok(Array.isArray(q.options) && q.options.length >= 2, `[${label}] options < 2`);
  }

  // productSpec
  assert.ok(
    result.productSpec.productName.length > 0 || result.productSpec.oneLine.length > 0,
    `[${label}] productName and oneLine both empty`,
  );
  assert.ok(result.productSpec.problem.length > 0, `[${label}] problem is empty`);
  assert.ok(result.productSpec.included.length > 0, `[${label}] included is empty`);

  // items: status and criteria
  assert.ok(result.items.length >= 3, `[${label}] items < 3`);
  for (const item of result.items) {
    assert.ok(item.title.length > 0, `[${label}] item title is empty`);
    assert.equal(item.status, "not_started", `[${label}] item.status !== "not_started"`);
    assert.ok(Array.isArray(item.criteria), `[${label}] criteria not an array`);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("workspace quality — mock fallback (no API key)", () => {
  for (const fixture of workspaceIdeaFixtures) {
    it(`[${fixture.id}] shape + minimum criteria`, async () => {
      const result = await generateIdeaToSpecDraft({ idea: fixture.idea }, undefined);
      assertValidShape(result, fixture.id);
    });

    it(`[${fixture.id}] no banned developer terms in user-facing text`, async () => {
      const result = await generateIdeaToSpecDraft({ idea: fixture.idea }, undefined);
      const allText = collectUserFacingText(result);
      assertNoBannedTerms(allText, BANNED_USER_FACING_TERMS, fixture.id);
    });

    it(`[${fixture.id}] minimum item count (>= ${fixture.minItems})`, async () => {
      const result = await generateIdeaToSpecDraft({ idea: fixture.idea }, undefined);
      assert.ok(
        result.items.length >= fixture.minItems,
        `[${fixture.id}] items ${result.items.length} < expected ${fixture.minItems}`,
      );
    });
  }

  it("meeting idea: questions include Linear-send decision", async () => {
    const result = await generateIdeaToSpecDraft(
      { idea: "회의 녹음 파일을 올리면 요약하고 Linear로 보내주는 앱" },
      undefined,
    );
    const questionTexts = result.questions.map((q) => q.question).join(" ");
    assert.ok(
      questionTexts.includes("확인") || questionTexts.includes("Linear"),
      "meeting idea should ask about Linear send confirmation",
    );
  });

  it("all items have status: not_started across all fixtures", async () => {
    for (const fixture of workspaceIdeaFixtures) {
      const result = await generateIdeaToSpecDraft({ idea: fixture.idea }, undefined);
      for (const item of result.items) {
        assert.equal(
          item.status,
          "not_started",
          `[${fixture.id}] item "${item.title}" has status ${item.status}`,
        );
      }
    }
  });
});
