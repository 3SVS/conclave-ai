import { test } from "node:test";
import assert from "node:assert/strict";
import { emitProgress } from "../dist/lib/progress-emit.js";

/**
 * v0.11 — emitProgress unit tests.
 *
 * The helper has two contracts: (1) skip notifiers without notifyProgress
 * (forward-compat — Discord/Slack/Email pre-v0.11), and (2) NEVER throw,
 * even when a notifier's notifyProgress fails — failures are logged and
 * swallowed so a 429 / network blip can't break a review.
 */

function makeNotifier(id, opts = {}) {
  const calls = [];
  const n = {
    id,
    displayName: id,
    async notifyReview() {},
  };
  if (!opts.skipProgress) {
    n.notifyProgress = async (input) => {
      calls.push(input);
      if (opts.throwOnProgress) throw new Error("simulated network blip");
    };
  }
  n.calls = calls;
  return n;
}

// Controlled promise so tests drive completion order explicitly instead of
// racing wall-clock timers.
function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Wait until `events` reaches `count`, advancing only on real progress
// (microtask/poll), never a fixed delay. The timeout is a hang guard, not the
// normal path, so it can't introduce ordering races.
async function waitForEventCount({ events, count, timeoutMs = 2000 }) {
  const start = Date.now();
  while (events.length < count) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitForEventCount: timed out waiting for ${count} events (got ${events.length}: ${events.join(",")})`,
      );
    }
    await new Promise((r) => setImmediate(r));
  }
}

test("emitProgress: empty notifier list is a no-op", async () => {
  await emitProgress([], { episodicId: "ep", stage: "review-started" });
  // No throw, no side effects to assert beyond the absence of one.
});

test("emitProgress: forwards to every notifier that implements notifyProgress", async () => {
  const a = makeNotifier("a");
  const b = makeNotifier("b");
  await emitProgress([a, b], { episodicId: "ep-1", stage: "tier1-done", payload: { blockerCount: 2 } });
  assert.equal(a.calls.length, 1);
  assert.equal(b.calls.length, 1);
  assert.equal(a.calls[0].stage, "tier1-done");
});

test("emitProgress: skips notifiers without notifyProgress (pre-v0.11 surfaces)", async () => {
  const ok = makeNotifier("tg");
  const legacy = makeNotifier("email", { skipProgress: true });
  await emitProgress([ok, legacy], { episodicId: "ep", stage: "review-started" });
  assert.equal(ok.calls.length, 1);
  // Legacy notifier has no notifyProgress method — calls array stays empty.
  assert.equal(legacy.calls.length, 0);
  assert.equal(legacy.notifyProgress, undefined);
});

test("emitProgress: a throwing notifier does NOT crash the review", async () => {
  const ok = makeNotifier("tg");
  const broken = makeNotifier("discord", { throwOnProgress: true });
  let stderr = "";
  const origWrite = process.stderr.write;
  process.stderr.write = (s) => {
    stderr += s;
    return true;
  };
  try {
    await emitProgress([ok, broken], { episodicId: "ep-x", stage: "tier1-done" });
  } finally {
    process.stderr.write = origWrite;
  }
  assert.equal(ok.calls.length, 1);
  assert.match(stderr, /discord notifyProgress failed/);
  assert.match(stderr, /simulated network blip/);
});

test("emitProgress: emits to all notifiers in parallel (Promise.all semantics)", async () => {
  const started = [];
  const completed = [];
  const gates = { a: createDeferred(), b: createDeferred(), c: createDeferred() };
  const make = (id) => ({
    id,
    displayName: id,
    async notifyReview() {},
    async notifyProgress() {
      started.push(id);
      await gates[id].promise; // block until the test releases this notifier
      completed.push(id);
    },
  });

  // Kick off the fan-out but DON'T await yet — all notifiers are now in flight.
  const done = emitProgress(
    [make("a"), make("b"), make("c")],
    { episodicId: "ep", stage: "review-started" },
  );

  // Parallel proof (deterministic, no timers): all three notifiers START
  // before any completes. A serial implementation would only start "a" and
  // block — waitForEventCount would then time out, failing the test loudly.
  await waitForEventCount({ events: started, count: 3 });
  assert.deepEqual([...started].sort(), ["a", "b", "c"]);
  assert.equal(completed.length, 0, "no notifier should finish before the test releases it");

  // Release in an explicit order; completion order is now driven by us, not by
  // wall-clock delays. Wait for each completion before releasing the next so
  // the recorded order is deterministic.
  gates.b.resolve();
  await waitForEventCount({ events: completed, count: 1 });
  gates.c.resolve();
  await waitForEventCount({ events: completed, count: 2 });
  gates.a.resolve();
  await done;

  assert.deepEqual(completed, ["b", "c", "a"]);
});
