/**
 * nondev-report.ts — Stage 260A (Simsa 비개발자용 한국어 검수 리포트).
 *
 * Pure, deterministic. Turns the visual completion-check evidence (facts a real browser observed)
 * into a plain-Korean report a non-developer can read: 무엇이 / 왜 / 어떻게 고치나. Developer-only
 * technical strings (e.g. ERR_NAME_NOT_RESOLVED) are kept in a separate `evidence` field, never in
 * the human-facing 무엇/왜/어떻게 text. NO numeric score (Simsa policy §20). Absent evidence → "확인 못 함".
 *
 * NO network / DB / env / LLM — same input always yields the same report.
 */

/** Normalized, tool-agnostic input for one visual completion check. */
export interface VisualCheckInput {
  targetUrl: string;
  intentAnchor: string;
  loadStatus: number | null;
  primaryActionFound: boolean;
  /** Did the flow actually interact (click/type)? */
  interacted: boolean;
  routeAfterClick: string | null;
  routeChanged: boolean;
  consoleErrors: string[];
  networkFailures: string[];
  /** One of the spike's decision states, e.g. "Needs Fix" / "Needs Clarification". */
  decision: string;
  /** Optional per-step flow outcomes (label + whether the step visibly succeeded). */
  steps?: Array<{ label: string; ok: boolean; note?: string }>;
}

/** One finding, written for a non-developer. `evidence` is the raw developer-only detail. */
export interface NonDevFinding {
  severity: "high" | "medium" | "low" | "info";
  what: string; // 무엇이 문제인가요
  why: string; // 왜 그런가요
  how: string; // 어떻게 고치나요
  evidence: string | null; // 개발자용 기술 정보 (사람 말 아님)
}

export interface NonDevReport {
  title: string;
  target: string;
  intent: string;
  verdict: string; // 한국어 판정
  oneLine: string; // 한 줄 요약
  works: boolean | null; // 작동하나요? (true/false/null=확인못함)
  findings: NonDevFinding[];
  nextSteps: string[];
  notes: string[]; // 한계 안내 (한국어)
}

/** 판정(영문 decision state) → 비개발자용 한국어 라벨. */
const DECISION_KO: Record<string, string> = {
  Ready: "정상 작동해요",
  "Conditionally Ready": "대체로 되지만 확인이 필요해요",
  "Needs Fix": "작동 안 해요 — 고쳐야 해요",
  "Not Verified": "확인 못 했어요",
  "Needs Clarification": "무엇을 확인해야 할지 애매해요",
  "Needs Evidence": "판단할 근거가 부족해요",
  "Needs Expert Review": "전문가 확인이 필요해요",
  "User Acceptance Required": "직접 눈으로 확인이 필요해요",
  "Do Not Build Yet": "아직 만들 때가 아니에요",
  "Not Applicable": "해당 없음",
  "Not Judged": "판단하지 않았어요",
};

export function decisionToKorean(decision: string): string {
  return DECISION_KO[decision] ?? "확인 못 했어요";
}

/** true=작동, false=작동 안 함, null=확인 못 함. */
export function decisionToWorks(decision: string): boolean | null {
  if (decision === "Ready") return true;
  if (decision === "Needs Fix") return false;
  return null;
}

/**
 * 원시 증거(콘솔/네트워크 문자열, 상태코드, 라우트)를 비개발자용 finding 들로 번역.
 * 각 finding 은 무엇/왜/어떻게 를 평범한 한국어로 담고, 원본 기술 문자열은 evidence 에만 둔다.
 */
export function classifyFindings(input: VisualCheckInput): NonDevFinding[] {
  const findings: NonDevFinding[] = [];
  const netText = input.networkFailures.join(" ");
  const conText = input.consoleErrors.join(" ");

  // 1) 백엔드 주소 미해결 (DNS) — golf-now 가 맞은 그 실패.
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo/i.test(netText + " " + conText)) {
    findings.push({
      severity: "high",
      what: "앱이 데이터를 가져오는 서버 주소를 찾지 못했어요.",
      why: "앱이 연결하려는 백엔드(데이터베이스/API) 주소가 살아있지 않거나 잘못 적혀 있어요. 그래서 목록·검색 결과 같은 실제 내용이 안 떠요.",
      how: "백엔드 주소(예: 데이터베이스 URL 환경변수)가 올바른지, 그 서비스가 켜져 있는지 확인하세요. 서비스가 꺼졌거나 삭제됐다면 다시 켜거나 새 주소로 바꿔야 해요.",
      evidence: firstMatch(input.networkFailures, /ERR_NAME_NOT_RESOLVED|ENOTFOUND/i) ?? firstMatch(input.consoleErrors, /ERR_NAME_NOT_RESOLVED/i),
    });
  }

  // 2) 서버 5xx 오류.
  if (/\bHTTP 5\d\d\b|status 5\d\d/i.test(netText)) {
    findings.push({
      severity: "high",
      what: "서버가 오류를 돌려줬어요.",
      why: "백엔드 코드나 설정에 문제가 있어 요청을 제대로 처리하지 못했어요.",
      how: "서버 로그에서 어떤 요청이 500번대 오류를 냈는지 확인하고, 그 부분의 코드/설정을 고치세요.",
      evidence: firstMatch(input.networkFailures, /5\d\d/),
    });
  }

  // 3) 눌렀는데 깨진/없는 화면으로 이동.
  if (input.interacted && input.routeAfterClick && /\/undefined|\/null|\/404|not-found|error/i.test(input.routeAfterClick)) {
    findings.push({
      severity: "high",
      what: "버튼을 눌렀더니 깨진 화면으로 갔어요.",
      why: "그 버튼이 가리키는 이동 주소가 잘못됐어요.",
      how: "버튼의 링크(이동 주소)가 실제로 존재하는 화면을 가리키도록 고치세요.",
      evidence: input.routeAfterClick,
    });
  }

  // 4) 일반 네트워크 실패 (위 특수 케이스에 안 걸린 경우).
  if (input.networkFailures.length > 0 && findings.every((f) => f.severity !== "high" || !/서버 주소|서버가 오류/.test(f.what))) {
    if (!/ERR_NAME_NOT_RESOLVED|5\d\d/i.test(netText)) {
      findings.push({
        severity: "high",
        what: "필요한 데이터를 불러오지 못했어요.",
        why: "화면에 내용을 채우려는 데이터 요청이 실패했어요.",
        how: "실패한 요청의 주소·권한(키)·서버 상태를 확인하세요.",
        evidence: input.networkFailures[0] ?? null,
      });
    }
  }

  // 5) 콘솔 오류 (네트워크와 별개의 코드 오류).
  if (input.consoleErrors.length > 0 && !/ERR_NAME_NOT_RESOLVED/i.test(conText)) {
    findings.push({
      severity: "medium",
      what: "화면에서 코드 오류가 났어요.",
      why: "자바스크립트 실행 중 문제가 생겼어요. 일부 기능이 안 될 수 있어요.",
      how: "브라우저 콘솔의 오류 메시지를 그대로 복사해 개발 도구(또는 이 리포트의 '개발자용' 칸)를 참고해 고치세요.",
      evidence: input.consoleErrors[0] ?? null,
    });
  }

  // 6) 첫 화면에서 핵심 동작(시작 버튼/검색 등)을 못 찾음.
  if (!input.primaryActionFound && !input.interacted) {
    findings.push({
      severity: "medium",
      what: "처음 화면에서 무엇을 눌러 시작해야 할지 못 찾았어요.",
      why: "의도한 핵심 동작(예: 시작하기, 검색)으로 이어지는 버튼이나 입력창이 눈에 띄지 않았어요.",
      how: "사용자가 가장 먼저 해야 할 행동(버튼·검색창)을 첫 화면에 크고 분명하게 배치하세요.",
      evidence: null,
    });
  }

  // 7) 실패한 플로우 단계.
  for (const s of input.steps ?? []) {
    if (!s.ok) {
      findings.push({
        severity: "medium",
        what: `'${s.label}' 단계가 끝까지 되지 않았어요.`,
        why: s.note ? `이유: ${s.note}` : "그 단계에서 기대한 다음 화면/결과가 나타나지 않았어요.",
        how: "그 단계에서 무엇이 나와야 하는지 정하고, 눌렀을 때 그 결과가 실제로 뜨는지 확인하세요.",
        evidence: s.note ?? null,
      });
    }
  }

  return findings;
}

function firstMatch(arr: string[], re: RegExp): string | null {
  for (const s of arr) if (re.test(s)) return s;
  return null;
}

/** 비개발자용 한국어 리포트 조립. 결정론적, 절대 throw 안 함. 숫자 점수 없음. */
export function buildNonDevReport(input: VisualCheckInput): NonDevReport {
  const findings = classifyFindings(input);
  const works = decisionToWorks(input.decision);
  const verdict = decisionToKorean(input.decision);

  const oneLine =
    works === true
      ? "핵심 흐름이 눈으로 확인한 범위에서 정상 동작했어요."
      : works === false
        ? `핵심 흐름이 지금은 작동하지 않아요. ${findings[0]?.what ?? ""}`.trim()
        : `아직 '작동한다'고 확정하기엔 확인이 더 필요해요. ${findings[0]?.what ?? ""}`.trim();

  const nextSteps: string[] = [];
  const topFinding = findings[0];
  if (topFinding) {
    nextSteps.push(`가장 급한 것부터: ${topFinding.how}`);
  }
  if (works === null && input.primaryActionFound === false) {
    nextSteps.push("사용자가 처음에 눌러야 할 버튼/검색창을 분명히 만든 뒤 다시 검수하세요.");
  }
  nextSteps.push("고친 뒤 이 검수를 한 번 더 돌려서, 아래 스크린샷이 정상 화면으로 바뀌는지 눈으로 확인하세요.");

  return {
    title: "Simsa 검수 리포트",
    target: input.targetUrl,
    intent: input.intentAnchor,
    verdict,
    oneLine,
    works,
    findings,
    nextSteps,
    notes: [
      "이 검수는 실제 브라우저로 앱을 열어 눈에 보이는 것을 확인한 결과예요. 모든 버그를 찾았다는 뜻은 아니에요.",
      "'무엇이/왜/어떻게'는 사람이 읽기 쉬운 설명이고, 정확한 기술 원인은 각 항목의 '개발자용' 정보에 있어요.",
      "화면 스크린샷을 함께 보면 어디서 막혔는지 눈으로 바로 알 수 있어요.",
    ],
  };
}

function esc(s: unknown): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return String(s ?? "").replace(/[&<>"]/g, (c) => map[c] ?? c);
}

/** A screenshot to embed in the visual report (src is relative to the HTML file). */
export interface ReportShot {
  label: string;
  src: string;
}

/**
 * Render a SELF-CONTAINED Korean HTML report a non-developer can double-click and read: verdict at
 * the top, each finding as 무엇/왜/어떻게 cards (with a collapsible 개발자용 detail), the screenshots
 * inline so they can SEE where it broke, and an optional flow video. No numeric score.
 */
export function renderNonDevReportHtml(
  report: NonDevReport,
  shots: ReportShot[] = [],
  videoSrc?: string | null,
): string {
  const worksBadge =
    report.works === true
      ? '<span class="badge ok">✅ 작동해요</span>'
      : report.works === false
        ? '<span class="badge bad">⛔ 작동 안 해요</span>'
        : '<span class="badge warn">⚠️ 확인 필요</span>';

  const findingCards = report.findings
    .map(
      (f) => `
    <div class="card sev-${esc(f.severity)}">
      <div class="row"><span class="lbl">무엇이 문제인가요</span><span class="val">${esc(f.what)}</span></div>
      <div class="row"><span class="lbl">왜 그런가요</span><span class="val">${esc(f.why)}</span></div>
      <div class="row"><span class="lbl">어떻게 고치나요</span><span class="val">${esc(f.how)}</span></div>
      ${f.evidence ? `<details><summary>개발자용 기술 정보</summary><code>${esc(f.evidence)}</code></details>` : ""}
    </div>`,
    )
    .join("\n");

  const shotEls = shots
    .map((s) => `<figure><figcaption>${esc(s.label)}</figcaption><img src="${esc(s.src)}" alt="${esc(s.label)}"/></figure>`)
    .join("\n");

  const nextEls = report.nextSteps.map((n) => `<li>${esc(n)}</li>`).join("");
  const noteEls = report.notes.map((n) => `<li>${esc(n)}</li>`).join("");

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(report.title)}</title>
<style>
  body{font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;max-width:860px;margin:0 auto;padding:24px;color:#18181b;background:#fafafa;line-height:1.6}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#71717a;font-size:14px;margin:0 0 16px;word-break:break-all}
  .verdict{font-size:18px;font-weight:600;margin:12px 0}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:14px;font-weight:600;margin-left:6px}
  .badge.ok{background:#dcfce7;color:#166534}.badge.bad{background:#fee2e2;color:#991b1b}.badge.warn{background:#fef9c3;color:#854d0e}
  .oneline{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:14px 16px;margin:12px 0 20px}
  h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #e4e4e7;padding-bottom:6px}
  .card{background:#fff;border:1px solid #e4e4e7;border-left-width:4px;border-radius:10px;padding:14px 16px;margin:10px 0}
  .card.sev-high{border-left-color:#dc2626}.card.sev-medium{border-left-color:#d97706}.card.sev-low{border-left-color:#65a30d}.card.sev-info{border-left-color:#94a3b8}
  .row{display:flex;gap:10px;margin:4px 0}.lbl{flex:0 0 130px;color:#71717a;font-size:13px}.val{flex:1}
  details{margin-top:8px}summary{cursor:pointer;color:#71717a;font-size:13px}code{display:block;background:#f4f4f5;padding:8px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-all;margin-top:6px}
  figure{margin:12px 0}figcaption{font-size:13px;color:#52525b;margin-bottom:6px}img{width:100%;border:1px solid #e4e4e7;border-radius:8px}
  video{width:100%;border-radius:8px;border:1px solid #e4e4e7}
  ul{padding-left:20px}li{margin:4px 0}
  .foot{color:#a1a1aa;font-size:12px;margin-top:28px}
</style></head>
<body>
  <h1>${esc(report.title)} ${worksBadge}</h1>
  <p class="sub">대상: ${esc(report.target)}</p>
  <p class="sub">확인하려던 것: ${esc(report.intent)}</p>
  <div class="verdict">판정: ${esc(report.verdict)}</div>
  <div class="oneline">${esc(report.oneLine)}</div>

  <h2>무엇을 발견했나요</h2>
  ${report.findings.length ? findingCards : "<p>특별히 막히는 지점을 찾지 못했어요.</p>"}

  ${shots.length ? `<h2>화면으로 보기</h2>${shotEls}` : ""}
  ${videoSrc ? `<h2>진행 영상</h2><video controls src="${esc(videoSrc)}"></video>` : ""}

  <h2>다음에 해볼 것</h2>
  <ul>${nextEls}</ul>

  <h2>안내</h2>
  <ul>${noteEls}</ul>

  <p class="foot">Simsa 검수 · 실제 브라우저 관찰 기반 · 점수 없음 · 모든 버그를 찾았다는 뜻은 아닙니다.</p>
</body></html>`;
}
