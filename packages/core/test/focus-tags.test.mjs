import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectDiffFocus,
  detectFailureFocus,
  focusSetsIntersect,
  shouldMatchByFocus,
} from "../dist/memory/focus-tags.js";

/**
 * v0.14.3 — direct unit tests for the focus-tag detector.
 *
 * Most coverage today lives in failure-gate.test.mjs / catch-regression.test.mjs
 * which exercise the detector through applyFailureGate end-to-end. These
 * tests pin down the primitives so adding a new tag (the v0.14.3 expansion
 * to security / i18n / forms / state-management) is a pure additive
 * change.
 */

// Minimal shape — detectFailureFocus only reads { title, body, category,
// tags, id, seedBlocker?.category }, so we don't need the full
// FailureEntry envelope here.
function mkFailure(over = {}) {
  return {
    id: "fc-x",
    title: "x",
    body: "x",
    category: "other",
    severity: "minor",
    tags: [],
    ...over,
  };
}

// ---- existing 8 tags ---------------------------------------------------

test("detectDiffFocus: a11y diff → accessibility", () => {
  const d = detectDiffFocus(`+<button aria-label="save" tabIndex={0}>x</button>`);
  assert.ok(d.has("accessibility"));
});

test("detectDiffFocus: rainbow gradient → visual-decoration", () => {
  const d = detectDiffFocus(`+const palette = ['rainbow', 'gradient', 'accent'];`);
  assert.ok(d.has("visual-decoration"));
});

// ---- security ----------------------------------------------------------

test("detectDiffFocus: dangerouslySetInnerHTML → security", () => {
  const d = detectDiffFocus(`+  <div dangerouslySetInnerHTML={{ __html: userBio }} />`);
  assert.ok(d.has("security"));
});

test("detectDiffFocus: eval() → security", () => {
  const d = detectDiffFocus(`+  const result = eval(userInput);`);
  assert.ok(d.has("security"));
});

test("detectDiffFocus: hardcoded password phrase → security", () => {
  const d = detectDiffFocus(`+const apiKey = "sk-..."; // hardcoded credential`);
  assert.ok(d.has("security"));
});

test("detectDiffFocus: SQL injection mention → security", () => {
  const d = detectDiffFocus(`// fixes SQL injection vector in /api/users`);
  assert.ok(d.has("security"));
});

test("detectDiffFocus: jwt.verify → security", () => {
  const d = detectDiffFocus(`+const payload = jwt.verify(token, secret);`);
  assert.ok(d.has("security"));
});

test("detectFailureFocus: bcrypt failure entry → security", () => {
  const f = mkFailure({
    title: "Password stored without bcrypt hashing",
    body: "Use bcrypt or argon2 to hash passwords before storing.",
    tags: ["auth"],
  });
  assert.ok(detectFailureFocus(f).has("security"));
});

// ---- i18n --------------------------------------------------------------

test("detectDiffFocus: useTranslation → i18n", () => {
  const d = detectDiffFocus(`+const { t } = useTranslation('common');`);
  assert.ok(d.has("i18n"));
});

test("detectDiffFocus: dir=\"rtl\" → i18n", () => {
  const d = detectDiffFocus(`+<html dir="rtl" lang="ar">`);
  assert.ok(d.has("i18n"));
});

test("detectDiffFocus: next-intl import → i18n", () => {
  const d = detectDiffFocus(`+import { useLocale } from 'next-intl';`);
  assert.ok(d.has("i18n"));
});

test("detectFailureFocus: missing translation key → i18n", () => {
  const f = mkFailure({
    title: "Hardcoded English string instead of translation key",
    body: "Use the i18n message catalog (messages.json) — don't hardcode user-facing English.",
    tags: ["copy"],
  });
  assert.ok(detectFailureFocus(f).has("i18n"));
});

// ---- forms -------------------------------------------------------------

test("detectDiffFocus: zod safeParse → forms", () => {
  const d = detectDiffFocus(`+const result = LoginSchema.safeParse(body);`);
  assert.ok(d.has("forms"));
});

test("detectDiffFocus: react-hook-form useForm → forms", () => {
  const d = detectDiffFocus(`+const { register, formState } = useForm();`);
  assert.ok(d.has("forms"));
});

test("detectFailureFocus: missing form validation → forms", () => {
  const f = mkFailure({
    title: "No client-side validation on signup form",
    body: "Add a zod schema with safeParse and surface field errors.",
    tags: ["validation"],
  });
  assert.ok(detectFailureFocus(f).has("forms"));
});

// ---- state-management --------------------------------------------------

test("detectDiffFocus: useState hook → state-management", () => {
  const d = detectDiffFocus(`+const [count, setCount] = useState(0);`);
  assert.ok(d.has("state-management"));
});

test("detectDiffFocus: zustand createStore → state-management", () => {
  const d = detectDiffFocus(`+const useBearStore = createStore((set) => ({ bears: 0 }));`);
  assert.ok(d.has("state-management"));
});

test("detectDiffFocus: redux dispatch → state-management", () => {
  const d = detectDiffFocus(`+  dispatch(addItem({ id }));`);
  assert.ok(d.has("state-management"));
});

test("detectFailureFocus: state lifted-up failure → state-management", () => {
  const f = mkFailure({
    title: "useState in shared parent should be lifted to a store",
    body: "Use zustand/jotai for shared state instead of prop-drilling useState.",
    tags: ["architecture"],
  });
  assert.ok(detectFailureFocus(f).has("state-management"));
});

// ---- cross-tag isolation -----------------------------------------------

test("security signals don't leak into i18n / forms / state-management", () => {
  const d = detectDiffFocus(`+<div dangerouslySetInnerHTML={{ __html: bio }} />`);
  assert.ok(!d.has("i18n"));
  assert.ok(!d.has("forms"));
  assert.ok(!d.has("state-management"));
});

test("i18n signals don't leak into security / forms / state-management", () => {
  const d = detectDiffFocus(`+const { t } = useTranslation('common');`);
  assert.ok(!d.has("security"));
  assert.ok(!d.has("forms"));
  assert.ok(!d.has("state-management"));
});

test("forms signals don't leak into security / i18n / state-management", () => {
  const d = detectDiffFocus(`+const result = LoginSchema.safeParse(body);`);
  assert.ok(!d.has("security"));
  assert.ok(!d.has("i18n"));
  assert.ok(!d.has("state-management"));
});

test("state-management signals don't leak into security / i18n / forms", () => {
  const d = detectDiffFocus(`+const [count, setCount] = useState(0);`);
  assert.ok(!d.has("security"));
  assert.ok(!d.has("i18n"));
  // useState alone doesn't imply forms — tests that forms isn't an
  // accidental superset.
  assert.ok(!d.has("forms"));
});

// ---- shouldMatchByFocus glue with new tags -----------------------------

test("shouldMatchByFocus: security diff + i18n failure → drop", () => {
  const securityDiff = new Set(["security"]);
  const i18nFailure = new Set(["i18n"]);
  assert.equal(shouldMatchByFocus(securityDiff, i18nFailure), false);
});

test("shouldMatchByFocus: security diff + security failure → keep", () => {
  const securityDiff = new Set(["security"]);
  const securityFailure = new Set(["security"]);
  assert.equal(shouldMatchByFocus(securityDiff, securityFailure), true);
});

test("shouldMatchByFocus: empty failure focus → fall through (regression-safe)", () => {
  const formsDiff = new Set(["forms"]);
  const noFocus = new Set();
  assert.equal(shouldMatchByFocus(formsDiff, noFocus), true);
});

test("focusSetsIntersect across new tags", () => {
  const a = new Set(["security", "forms"]);
  const b = new Set(["i18n", "forms"]);
  assert.equal(focusSetsIntersect(a, b), true);

  const c = new Set(["security"]);
  const d = new Set(["state-management"]);
  assert.equal(focusSetsIntersect(c, d), false);
});
