// Hermetic tests for AF-10 (numeric input validator) and AF-11
// (hover:opacity-N → hover:bg-COLOR-darker restore).

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  tryNumericValidatorFix,
} from "../dist/lib/autofix-handlers/numeric-input-validator.js";
import { tryHoverRestoreFix } from "../dist/lib/autofix-handlers/hover-restore.js";

async function tmp(label) {
  return fs.mkdtemp(path.join(os.tmpdir(), `conclave-af-${label}-`));
}

function makeGit() {
  const calls = [];
  return {
    calls,
    git: async (_bin, args) => {
      calls.push([...args]);
      return { stdout: "", stderr: "", code: 0 };
    },
  };
}

// ---- AF-10 numeric input validator -----------------------------------

test("AF-10: claims correctness blocker with `ratio` in backticks", async () => {
  const cwd = await tmp("af10-claim");
  const file = "src/util.js";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `\
export function lightenChannel(hex, ratio) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return clamped;
}
`);
  const git = makeGit();
  const r = await tryNumericValidatorFix(
    "claude",
    {
      severity: "major",
      category: "correctness",
      message: "lightenChannel clamps `ratio` without validating that it is finite — undefined/NaN propagates.",
      file,
      line: 2,
    },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r.claimed, true);
  const after = await fs.readFile(abs, "utf8");
  assert.match(after, /if \(!Number\.isFinite\(ratio\)\) ratio = 0;/);
});

test("AF-10: declines when no parameter is named in backticks", async () => {
  const cwd = await tmp("af10-noparam");
  const file = "src/util.js";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `\
export function lightenChannel(hex, ratio) {
  return ratio;
}
`);
  const git = makeGit();
  const r = await tryNumericValidatorFix(
    "claude",
    {
      severity: "major",
      category: "correctness",
      message: "Function lacks input validation — NaN propagates.",
      file,
      line: 1,
    },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r.claimed, false);
});

test("AF-10: declines when guard already exists", async () => {
  const cwd = await tmp("af10-already");
  const file = "src/util.js";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `\
export function lightenChannel(hex, ratio) {
  if (!Number.isFinite(ratio)) ratio = 0;
  return ratio;
}
`);
  const git = makeGit();
  const r = await tryNumericValidatorFix(
    "claude",
    {
      severity: "major",
      category: "correctness",
      message: "Validate `ratio` is finite",
      file,
      line: 1,
    },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r.claimed, false);
});

test("AF-10: declines on non-numeric category (security, perf, etc)", async () => {
  const cwd = await tmp("af10-wrongcat");
  const file = "src/util.js";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `export function f(x) { return x; }\n`);
  const git = makeGit();
  const r = await tryNumericValidatorFix(
    "claude",
    {
      severity: "major",
      category: "security",
      message: "Validate `x` is finite",
      file,
      line: 1,
    },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r.claimed, false);
});

test("AF-10: works on arrow functions with block body", async () => {
  const cwd = await tmp("af10-arrow");
  const file = "src/util.ts";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `\
export const scale = (value) => {
  return value * 2;
};
`);
  const git = makeGit();
  const r = await tryNumericValidatorFix(
    "claude",
    {
      severity: "major",
      category: "correctness",
      message: "scale doesn't validate `value` is finite — NaN propagates.",
      file,
      line: 1,
    },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r.claimed, true);
  const after = await fs.readFile(abs, "utf8");
  assert.match(after, /if \(!Number\.isFinite\(value\)\) value = 0;/);
});

// ---- AF-11 hover restore ---------------------------------------------

test("AF-11: replaces hover:opacity-N with hover:bg-COLOR-darker on bg-blue-600", async () => {
  const cwd = await tmp("af11-blue");
  const file = "src/Btn.jsx";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `\
export function Btn() {
  return (
    <button className="px-3 py-2 bg-blue-600 text-white hover:opacity-80 rounded-lg">
      Click
    </button>
  );
}
`);
  const git = makeGit();
  const r = await tryHoverRestoreFix(
    "design",
    {
      severity: "major",
      category: "missing-state",
      message: "hover:opacity-80 has no perceivable effect on a primary button; restore hover:bg-blue-700.",
      file,
      line: 3,
    },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r.claimed, true);
  const after = await fs.readFile(abs, "utf8");
  assert.match(after, /hover:bg-blue-700/);
  assert.doesNotMatch(after, /hover:opacity-80/);
});

test("AF-11: clamps shade to 900 max (from 900 → 900, not 1000)", async () => {
  const cwd = await tmp("af11-cap");
  const file = "src/Btn.jsx";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `\
<button className="bg-red-900 hover:opacity-80">x</button>
`);
  const git = makeGit();
  const r = await tryHoverRestoreFix(
    "design",
    {
      severity: "major",
      category: "missing-state",
      message: "restore hover:bg-* convention",
      file,
      line: 1,
    },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r.claimed, true);
  const after = await fs.readFile(abs, "utf8");
  assert.match(after, /hover:bg-red-900/); // capped, not 1000
});

test("AF-11: declines when hover:bg-* already exists", async () => {
  const cwd = await tmp("af11-already");
  const file = "src/Btn.jsx";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `\
<button className="bg-blue-600 hover:bg-blue-700 hover:opacity-80">x</button>
`);
  const git = makeGit();
  const r = await tryHoverRestoreFix(
    "design",
    {
      severity: "major",
      category: "missing-state",
      message: "restore hover convention",
      file,
      line: 1,
    },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r.claimed, false);
});

test("AF-11: declines when no bg-COLOR class is present", async () => {
  const cwd = await tmp("af11-nobg");
  const file = "src/Btn.jsx";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `\
<button className="px-3 py-2 hover:opacity-80">x</button>
`);
  const git = makeGit();
  const r = await tryHoverRestoreFix(
    "design",
    {
      severity: "major",
      category: "missing-state",
      message: "restore hover convention",
      file,
      line: 1,
    },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r.claimed, false);
});

test("AF-11: idempotent — second run finds nothing", async () => {
  const cwd = await tmp("af11-idem");
  const file = "src/Btn.jsx";
  const abs = path.join(cwd, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `<button className="bg-blue-600 hover:opacity-80">x</button>\n`);
  const git = makeGit();
  const r1 = await tryHoverRestoreFix(
    "design",
    { severity: "major", category: "missing-state", message: "restore hover convention", file, line: 1 },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r1.claimed, true);
  const r2 = await tryHoverRestoreFix(
    "design",
    { severity: "major", category: "missing-state", message: "restore hover convention", file, line: 1 },
    { cwd, git: git.git, log: () => {} },
  );
  assert.equal(r2.claimed, false);
});
