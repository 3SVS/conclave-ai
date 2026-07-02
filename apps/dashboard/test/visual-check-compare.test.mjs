import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  compareWorks,
  pairEvidenceScreenshots,
  compareVisualChecks,
  pickPreviousDoneCheck,
  latestDoneTransition,
} from "../src/lib/visual-check-compare.mjs";
import { getDictionary } from "../src/i18n/dictionary.mjs";

/** Minimal VisualCheckDetail-shaped run for comparison tests. */
function makeCheck(overrides = {}) {
  return {
    id: "run_x",
    works: true,
    decision: "release_ok",
    status: "done",
    createdAt: "2026-07-01T10:00:00.000Z",
    report: { works: true, findings: [] },
    evidenceKeys: [],
    ...overrides,
  };
}

describe("visual-check-compare: compareWorks ordering (true > null > false)", () => {
  it("moving up the ordering is improved", () => {
    assert.equal(compareWorks(false, null), "improved");
    assert.equal(compareWorks(false, true), "improved");
    assert.equal(compareWorks(null, true), "improved");
  });

  it("moving down the ordering is regressed", () => {
    assert.equal(compareWorks(true, null), "regressed");
    assert.equal(compareWorks(true, false), "regressed");
    assert.equal(compareWorks(null, false), "regressed");
  });

  it("same rank is unchanged, and undefined ranks like null", () => {
    assert.equal(compareWorks(true, true), "unchanged");
    assert.equal(compareWorks(false, false), "unchanged");
    assert.equal(compareWorks(null, null), "unchanged");
    assert.equal(compareWorks(undefined, null), "unchanged");
    assert.equal(compareWorks(undefined, true), "improved");
    assert.equal(compareWorks(false, undefined), "improved");
  });
});

describe("visual-check-compare: compareVisualChecks", () => {
  it("returns comparable:false with a reason when a run is missing", () => {
    assert.deepEqual(compareVisualChecks(null, makeCheck()), {
      comparable: false,
      reason: "missing_previous_run",
    });
    assert.deepEqual(compareVisualChecks(makeCheck(), undefined), {
      comparable: false,
      reason: "missing_latest_run",
    });
  });

  it("returns comparable:false when either non-dev report is missing", () => {
    assert.deepEqual(compareVisualChecks(makeCheck({ report: null }), makeCheck()), {
      comparable: false,
      reason: "missing_previous_report",
    });
    assert.deepEqual(compareVisualChecks(makeCheck(), makeCheck({ report: null })), {
      comparable: false,
      reason: "missing_latest_report",
    });
  });

  it("carries works + decision through the verdict transition (labels only, no score)", () => {
    const res = compareVisualChecks(
      makeCheck({ works: null, decision: "check_first" }),
      makeCheck({ works: true, decision: "release_ok" }),
    );
    assert.equal(res.comparable, true);
    assert.deepEqual(res.verdictTransition, {
      from: { works: null, decision: "check_first" },
      to: { works: true, decision: "release_ok" },
      direction: "improved",
    });
    // Simsa policy: no numeric scores anywhere in the result.
    assert.ok(!JSON.stringify(res).includes("score"));
  });

  it("normalizes missing works to null in the transition", () => {
    const res = compareVisualChecks(
      makeCheck({ works: undefined, decision: undefined }),
      makeCheck({ works: false }),
    );
    assert.deepEqual(res.verdictTransition.from, { works: null, decision: "" });
    assert.equal(res.verdictTransition.direction, "regressed");
  });

  it("partitions findings into resolved / remaining / introduced by trimmed what", () => {
    const prev = makeCheck({
      report: {
        findings: [
          { severity: "high", what: "Login button does nothing", why: "", how: "" },
          { severity: "medium", what: "  Slow first load  ", why: "", how: "" },
        ],
      },
    });
    const latest = makeCheck({
      report: {
        findings: [
          { severity: "low", what: "Slow first load", why: "", how: "" },
          { severity: "high", what: "Checkout crashes", why: "", how: "" },
        ],
      },
    });
    const res = compareVisualChecks(prev, latest);
    assert.deepEqual(res.findings.resolved, [
      { severity: "high", what: "Login button does nothing" },
    ]);
    // Remaining carries the LATEST severity (the current state of the issue).
    assert.deepEqual(res.findings.remaining, [{ severity: "low", what: "Slow first load" }]);
    assert.deepEqual(res.findings.introduced, [{ severity: "high", what: "Checkout crashes" }]);
  });

  it("is defensive about findings: empty arrays, duplicates, blank what, non-objects", () => {
    const prev = makeCheck({ report: { findings: undefined } });
    const latest = makeCheck({
      report: {
        findings: [
          null,
          "nope",
          { severity: "info", what: "   " },
          { severity: "high", what: "Same issue" },
          { severity: "low", what: "Same issue " }, // duplicate after trim → first wins
        ],
      },
    });
    const res = compareVisualChecks(prev, latest);
    assert.deepEqual(res.findings.resolved, []);
    assert.deepEqual(res.findings.remaining, []);
    assert.deepEqual(res.findings.introduced, [{ severity: "high", what: "Same issue" }]);
  });

  it("pairs screenshots present in both runs and lists leftovers per side", () => {
    const prev = makeCheck({
      evidenceKeys: [
        "screenshots/step-01-search.png",
        "screenshots/step-00-initial.png",
        "screenshots/step-02-old-flow.png",
        "video/flow.webm",
      ],
    });
    const latest = makeCheck({
      evidenceKeys: [
        "screenshots/step-00-initial.png",
        "screenshots/step-01-search.png",
        "screenshots/step-03-new-flow.png",
      ],
    });
    const res = compareVisualChecks(prev, latest);
    assert.deepEqual(res.evidencePairs, {
      pairs: [
        { name: "screenshots/step-00-initial.png", prev: true, latest: true },
        { name: "screenshots/step-01-search.png", prev: true, latest: true },
      ],
      prevOnly: ["screenshots/step-02-old-flow.png"],
      latestOnly: ["screenshots/step-03-new-flow.png"],
    });
  });
});

describe("visual-check-compare: pairEvidenceScreenshots", () => {
  it("ignores non-arrays, non-strings, video and unknown prefixes", () => {
    assert.deepEqual(pairEvidenceScreenshots(null, "nope"), {
      pairs: [],
      prevOnly: [],
      latestOnly: [],
    });
    const res = pairEvidenceScreenshots(
      [42, "video/flow.webm", "logs/console.txt", "screenshots/a.png"],
      ["screenshots/a.png", "video/flow.webm"],
    );
    assert.deepEqual(res, {
      pairs: [{ name: "screenshots/a.png", prev: true, latest: true }],
      prevOnly: [],
      latestOnly: [],
    });
  });

  it("handles fully disjoint sets (no pairs, everything unmatched)", () => {
    const res = pairEvidenceScreenshots(["screenshots/old.png"], ["screenshots/new.png"]);
    assert.deepEqual(res.pairs, []);
    assert.deepEqual(res.prevOnly, ["screenshots/old.png"]);
    assert.deepEqual(res.latestOnly, ["screenshots/new.png"]);
  });
});

describe("visual-check-compare: pickPreviousDoneCheck", () => {
  const list = [
    { id: "r4", status: "done", works: true, createdAt: "2026-07-01T12:00:00Z" },
    { id: "r3", status: "failed", works: null, createdAt: "2026-07-01T11:00:00Z" },
    { id: "r2", status: "done", works: false, createdAt: "2026-07-01T10:00:00Z" },
    { id: "r1", status: "done", works: null, createdAt: "2026-07-01T09:00:00Z" },
  ];

  it("picks the most recent done run strictly older than the current one", () => {
    const prev = pickPreviousDoneCheck(list, "r4", "2026-07-01T12:00:00Z");
    assert.equal(prev?.id, "r2"); // r3 skipped (failed), r2 is newest older done
  });

  it("skips newer runs and the current run itself", () => {
    const prev = pickPreviousDoneCheck(list, "r2", "2026-07-01T10:00:00Z");
    assert.equal(prev?.id, "r1");
  });

  it("returns null when there is nothing older, or inputs are unusable", () => {
    assert.equal(pickPreviousDoneCheck(list, "r1", "2026-07-01T09:00:00Z"), null);
    assert.equal(pickPreviousDoneCheck(list, "r4", "not-a-date"), null);
    assert.equal(pickPreviousDoneCheck(null, "r4", "2026-07-01T12:00:00Z"), null);
    assert.equal(pickPreviousDoneCheck([], "r4", "2026-07-01T12:00:00Z"), null);
  });
});

describe("visual-check-compare: latestDoneTransition (list chip)", () => {
  it("describes the transition on the latest done run when verdicts differ", () => {
    const res = latestDoneTransition([
      { id: "r3", status: "running", works: null, createdAt: "2026-07-01T12:00:00Z" },
      { id: "r2", status: "done", works: true, createdAt: "2026-07-01T11:00:00Z" },
      { id: "r1", status: "done", works: null, createdAt: "2026-07-01T10:00:00Z" },
    ]);
    assert.deepEqual(res, { runId: "r2", direction: "improved", fromWorks: null, toWorks: true });
  });

  it("returns null when verdicts match or there are fewer than two done runs", () => {
    assert.equal(
      latestDoneTransition([
        { id: "r2", status: "done", works: true, createdAt: "2026-07-01T11:00:00Z" },
        { id: "r1", status: "done", works: true, createdAt: "2026-07-01T10:00:00Z" },
      ]),
      null,
    );
    assert.equal(
      latestDoneTransition([
        { id: "r1", status: "done", works: true, createdAt: "2026-07-01T10:00:00Z" },
      ]),
      null,
    );
    assert.equal(latestDoneTransition([]), null);
    assert.equal(latestDoneTransition(null), null);
  });

  it("orders by createdAt, not by array position", () => {
    const res = latestDoneTransition([
      { id: "old", status: "done", works: true, createdAt: "2026-07-01T09:00:00Z" },
      { id: "new", status: "done", works: false, createdAt: "2026-07-01T13:00:00Z" },
    ]);
    assert.deepEqual(res, { runId: "new", direction: "regressed", fromWorks: true, toWorks: false });
  });
});

describe("visual-check-compare: dictionary keys", () => {
  it("visualChecks.compare.* exists in both locales with non-empty copy", () => {
    for (const loc of ["en", "ko"]) {
      const d = getDictionary(loc);
      for (const k of [
        "title", "desc", "improved", "regressed", "unchanged",
        "resolvedTitle", "remainingTitle", "introducedTitle",
        "noneResolved", "noneRemaining", "noneIntroduced",
        "screenshotsTitle", "showScreenshots", "hideScreenshots",
        "prevLabel", "latestLabel", "prevOnly", "latestOnly", "noPairs",
      ]) {
        assert.ok(
          typeof d.visualChecks.compare[k] === "string" && d.visualChecks.compare[k].length > 0,
          `${loc}.visualChecks.compare.${k} missing`,
        );
      }
    }
    assert.equal(getDictionary("ko").visualChecks.compare.improved, "좋아졌어요");
    assert.equal(getDictionary("ko").visualChecks.compare.regressed, "나빠졌어요");
  });
});
