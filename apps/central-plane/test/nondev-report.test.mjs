/**
 * nondev-report.test.mjs — Stage 260A. Deterministic Korean non-dev report. Imports dist.
 *
 * Verifies: decision→Korean, evidence→plain-Korean findings (무엇/왜/어떻게), that developer jargon
 * (error codes) never leaks into the human-facing what/why/how text (only into `evidence`), and that
 * NO numeric score appears anywhere.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentFixPrompt,
  buildNonDevReport,
  classifyFindings,
  decisionToKorean,
  decisionToWorks,
  renderNonDevReportHtml,
} from "../dist/nondev-report.js";

const base = {
  targetUrl: "https://example.app/",
  intentAnchor: "사용자가 핵심 흐름을 시작할 수 있어야 한다",
  loadStatus: 200,
  primaryActionFound: false,
  interacted: false,
  routeAfterClick: null,
  routeChanged: false,
  consoleErrors: [],
  networkFailures: [],
  decision: "Needs Clarification",
  steps: [],
};

test("decision maps to plain Korean and a works flag", () => {
  assert.equal(decisionToKorean("Ready"), "정상 작동해요");
  assert.equal(decisionToKorean("Needs Fix"), "작동 안 해요 — 고쳐야 해요");
  assert.equal(decisionToKorean("Not Verified"), "확인 못 했어요");
  assert.equal(decisionToKorean("무엇이든"), "확인 못 했어요"); // unknown → safe default
  assert.equal(decisionToWorks("Ready"), true);
  assert.equal(decisionToWorks("Needs Fix"), false);
  assert.equal(decisionToWorks("Needs Clarification"), null);
});

test("DNS failure (the golf-now case) → plain-Korean finding, raw code only in evidence", () => {
  const input = {
    ...base,
    decision: "Needs Fix",
    consoleErrors: ["Failed to load resource: net::ERR_NAME_NOT_RESOLVED"],
    networkFailures: ["GET https://dead.supabase.co/rest/v1/golf_courses (net::ERR_NAME_NOT_RESOLVED)"],
  };
  const findings = classifyFindings(input);
  const dns = findings.find((f) => f.what.includes("서버 주소를 찾지 못"));
  assert.ok(dns, "should produce a DNS finding in Korean");
  assert.equal(dns.severity, "high");
  // human-facing text must NOT contain the raw error code
  assert.ok(!/ERR_NAME_NOT_RESOLVED/.test(dns.what + dns.why + dns.how));
  // but the developer evidence field keeps it
  assert.ok(/ERR_NAME_NOT_RESOLVED/.test(dns.evidence));
});

test("no primary action found → Korean 'what to press' finding", () => {
  const findings = classifyFindings({ ...base, primaryActionFound: false, interacted: false });
  assert.ok(findings.some((f) => f.what.includes("무엇을 눌러 시작")));
});

test("broken route after click → Korean broken-screen finding", () => {
  const findings = classifyFindings({ ...base, interacted: true, routeAfterClick: "/undefined" });
  assert.ok(findings.some((f) => f.what.includes("깨진 화면")));
});

test("failed flow step → Korean step finding", () => {
  const findings = classifyFindings({ ...base, interacted: true, steps: [{ label: "검색창에 '서울' 입력하기", ok: false, note: "결과가 안 나옴" }] });
  assert.ok(findings.some((f) => f.what.includes("입력하기") && f.what.includes("되지 않았")));
});

test("buildNonDevReport: full report is Korean, has verdict/oneLine/nextSteps, and NO numeric score", () => {
  const report = buildNonDevReport({
    ...base,
    decision: "Needs Fix",
    networkFailures: ["GET https://dead.supabase.co/x (net::ERR_NAME_NOT_RESOLVED)"],
    consoleErrors: ["net::ERR_NAME_NOT_RESOLVED"],
  });
  assert.equal(report.verdict, "작동 안 해요 — 고쳐야 해요");
  assert.equal(report.works, false);
  assert.ok(report.oneLine.length > 0);
  assert.ok(report.findings.length >= 1);
  assert.ok(report.nextSteps.length >= 1);
  assert.ok(report.notes.length >= 1);
  // no numeric score anywhere
  assert.ok(!/\b\d{1,3}\s*\/\s*100\b/.test(JSON.stringify(report)));
  assert.ok(!/score/i.test(Object.keys(report).join(",")));
});

test("clean run (Ready) → works true, positive one-line, no high-severity findings", () => {
  const report = buildNonDevReport({ ...base, decision: "Ready", primaryActionFound: true, interacted: true, routeAfterClick: "/results", routeChanged: true });
  assert.equal(report.works, true);
  assert.ok(report.oneLine.includes("정상"));
  assert.ok(!report.findings.some((f) => f.severity === "high"));
});

test("deterministic: same input → identical report", () => {
  const input = { ...base, decision: "Needs Fix", networkFailures: ["x (net::ERR_NAME_NOT_RESOLVED)"] };
  assert.deepEqual(buildNonDevReport(input), buildNonDevReport(input));
});

test("renderNonDevReportHtml: self-contained Korean HTML with screenshots, no numeric score, escapes", () => {
  const report = buildNonDevReport({
    ...base,
    decision: "Needs Fix",
    networkFailures: ["GET https://dead.supabase.co/x (net::ERR_NAME_NOT_RESOLVED)"],
    consoleErrors: ["net::ERR_NAME_NOT_RESOLVED"],
  });
  const html = renderNonDevReportHtml(report, [{ label: "첫 화면", src: "screenshots/step-00.png" }], "video/flow.webm");
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes('lang="ko"'));
  assert.ok(html.includes("무엇이 문제인가요"));
  assert.ok(html.includes("어떻게 고치나요"));
  assert.ok(html.includes("screenshots/step-00.png"));
  assert.ok(html.includes("<video"));
  assert.ok(html.includes(">작동 안 해요</span>"));
  assert.ok(!/\b\d{1,3}\s*\/\s*100\b/.test(html)); // no numeric score
  // developer error code appears only inside the collapsible details/code, not the headline
  assert.ok(html.includes("개발자용 기술 정보"));
  // brand rule: no emoji anywhere in the report surface
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}⭕⛔]/u.test(html));
});

test("buildAgentFixPrompt: evidence verbatim, findings prioritized, guardrail rules, deterministic", () => {
  const input = {
    ...base,
    decision: "Needs Fix",
    interacted: true,
    networkFailures: ["GET https://dead.supabase.co/rest/v1/golf_courses (net::ERR_NAME_NOT_RESOLVED)"],
    consoleErrors: ["Failed to load resource: net::ERR_NAME_NOT_RESOLVED"],
    steps: [{ label: "검색창에 '서울' 입력하기", ok: false, note: "결과가 안 나옴" }],
  };
  const prompt = buildAgentFixPrompt(input);
  // raw technical strings ARE included (the receiver is an agent, not a non-dev)
  assert.ok(prompt.includes("GET https://dead.supabase.co/rest/v1/golf_courses (net::ERR_NAME_NOT_RESOLVED)"));
  assert.ok(prompt.includes(base.targetUrl));
  assert.ok(prompt.includes(base.intentAnchor));
  // findings carried over with priority numbering and severity in Korean
  assert.ok(/1\. \[높음\]/.test(prompt));
  // guardrails: no invention, minimal fix, no hardcoded secrets, verify, report
  assert.ok(prompt.includes("추측으로 만들어내지 마세요"));
  assert.ok(prompt.includes("하드코딩하지 마세요"));
  assert.ok(prompt.includes("네트워크 실패 0건"));
  // failed step appears
  assert.ok(prompt.includes("검색창에 '서울' 입력하기: 실패"));
  // deterministic
  assert.equal(prompt, buildAgentFixPrompt(input));
});

test("buildAgentFixPrompt: clean run → no invented problems, verification-only instruction", () => {
  const prompt = buildAgentFixPrompt({ ...base, decision: "Ready", primaryActionFound: true, interacted: true });
  assert.ok(prompt.includes("고칠 문제가 관찰되지 않았습니다"));
  assert.ok(prompt.includes("네트워크 실패: 없음"));
});

test("renderNonDevReportHtml: agent prompt section renders with copy button, escaped; hidden when absent", () => {
  const input = {
    ...base,
    decision: "Needs Fix",
    networkFailures: ['GET https://x/y?<b>&"z" (net::ERR_NAME_NOT_RESOLVED)'],
  };
  const report = buildNonDevReport(input);
  const prompt = buildAgentFixPrompt(input);
  const withPrompt = renderNonDevReportHtml(report, [], null, prompt);
  assert.ok(withPrompt.includes("바로 고치게 하기"));
  assert.ok(withPrompt.includes('id="agent-prompt"'));
  assert.ok(withPrompt.includes("지시문 복사"));
  // evidence inside the prompt block is HTML-escaped
  assert.ok(!withPrompt.includes('<b>&"z"'));
  const withoutPrompt = renderNonDevReportHtml(report);
  assert.ok(!withoutPrompt.includes("바로 고치게 하기"));
  assert.ok(!withoutPrompt.includes('id="agent-prompt"'));
});

test("renderNonDevReportHtml escapes HTML-special characters in evidence", () => {
  const report = buildNonDevReport({ ...base, decision: "Needs Fix", networkFailures: ['GET https://x/y?<b>&"z" (net::ERR_NAME_NOT_RESOLVED)'] });
  const html = renderNonDevReportHtml(report);
  assert.ok(!html.includes("<b>&\"z\""));
  assert.ok(html.includes("&lt;b&gt;"));
});
