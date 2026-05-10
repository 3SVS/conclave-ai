import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  buildPnpmPublishArgs,
  listPackageDirs,
  planPublish,
  publishablePackages,
  readPackageMeta,
} from "./publish-unpublished.mjs";

/**
 * v0.14.3 — release-script unit tests. Hermetic — all network/pnpm
 * effects are stubbed via the planner's `isPublished` injection and
 * a temp-dir scratch fixture for filesystem reads.
 */

// ---- planPublish -------------------------------------------------------

test("planPublish: splits by isPublished predicate", () => {
  const metas = [
    { name: "@scope/a", version: "1.0.0", isPrivate: false },
    { name: "@scope/b", version: "1.0.0", isPrivate: false },
    { name: "@scope/c", version: "2.0.0", isPrivate: false },
  ];
  const published = new Set(["@scope/a@1.0.0", "@scope/c@2.0.0"]);
  const { toPublish, alreadyPublished } = planPublish(metas, (n, v) =>
    published.has(`${n}@${v}`),
  );
  assert.deepEqual(toPublish.map((m) => m.name), ["@scope/b"]);
  assert.deepEqual(alreadyPublished.map((m) => m.name), ["@scope/a", "@scope/c"]);
});

test("planPublish: all already published → toPublish empty", () => {
  const metas = [
    { name: "@scope/a", version: "1.0.0", isPrivate: false },
    { name: "@scope/b", version: "1.0.0", isPrivate: false },
  ];
  const { toPublish, alreadyPublished } = planPublish(metas, () => true);
  assert.equal(toPublish.length, 0);
  assert.equal(alreadyPublished.length, 2);
});

test("planPublish: nothing published yet → all in toPublish", () => {
  const metas = [
    { name: "@scope/a", version: "1.0.0", isPrivate: false },
    { name: "@scope/b", version: "1.0.0", isPrivate: false },
  ];
  const { toPublish, alreadyPublished } = planPublish(metas, () => false);
  assert.equal(toPublish.length, 2);
  assert.equal(alreadyPublished.length, 0);
});

// ---- publishablePackages -----------------------------------------------

test("publishablePackages: filters out private packages", () => {
  const metas = [
    { name: "@scope/a", version: "1.0.0", isPrivate: false },
    { name: "@scope/b", version: "1.0.0", isPrivate: true },
    { name: "@scope/c", version: "1.0.0", isPrivate: false },
  ];
  const result = publishablePackages(metas);
  assert.deepEqual(result.map((m) => m.name), ["@scope/a", "@scope/c"]);
});

test("publishablePackages: filters out missing name or version", () => {
  const metas = [
    { name: "@scope/a", version: "1.0.0", isPrivate: false },
    { name: undefined, version: "1.0.0", isPrivate: false },
    { name: "@scope/c", version: undefined, isPrivate: false },
    { name: "", version: "1.0.0", isPrivate: false },
  ];
  const result = publishablePackages(metas);
  assert.deepEqual(result.map((m) => m.name), ["@scope/a"]);
});

// ---- buildPnpmPublishArgs ----------------------------------------------

test("buildPnpmPublishArgs: emits -r --filter ... publish args", () => {
  const pkgs = [
    { name: "@scope/a", version: "1.0.0", isPrivate: false },
    { name: "@scope/b", version: "1.0.0", isPrivate: false },
  ];
  const args = buildPnpmPublishArgs(pkgs);
  assert.deepEqual(args, [
    "-r",
    "--filter", "@scope/a",
    "--filter", "@scope/b",
    "publish",
    "--access", "public",
    "--no-git-checks",
  ]);
});

test("buildPnpmPublishArgs: single package still uses -r + filter for workspace dep replacement", () => {
  // -r matters even for one package: pnpm needs the workspace context
  // to rewrite `workspace:*` references at publish time. Without -r,
  // a standalone `pnpm publish` still works for the ONE package, but
  // we want consistency + fail-loud if monorepo state is wrong.
  const pkgs = [{ name: "@scope/only", version: "1.0.0", isPrivate: false }];
  const args = buildPnpmPublishArgs(pkgs);
  assert.deepEqual(args, [
    "-r",
    "--filter", "@scope/only",
    "publish",
    "--access", "public",
    "--no-git-checks",
  ]);
});

// ---- listPackageDirs / readPackageMeta (filesystem fixtures) -----------

function withTempPackagesDir(setup) {
  const root = path.join(os.tmpdir(), `publish-unpub-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const packagesDir = path.join(root, "packages");
  mkdirSync(packagesDir, { recursive: true });
  try {
    return setup(packagesDir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("listPackageDirs: returns subdirs that contain package.json", () => {
  withTempPackagesDir((pd) => {
    mkdirSync(path.join(pd, "with-json"));
    writeFileSync(
      path.join(pd, "with-json", "package.json"),
      JSON.stringify({ name: "x", version: "0.0.1" }),
    );
    mkdirSync(path.join(pd, "without-json"));
    mkdirSync(path.join(pd, "deep", "nested"), { recursive: true });

    const dirs = listPackageDirs(pd);
    assert.deepEqual(dirs.sort(), ["with-json"]);
  });
});

test("readPackageMeta: reads name + version + private flag", () => {
  withTempPackagesDir((pd) => {
    const dir = path.join(pd, "pkg");
    mkdirSync(dir);
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "@scope/pkg", version: "1.2.3" }),
    );
    const meta = readPackageMeta(dir);
    assert.deepEqual(meta, { name: "@scope/pkg", version: "1.2.3", isPrivate: false });
  });
});

test("readPackageMeta: detects private:true", () => {
  withTempPackagesDir((pd) => {
    const dir = path.join(pd, "internal");
    mkdirSync(dir);
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "@scope/internal", version: "0.1.0", private: true }),
    );
    const meta = readPackageMeta(dir);
    assert.equal(meta.isPrivate, true);
  });
});
