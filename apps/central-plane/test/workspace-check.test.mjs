import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BANNED_USER_FACING_TERMS } from "./fixtures/workspace-ideas.mjs";

const { generateCheckDraft } = await import("../dist/workspace/check.js");

const MEETING_SPEC = {
  productName: "회의록 자동 요약 앱",
  oneLine: "회의를 녹음하면 요약과 할 일이 자동으로 정리됩니다",
  targetUsers: ["회의가 많은 팀"],
  problem: "회의 후 내용 정리에 시간이 많이 걸립니다.",
  included: ["녹음 파일 업로드", "STT 변환", "요약 생성", "할 일 추출", "Linear 전송"],
  excluded: ["실시간 녹음", "화상 회의 연동", "번역"],
  userFlow: ["파일 업로드", "변환·요약", "확인", "전송"],
  decisions: ["사용자가 확인한 할 일만 Linear로 전송"],
  openQuestions: ["파일 크기 상한선 결정 필요"],
};

const ITEMS = [
  { id: "req_001", title: "녹음 파일을 올릴 수 있어야 함", status: "not_started", criteria: ["mp3 지원", "오류 시 안내 메시지 표시"] },
  { id: "req_002", title: "업로드된 녹음을 텍스트로 바꿔야 함", status: "not_started", criteria: [] },
  { id: "req_003", title: "실시간 녹음 기능을 제공해야 함", status: "not_started", criteria: ["실시간 마이크 입력"] },
  { id: "req_004", title: "파일 크기 상한선을 안내해야 함", status: "not_started", criteria: ["파일 크기 제한 안내"] },
  { id: "req_005", title: "사용자는 본인 회의록만 볼 수 있어야 함", status: "not_started", criteria: ["본인만 접근"] },
];

describe("workspace check-draft", () => {
  it("returns expected shape (mock fallback)", async () => {
    const result = await generateCheckDraft({ productSpec: MEETING_SPEC, items: ITEMS }, undefined);
    assert.equal(result.ok, true);
    assert.ok(["llm", "mock-fallback"].includes(result.source));
    assert.equal(typeof result.summary.passed, "number");
    assert.equal(typeof result.summary.failed, "number");
    assert.equal(typeof result.summary.inconclusive, "number");
    assert.equal(typeof result.summary.needsDecision, "number");
    assert.ok(Array.isArray(result.results));
    assert.equal(result.results.length, ITEMS.length);
  });

  it("excluded feature item becomes failed", async () => {
    const result = await generateCheckDraft({ productSpec: MEETING_SPEC, items: ITEMS }, undefined);
    const realtime = result.results.find((r) => r.itemId === "req_003");
    assert.ok(realtime, "req_003 should be in results");
    assert.equal(realtime.status, "failed", `expected failed, got ${realtime.status}: ${realtime.reason}`);
    assert.equal(realtime.userLabel, "안 맞음");
  });

  it("item with no criteria becomes inconclusive", async () => {
    const result = await generateCheckDraft({ productSpec: MEETING_SPEC, items: ITEMS }, undefined);
    const stt = result.results.find((r) => r.itemId === "req_002");
    assert.ok(stt, "req_002 should be in results");
    assert.equal(stt.status, "inconclusive", `expected inconclusive, got ${stt.status}`);
    assert.equal(stt.userLabel, "확인 부족");
  });

  it("open question linked item becomes needs_decision", async () => {
    const result = await generateCheckDraft({ productSpec: MEETING_SPEC, items: ITEMS }, undefined);
    const sizeItem = result.results.find((r) => r.itemId === "req_004");
    assert.ok(sizeItem, "req_004 should be in results");
    assert.equal(sizeItem.status, "needs_decision", `expected needs_decision, got ${sizeItem.status}`);
    assert.equal(sizeItem.userLabel, "결정 필요");
  });

  it("item with 2+ criteria and no excluded match defaults to passed", async () => {
    const result = await generateCheckDraft({ productSpec: MEETING_SPEC, items: ITEMS }, undefined);
    const upload = result.results.find((r) => r.itemId === "req_001");
    assert.ok(upload, "req_001 should be in results");
    assert.equal(upload.status, "passed", `expected passed, got ${upload.status}: ${upload.reason}`);
    assert.equal(upload.userLabel, "통과");
  });

  it("summary counts match results", async () => {
    const result = await generateCheckDraft({ productSpec: MEETING_SPEC, items: ITEMS }, undefined);
    const actual = {
      passed: result.results.filter((r) => r.status === "passed").length,
      failed: result.results.filter((r) => r.status === "failed").length,
      inconclusive: result.results.filter((r) => r.status === "inconclusive").length,
      needsDecision: result.results.filter((r) => r.status === "needs_decision").length,
    };
    assert.deepEqual(result.summary, actual);
  });

  it("no banned developer terms in user-facing text", async () => {
    const result = await generateCheckDraft({ productSpec: MEETING_SPEC, items: ITEMS }, undefined);
    const allText = result.results.map((r) => [r.reason, r.nextAction, ...r.evidence].join(" ")).join(" ");
    for (const term of BANNED_USER_FACING_TERMS) {
      assert.ok(!allText.includes(term), `banned term "${term}" found in check results`);
    }
  });

  it("empty items returns valid empty response", async () => {
    const result = await generateCheckDraft({ productSpec: MEETING_SPEC, items: [] }, undefined);
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 0);
  });
});
