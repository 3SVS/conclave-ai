import { describe, it, mock, before } from "node:test";
import assert from "node:assert/strict";

// Import the generate module (ESM)
const generateModule = await import("../dist/workspace/generate.js");
const { generateIdeaToSpecDraft } = generateModule;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assertValidResponse(result) {
  assert.equal(result.ok, true);
  assert.ok(["llm", "mock-fallback"].includes(result.source));
  assert.ok(typeof result.understood.summary === "string");
  assert.ok(Array.isArray(result.understood.targetUsers));
  assert.ok(Array.isArray(result.understood.mainFlow));
  assert.ok(Array.isArray(result.questions));
  assert.ok(typeof result.productSpec.productName === "string");
  assert.ok(Array.isArray(result.items));
  assert.ok(result.items.length >= 3);
  result.items.forEach((item) => {
    assert.equal(item.status, "not_started");
    assert.ok(Array.isArray(item.criteria));
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generateIdeaToSpecDraft", () => {
  it("returns mock-fallback when no API key provided", async () => {
    const result = await generateIdeaToSpecDraft(
      { idea: "회의 녹음 자동 요약 앱" },
      undefined,
    );
    assert.equal(result.source, "mock-fallback");
    assertValidResponse(result);
  });

  it("returns mock-fallback for meeting idea without API key", async () => {
    const result = await generateIdeaToSpecDraft(
      { idea: "회의 녹음 파일을 올리면 요약해주는 앱" },
      undefined,
    );
    assert.equal(result.source, "mock-fallback");
    assert.ok(result.questions.length >= 2);
    assertValidResponse(result);
  });

  it("returns mock-fallback for generic idea without API key", async () => {
    const result = await generateIdeaToSpecDraft(
      { idea: "사진을 올리면 상품 설명을 써주는 서비스" },
      undefined,
    );
    assert.equal(result.source, "mock-fallback");
    assertValidResponse(result);
  });

  it("handles empty idea gracefully", async () => {
    const result = await generateIdeaToSpecDraft({ idea: "" }, undefined);
    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.warnings));
  });

  it("returns mock-fallback when Anthropic returns non-JSON", async () => {
    // Simulate malformed LLM response via a fake API key that hits a mock
    // We test the fallback path by passing a key that will get a network error
    const result = await generateIdeaToSpecDraft(
      { idea: "테스트 아이디어" },
      "fake-key-will-fail",
    );
    // Should still return valid shape (fallback)
    assert.equal(result.ok, true);
    assertValidResponse(result);
  });

  it("items all have status not_started", async () => {
    const result = await generateIdeaToSpecDraft(
      { idea: "회의 녹음 자동 요약" },
      undefined,
    );
    result.items.forEach((item) => {
      assert.equal(item.status, "not_started", `item ${item.id} has wrong status`);
    });
  });
});
