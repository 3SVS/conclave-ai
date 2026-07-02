/**
 * visual-run.mjs — Stage 260A: Simsa deep visual completion check (LOCAL/DEV ONLY).
 *
 * Upgrades the Stage 258A spike from "click one CTA" to a REAL journey: it plans a deep flow
 * (planVisualFlow — click a safe CTA, else TYPE a benign query into the primary search box), executes
 * it in a real Chromium while recording VIDEO + a screenshot per step, then renders a plain-Korean,
 * non-developer report (buildNonDevReport + renderNonDevReportHtml) the user can double-click and SEE.
 *
 * Reuses the Simsa core modules (tested, in apps/central-plane). Safety: only safe/benign actions are
 * executed (forbidden actions are never planned); no auth bypass, no destructive actions, no deploy.
 *
 * Usage: node visual-run.mjs <targetUrl> <outDir> [sampleQuery]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { planVisualFlow } from "../../apps/central-plane/dist/visual-flow-plan.js";
import { buildNonDevReport, buildAgentFixPrompt, renderNonDevReportHtml } from "../../apps/central-plane/dist/nondev-report.js";
import { classifyActionSafety } from "./lib/safety.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const INTENT_DEFAULT =
  "골퍼가 앱을 열어 현재 골프장 컨디션 확인 도구임을 이해하고, 코스/라운드가 지금 플레이 가능한지 확인하는 핵심 플로우를 시작할 수 있어야 한다";

async function collectCtas(page) {
  return page.$$eval("a, button, [role=button]", (els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      })
      .slice(0, 200)
      .map((el) => ({ text: (el.innerText || el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ") }))
      .filter((c) => c.text.length > 0)
      .map((c) => ({ text: c.text, selector: `text=${c.text}` })),
  );
}

async function collectInputs(page) {
  return page.$$eval("input, textarea", (els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const t = (el.getAttribute("type") || "text").toLowerCase();
        const ok = ["text", "search", "email", "tel", "url", "number", ""].includes(t) || el.tagName.toLowerCase() === "textarea";
        return r.width > 0 && r.height > 0 && ok;
      })
      .slice(0, 50)
      .map((el) => ({ type: (el.getAttribute("type") || "text").toLowerCase(), placeholder: (el.getAttribute("placeholder") || el.getAttribute("aria-label") || "").trim().slice(0, 80) }))
      .map((i) => ({ ...i, selector: i.placeholder ? `[placeholder="${i.placeholder}"]` : "input" })),
  );
}

export async function visualRun(config, outDir) {
  const shotsDir = join(outDir, "screenshots");
  const videoDir = join(outDir, "video");
  mkdirSync(shotsDir, { recursive: true });
  mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } } });
  const page = await context.newPage();

  const consoleErrors = [];
  const networkFailures = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
  page.on("requestfailed", (r) => networkFailures.push(`${r.method()} ${r.url().slice(0, 200)} (${r.failure()?.errorText ?? "failed"})`));
  page.on("response", (r) => r.status() >= 500 && networkFailures.push(`HTTP ${r.status()} ${r.url().slice(0, 200)}`));

  const shots = [];
  const stepOutcomes = [];
  const evidence = {
    urlLoaded: config.targetUrl,
    loadStatus: null,
    primaryActionFound: false,
    interacted: false,
    routeBeforeClick: null,
    routeAfterClick: null,
    routeChanged: false,
    consoleErrors,
    networkFailures,
    inputs: [],
    ctas: [],
    plan: [],
  };

  async function snap(name, label) {
    const p = join(shotsDir, name);
    try {
      await page.screenshot({ path: p, fullPage: false });
      shots.push({ label, src: `screenshots/${name}` });
    } catch {
      /* ignore screenshot failures */
    }
  }

  try {
    const resp = await page.goto(config.targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    evidence.loadStatus = resp ? resp.status() : null;
    evidence.routeBeforeClick = page.url();
    await page.waitForTimeout(1800);
    await snap("step-00-initial.png", "첫 화면 (앱을 열었을 때)");

    const ctas = await collectCtas(page);
    const inputs = await collectInputs(page);
    evidence.ctas = ctas.slice(0, 20);
    evidence.inputs = inputs;

    const plan = planVisualFlow({
      intentAnchor: config.intentAnchor,
      ctas: ctas.map((c) => ({ text: c.text, selector: c.selector })),
      inputs,
      forbidden: config.forbidden,
      sampleQuery: config.sampleQuery,
    });
    evidence.plan = plan;
    evidence.primaryActionFound = plan.some((s) => s.action === "click" || s.action === "type");

    let stepIdx = 0;
    for (const step of plan) {
      stepIdx += 1;
      const shotName = `step-${String(stepIdx).padStart(2, "0")}.png`;
      try {
        if (step.action === "click") {
          const safety = classifyActionSafety(step.targetText);
          if (!safety.safe) {
            stepOutcomes.push({ label: step.label, ok: false, note: `안전하지 않아 건너뜀 (${safety.category})` });
            continue;
          }
          await page.getByText(step.targetText, { exact: true }).first().click({ timeout: 8000 });
          evidence.interacted = true;
          await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(1500);
          evidence.routeAfterClick = page.url();
          evidence.routeChanged = evidence.routeAfterClick !== evidence.routeBeforeClick;
          await snap(shotName, `${step.label} 후 화면`);
          stepOutcomes.push({ label: step.label, ok: true });
        } else if (step.action === "type") {
          const field = step.placeholder ? page.getByPlaceholder(step.placeholder).first() : page.locator("input").first();
          await field.fill(step.value, { timeout: 8000 });
          await field.press("Enter").catch(() => {});
          evidence.interacted = true;
          await page.waitForTimeout(1800);
          await snap(shotName, `${step.label} 후 화면`);
          // Did results/content appear? Heuristic: page text grew and no fresh network failure.
          const bodyLen = (await page.locator("body").innerText().catch(() => "")).length;
          const ok = bodyLen > 200 && networkFailures.length === 0;
          stepOutcomes.push({ label: step.label, ok, note: ok ? undefined : "검색 결과/내용이 확인되지 않음 (또는 데이터 요청 실패)" });
        } else {
          await snap(shotName, step.label);
          stepOutcomes.push({ label: step.label, ok: networkFailures.length === 0, note: networkFailures.length ? "데이터 요청 실패가 관찰됨" : undefined });
        }
      } catch (err) {
        await snap(shotName, `${step.label} (실패)`);
        stepOutcomes.push({ label: step.label, ok: false, note: `동작 실패: ${String(err).slice(0, 100)}` });
      }
    }
  } finally {
    await context.close(); // finalizes the video
    await browser.close();
  }

  // Save the recorded video next to the report.
  let videoRel = null;
  try {
    const vp = await page.video()?.path();
    if (vp) {
      copyFileSync(vp, join(videoDir, "flow.webm"));
      videoRel = "video/flow.webm";
    }
  } catch {
    /* video optional */
  }

  const decision = decideFromEvidence(evidence, stepOutcomes);
  const reportInput = {
    targetUrl: config.targetUrl,
    intentAnchor: config.intentAnchor,
    loadStatus: evidence.loadStatus,
    primaryActionFound: evidence.primaryActionFound,
    interacted: evidence.interacted,
    routeAfterClick: evidence.routeAfterClick,
    routeChanged: evidence.routeChanged,
    consoleErrors,
    networkFailures,
    decision,
    steps: stepOutcomes,
  };
  const report = buildNonDevReport(reportInput);
  const agentPrompt = buildAgentFixPrompt(reportInput);
  const html = renderNonDevReportHtml(report, shots, videoRel, agentPrompt);

  writeFileSync(join(outDir, "browser-evidence.json"), JSON.stringify({ ...evidence, stepOutcomes, decision }, null, 2));
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, "report.html"), html);
  writeFileSync(join(outDir, "report.md"), toMarkdown(report));
  writeFileSync(join(outDir, "agent-prompt.md"), agentPrompt);
  return { report, decision, shots, videoRel };
}

/** Deterministic decision from the deep-flow evidence (mirrors the spike's ladder, journey-aware). */
function decideFromEvidence(e, steps) {
  if (e.loadStatus && e.loadStatus >= 400) return "Not Verified";
  if (e.networkFailures.length || e.consoleErrors.length) return "Needs Fix";
  if (e.interacted && e.routeAfterClick && /\/undefined|\/null|\/404|not-found|error/i.test(e.routeAfterClick)) return "Needs Fix";
  if (steps.some((s) => !s.ok)) return "Needs Fix";
  if (!e.primaryActionFound) return "Needs Clarification";
  if (e.interacted) return "User Acceptance Required"; // journey ran clean, but no visual oracle for "usable"
  return "Not Verified";
}

function toMarkdown(r) {
  const lines = [`# ${r.title}`, "", `**대상:** ${r.target}`, `**확인하려던 것:** ${r.intent}`, "", `## 판정: ${r.verdict}`, "", r.oneLine, "", "## 무엇을 발견했나요", ""];
  if (!r.findings.length) lines.push("특별히 막히는 지점을 찾지 못했어요.");
  for (const f of r.findings) {
    lines.push(`### [${f.severity}] ${f.what}`, `- 왜: ${f.why}`, `- 어떻게: ${f.how}`);
    if (f.evidence) lines.push(`- 개발자용: \`${f.evidence}\``);
    lines.push("");
  }
  lines.push("## 다음에 해볼 것", "", ...r.nextSteps.map((s) => `- ${s}`), "", "## 안내", "", ...r.notes.map((s) => `- ${s}`), "");
  return lines.join("\n");
}

// CLI
if (process.argv[1] && process.argv[1].endsWith("visual-run.mjs")) {
  const targetUrl = process.argv[2] || "http://localhost:3000/";
  const outDir = process.argv[3] || join(here, "out", "visual");
  const sampleQuery = process.argv[4] || "서울";
  const config = {
    targetUrl,
    intentAnchor: INTENT_DEFAULT,
    sampleQuery,
    forbidden: ["payment", "delete", "send", "invite", "publish", "deploy", "결제", "삭제", "발행", "배포", "로그아웃"],
  };
  visualRun(config, outDir)
    .then((r) => console.log(`[visual] decision: ${r.decision} | works: ${r.report.works} | shots: ${r.shots.length} | video: ${r.videoRel ?? "none"}`))
    .catch((e) => {
      console.error("[visual] error:", e);
      process.exit(1);
    });
}
