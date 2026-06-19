// Stage 67: deterministic GitHub PR-comment markdown for a saved benchmark.
//
// PURE — no LLM, no network, no randomness, no token/userKey. The caller passes
// already-localized labels/lines (so the markdown follows the UI language); this
// module only fixes the markdown structure. The benchmark result carries no
// secrets, so nothing sensitive can leak into the output.

/**
 * Resolve whether a benchmark may be posted to a single PR.
 * Allowed only when every candidate's review run points to the SAME PR number.
 * A benchmark spanning different PRs is copy-only (it doesn't belong on one PR).
 */
export function resolveBenchmarkPrTarget(candidates) {
  const list = candidates ?? [];
  if (list.length === 0) return { canPost: false };
  const prNumbers = list.map((c) => c.pullRequestNumber);
  if (prNumbers.some((n) => typeof n !== "number")) return { canPost: false };
  const first = prNumbers[0];
  if (prNumbers.every((n) => n === first)) return { canPost: true, prNumber: first };
  return { canPost: false };
}

/**
 * Build the deterministic PR-comment markdown. All variable text is passed in
 * pre-localized; this assembler fixes structure, table layout, and headings.
 */
export function buildBenchmarkPrCommentMarkdown(parts) {
  const {
    heading,
    intro,
    alignmentWarning,
    recommendationLabel,
    recommendationValue,
    noClearWinnerBody,
    columns,
    rows = [],
    whyHeading,
    whyLines = [],
    blockersHeading,
    blockerLines = [],
    noBlockersLine,
    noteHeading,
    noteText,
  } = parts;

  const out = [`## ${heading}`, "", intro, ""];

  if (alignmentWarning) {
    out.push(`> Warning: ${alignmentWarning}`, "");
  }

  out.push(`**${recommendationLabel}:** ${recommendationValue}`);
  if (noClearWinnerBody) out.push(noClearWinnerBody);
  out.push("");

  out.push(`| ${columns.candidate} | ${columns.mode} | ${columns.passed} | ${columns.critical} | ${columns.notVerified} | ${columns.score} |`);
  out.push("| --- | --- | ---: | ---: | ---: | ---: |");
  for (const r of rows) {
    out.push(`| ${r.label} | ${r.mode} | ${r.passed}/${r.total} | ${r.critical} | ${r.notVerified} | ${r.score} |`);
  }

  if (whyLines.length > 0) {
    out.push("", `### ${whyHeading}`, "");
    for (const line of whyLines) out.push(`- ${line}`);
  }

  out.push("", `### ${blockersHeading}`, "");
  if (blockerLines.length > 0) {
    // Each entry is a plain string (count-based, Stage 67) OR { text, evidence? }
    // (item-level, Stage 68). An evidence sub-line is indented under its item.
    for (const line of blockerLines) {
      const entry = typeof line === "string" ? { text: line } : line;
      out.push(`- ${entry.text}`);
      if (entry.evidence) out.push(`  - ${entry.evidence}`);
    }
  } else {
    out.push(noBlockersLine);
  }

  out.push("", `### ${noteHeading}`, "", noteText);

  return out.join("\n");
}
