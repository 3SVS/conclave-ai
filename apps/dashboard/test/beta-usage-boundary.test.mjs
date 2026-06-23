// Stage 122 — beta usage/cost boundary copy tests. Honest + conservative: no
// agent/benchmark execution, no active billing, no paid-plan language.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BETA_USAGE_BOUNDARY_HEADING,
  BETA_USAGE_BOUNDARY_ITEMS,
  BETA_USAGE_NOT_ACTIVE_COPY,
  SAVED_WORKFLOW_USAGE_NOTE,
  ADMIN_USAGE_BOUNDARY_NOTE,
  ADMIN_COUNTS_SIGNAL_NOTE,
} from "../src/lib/beta-usage-boundary.mjs";

// Active-billing language that must NOT appear as a current claim.
const ACTIVE_BILLING = ["charged", "invoice", "paid plan", "metered usage", "subscription", "payment required"];

const allCopy = [
  BETA_USAGE_BOUNDARY_HEADING,
  ...BETA_USAGE_BOUNDARY_ITEMS,
  BETA_USAGE_NOT_ACTIVE_COPY,
  SAVED_WORKFLOW_USAGE_NOTE,
  ADMIN_USAGE_BOUNDARY_NOTE,
  ADMIN_COUNTS_SIGNAL_NOTE,
]
  .join(" ")
  .toLowerCase();

test("usage boundary mentions deterministic preview", () => {
  assert.match(BETA_USAGE_BOUNDARY_ITEMS.join(" ").toLowerCase(), /deterministic preview/);
});

test("usage boundary says no agent execution", () => {
  assert.match(BETA_USAGE_BOUNDARY_ITEMS.join(" ").toLowerCase(), /does not execute agents/);
});

test("usage boundary says no benchmark execution", () => {
  assert.match(BETA_USAGE_BOUNDARY_ITEMS.join(" ").toLowerCase(), /run benchmarks/);
});

test("usage boundary says no billing active", () => {
  assert.match(BETA_USAGE_NOT_ACTIVE_COPY.toLowerCase(), /no billing or paid usage is active/);
});

test("copy avoids active-billing language", () => {
  for (const w of ACTIVE_BILLING) {
    assert.ok(!allCopy.includes(w), `copy must not imply active billing ("${w}")`);
  }
});

test("saved workflow note clarifies snapshots are not completed runs/benchmarks", () => {
  const s = SAVED_WORKFLOW_USAGE_NOTE.toLowerCase();
  assert.match(s, /not completed agent runs or benchmark results/);
});

test("admin note says summaries only, no billing/execution", () => {
  const s = ADMIN_USAGE_BOUNDARY_NOTE.toLowerCase();
  assert.match(s, /summaries only/);
  assert.match(s, /does not show usage charges, billing/);
});

test("admin counts note frames counts as activity signals, not billing metrics", () => {
  assert.match(ADMIN_COUNTS_SIGNAL_NOTE.toLowerCase(), /activity signals, not billing metrics/);
});

test("future limits are framed as future, not active", () => {
  assert.match(BETA_USAGE_BOUNDARY_ITEMS.join(" ").toLowerCase(), /future ai\/agent execution features will need explicit usage limits/);
});
