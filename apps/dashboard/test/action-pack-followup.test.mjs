// Stage 78: pure follow-up helpers — label keys + payload builder + list-item
// mapping. Tested against the EN dictionary so i18n parity remains an
// authoritative source for follow-up status labels.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOWUP_STATUSES,
  followupStatusLabelKey,
  buildFollowupPayload,
  mapListItemFollowup,
} from "../src/lib/action-pack-followup.mjs";
import { DICTIONARIES } from "../src/i18n/dictionary.mjs";

const s = DICTIONARIES.en.evolution;

test("FOLLOWUP_STATUSES enumerates the seven spec values", () => {
  assert.deepEqual([...FOLLOWUP_STATUSES].sort(), [
    "abandoned",
    "benchmarked",
    "completed",
    "copied",
    "in_progress",
    "not_started",
    "reviewed",
  ]);
});

test("followupStatusLabelKey returns a key resolvable on t.evolution for every status", () => {
  for (const status of FOLLOWUP_STATUSES) {
    const key = followupStatusLabelKey(status);
    assert.ok(s[key], `expected dictionary entry for ${status} (key=${key})`);
  }
});

test("followupStatusLabelKey falls back to statusNotStarted for unknown input", () => {
  assert.equal(followupStatusLabelKey(null), "statusNotStarted");
  assert.equal(followupStatusLabelKey(undefined), "statusNotStarted");
  assert.equal(followupStatusLabelKey("wat"), "statusNotStarted");
});

test("buildFollowupPayload: status + userKey required, optionals only when non-empty", () => {
  const minimal = buildFollowupPayload({ userKey: "uk_x", status: "copied" });
  assert.deepEqual(minimal, { userKey: "uk_x", status: "copied" });
});

test("buildFollowupPayload: empty strings are dropped, real values included", () => {
  const payload = buildFollowupPayload({
    userKey: "uk_x",
    status: "reviewed",
    pullRequestNumber: 12,
    reviewRunId: "  wprr_a  ",
    benchmarkId: "",
    note: "Used pack.",
  });
  assert.equal(payload.pullRequestNumber, 12);
  assert.equal(payload.reviewRunId, "wprr_a");
  assert.equal(payload.benchmarkId, undefined);
  assert.equal(payload.note, "Used pack.");
});

test("buildFollowupPayload: rejects invalid PR numbers (non-int, <1)", () => {
  const a = buildFollowupPayload({ userKey: "uk_x", status: "copied", pullRequestNumber: 0 });
  assert.equal(a.pullRequestNumber, undefined);
  const b = buildFollowupPayload({ userKey: "uk_x", status: "copied", pullRequestNumber: -3 });
  assert.equal(b.pullRequestNumber, undefined);
  const c = buildFollowupPayload({ userKey: "uk_x", status: "copied", pullRequestNumber: 1.5 });
  assert.equal(c.pullRequestNumber, undefined);
});

test("mapListItemFollowup maps a saved-pack list item to status + i18n key", () => {
  const mapped = mapListItemFollowup({
    id: "weap_1",
    experimentId: "wexp_1",
    recommendedAction: "fix_selected",
    title: "Fix the selected candidate",
    createdAt: "2026-06-21T00:00:00Z",
    followupStatus: "reviewed",
    followupPullRequestNumber: 7,
    followupReviewRunId: "wprr_a",
    followedAt: "2026-06-21T01:00:00Z",
  });
  assert.equal(mapped.status, "reviewed");
  assert.equal(mapped.labelKey, "statusReviewed");
  assert.equal(mapped.pullRequestNumber, 7);
  assert.equal(mapped.reviewRunId, "wprr_a");
  assert.equal(mapped.followedAt, "2026-06-21T01:00:00Z");
});

test("mapListItemFollowup falls back to not_started for missing follow-up fields", () => {
  const mapped = mapListItemFollowup({
    id: "weap_1",
    experimentId: "wexp_1",
    recommendedAction: "create_benchmark",
    title: "Create a benchmark first",
    createdAt: "2026-06-21T00:00:00Z",
  });
  assert.equal(mapped.status, "not_started");
  assert.equal(mapped.labelKey, "statusNotStarted");
  assert.equal(mapped.pullRequestNumber, undefined);
});
