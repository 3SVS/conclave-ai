/**
 * visual-flow-plan.test.mjs — Stage 260A. Deterministic deep-flow planner. Imports dist.
 *
 * Verifies the planner drives a REAL journey (not just one CTA): it clicks a safe intent CTA when
 * present, otherwise TYPES a benign query into the primary search input, always ends by observing,
 * and never plans a forbidden/destructive action.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planVisualFlow, pickSafeCta, pickPrimaryInput } from "../dist/visual-flow-plan.js";

const intent = "골퍼가 코스가 지금 플레이 가능한지 확인하는 흐름을 시작할 수 있어야 한다";

test("pickSafeCta chooses the highest-priority safe intent CTA, skips forbidden", () => {
  const cta = pickSafeCta(
    [
      { text: "결제하기", selector: "b1" },
      { text: "코스 검색", selector: "b2" },
      { text: "시작하기", selector: "b3" },
    ],
    ["결제", "delete"],
  );
  assert.ok(cta);
  assert.ok(cta.text === "코스 검색" || cta.text === "시작하기"); // both match; forbidden 결제 excluded
});

test("plan clicks a safe CTA then observes", () => {
  const plan = planVisualFlow({ intentAnchor: intent, ctas: [{ text: "시작하기", selector: "#start" }], inputs: [] });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].action, "click");
  assert.equal(plan[0].selector, "#start");
  assert.equal(plan[1].action, "observe");
});

test("with NO CTA but a search input, plan TYPES a benign query then observes (the deep flow)", () => {
  const plan = planVisualFlow({
    intentAnchor: intent,
    ctas: [],
    inputs: [{ placeholder: "골프장 검색 (이름, 지역)", type: "text", selector: "#q" }],
  });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].action, "type");
  assert.equal(plan[0].selector, "#q");
  assert.equal(plan[0].value, "서울"); // deterministic benign default
  assert.equal(plan[1].action, "observe");
});

test("custom sampleQuery is honored", () => {
  const plan = planVisualFlow({
    intentAnchor: intent,
    ctas: [],
    inputs: [{ placeholder: "검색", type: "search", selector: "#q" }],
    sampleQuery: "부산",
  });
  assert.equal(plan[0].value, "부산");
});

test("forbidden CTA is never planned; falls through to input", () => {
  const plan = planVisualFlow({
    intentAnchor: intent,
    ctas: [{ text: "계정 삭제", selector: "#del" }],
    inputs: [{ placeholder: "검색", type: "text", selector: "#q" }],
    forbidden: ["삭제"],
  });
  assert.equal(plan[0].action, "type"); // 삭제 CTA skipped
});

test("intent alignment: a 'check' intent prefers the search box over a non-search signup CTA", () => {
  // The golf-now case: intent is about checking playability; a "보험 가입하기" CTA exists AND a
  // "골프장 검색" input exists. The planner must TYPE into search, not click the signup CTA.
  const plan = planVisualFlow({
    intentAnchor: "코스가 지금 플레이 가능한지 확인하는 흐름을 시작할 수 있어야 한다",
    ctas: [{ text: "🛡️ 비 보험 가입하기 →", selector: "text=보험 가입하기" }],
    inputs: [{ placeholder: "골프장 검색 (이름, 지역)", type: "text", selector: "#q" }],
  });
  assert.equal(plan[0].action, "type");
  assert.equal(plan[0].selector, "#q");
});

test("intent alignment: a search-like CTA still wins even for a check intent", () => {
  const plan = planVisualFlow({
    intentAnchor: "코스 조건을 확인하는 흐름",
    ctas: [{ text: "코스 검색", selector: "text=코스 검색" }],
    inputs: [{ placeholder: "골프장 검색", type: "text", selector: "#q" }],
  });
  assert.equal(plan[0].action, "click"); // "코스 검색" is itself the intent action
  assert.equal(plan[0].targetText, "코스 검색");
});

test("no CTA and no input → single safe observe (nothing to drive)", () => {
  const plan = planVisualFlow({ intentAnchor: intent, ctas: [], inputs: [] });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].action, "observe");
});

test("pickPrimaryInput prefers a search-like input", () => {
  const i = pickPrimaryInput([
    { placeholder: "이메일", type: "email", selector: "#e" },
    { placeholder: "골프장 검색", type: "text", selector: "#s" },
  ]);
  assert.equal(i.selector, "#s");
});
