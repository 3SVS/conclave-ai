/**
 * Answers reflection tests.
 *
 * Verifies that different answers to the same question produce
 * meaningfully different output — spec.decisions and items should
 * diverge based on user intent expressed in answers.
 *
 * All tests use mock-fallback (no API key required).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { generateIdeaToSpecDraft } = await import("../dist/workspace/generate.js");

const MEETING_IDEA = "회의 녹음 파일을 올리면 자동으로 요약하고, 할 일을 뽑아서 Linear로 보내주는 앱";

describe("answers reflection", () => {
  it("confirm-send vs auto-send answers produce different decisions", async () => {
    const resultA = await generateIdeaToSpecDraft(
      {
        idea: MEETING_IDEA,
        answers: [
          { questionId: "linear-send-approval", answer: "Linear로 보내기 전에 사용자가 확인해야 한다" },
        ],
      },
      undefined,
    );

    const resultB = await generateIdeaToSpecDraft(
      {
        idea: MEETING_IDEA,
        answers: [
          { questionId: "linear-send-approval", answer: "사용자 확인 없이 자동으로 Linear로 보내도 된다" },
        ],
      },
      undefined,
    );

    const decisionsA = resultA.productSpec.decisions.join(" ");
    const decisionsB = resultB.productSpec.decisions.join(" ");

    // A should mention 확인/검토/선택
    assert.ok(
      /확인|검토|선택/.test(decisionsA),
      `answersA decisions should contain 확인/검토/선택, got: "${decisionsA}"`,
    );

    // B should mention 자동
    assert.ok(
      /자동/.test(decisionsB),
      `answersB decisions should contain 자동, got: "${decisionsB}"`,
    );

    // decisions should differ
    assert.notEqual(
      decisionsA,
      decisionsB,
      "answersA and answersB decisions should differ",
    );
  });

  it("confirm-send answer: req_006 title mentions 확인 or 선택", async () => {
    const result = await generateIdeaToSpecDraft(
      {
        idea: MEETING_IDEA,
        answers: [
          { questionId: "q1", answer: "확인 후 보내기" },
        ],
      },
      undefined,
    );

    const sendItem = result.items.find((item) => item.id === "req_006");
    assert.ok(sendItem, "req_006 should exist");
    assert.ok(
      /확인|선택|검토/.test(sendItem.title),
      `confirm answer: req_006 title should mention 확인/선택/검토, got: "${sendItem.title}"`,
    );
  });

  it("auto-send answer: req_006 title mentions 자동 or criteria includes 실패/되돌리기", async () => {
    const result = await generateIdeaToSpecDraft(
      {
        idea: MEETING_IDEA,
        answers: [
          { questionId: "q1", answer: "자동으로 보내기" },
        ],
      },
      undefined,
    );

    const sendItem = result.items.find((item) => item.id === "req_006");
    assert.ok(sendItem, "req_006 should exist");

    const titleAndCriteria = [sendItem.title, ...sendItem.criteria].join(" ");
    assert.ok(
      /자동|전송 실패|되돌리기|재시도|실패/.test(titleAndCriteria),
      `auto answer: req_006 should mention 자동/실패/재시도, got: "${titleAndCriteria}"`,
    );
  });

  it("decisions differ between answersA and answersB", async () => {
    const resultA = await generateIdeaToSpecDraft(
      { idea: MEETING_IDEA, answers: [{ questionId: "q1", answer: "확인 후 보내기" }] },
      undefined,
    );
    const resultB = await generateIdeaToSpecDraft(
      { idea: MEETING_IDEA, answers: [{ questionId: "q1", answer: "자동으로 보내기" }] },
      undefined,
    );

    // The req_006 titles should be different
    const itemA = resultA.items.find((i) => i.id === "req_006");
    const itemB = resultB.items.find((i) => i.id === "req_006");
    assert.notEqual(
      itemA?.title,
      itemB?.title,
      "req_006 title should differ between confirm and auto answers",
    );
  });

  it("no answers = default (confirm) behavior", async () => {
    const result = await generateIdeaToSpecDraft({ idea: MEETING_IDEA }, undefined);
    const sendItem = result.items.find((item) => item.id === "req_006");
    assert.ok(sendItem, "req_006 should exist");
    // Default is confirm-before-send
    const hasConfirmSignal = /확인|선택|검토/.test(sendItem.title);
    assert.ok(hasConfirmSignal, `default (no answers) should use confirm behavior, got: "${sendItem.title}"`);
  });
});
