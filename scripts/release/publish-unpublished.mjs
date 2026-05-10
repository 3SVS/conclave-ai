#!/usr/bin/env node
/**
 * v0.14.3 — publish only packages whose current version is NOT yet on
 * the npm registry. Replaces the bare `pnpm publish -r` step in
 * release.yml.
 *
 * Why: release.yml fires on BOTH `workflow_dispatch` (the operator
 * "Run workflow" button) AND on `push: tags: ["v*"]`. The dispatch
 * path bumps versions, commits, tags `v$CORE_VERSION`, publishes to
 * npm, then force-moves the floating tag (e.g. v0.4) onto HEAD. Both
 * tag pushes re-fire the workflow. Those re-fires hit the same
 * already-published versions and `pnpm publish -r` exits non-zero on
 * the first 403 ("cannot publish over previously published"), turning
 * every successful release into "1 success + 2 false-failure" runs in
 * the Actions UI.
 *
 * Behavior:
 *   - Lists every package under packages/* whose package.json is NOT
 *     marked `"private": true`.
 *   - For each, queries `npm view <name>@<version> version`. If the
 *     registry already serves that version, the package is filtered
 *     out of the publish call.
 *   - If at least one package needs publishing, invokes
 *     `pnpm -r <filters> publish --access public --no-git-checks`
 *     with the surviving filters.
 *   - If everything is already on the registry, exits 0 with a clear
 *     log line — making the tag-push trigger idempotent.
 *
 * Exit codes:
 *   0   either nothing to do, or pnpm publish succeeded
 *   1   pnpm publish failed for at least one truly-new version
 *   2   misuse (no packages dir, npm/pnpm not on PATH, etc.)
 */

import { execSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** List every directory under `packagesDir` that has a package.json. */
export function listPackageDirs(packagesDir) {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => {
      try {
        return statSync(path.join(packagesDir, name, "package.json")).isFile();
      } catch {
        return false;
      }
    });
}

/** Read { name, version, isPrivate } from a package.json. */
export function readPackageMeta(pkgDir) {
  const json = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  return {
    name: json.name,
    version: json.version,
    isPrivate: Boolean(json.private),
  };
}

/**
 * Filter the input package list down to "publishable" ones — has a
 * scoped name + version + is not private. Anything missing those
 * fields is silently skipped (matches `pnpm publish -r` behavior).
 */
export function publishablePackages(pkgMetas) {
  return pkgMetas.filter(
    (m) => m.name && m.version && !m.isPrivate,
  );
}

/**
 * Pure planner. Splits packages into "needs publish" vs "already on
 * registry" using a caller-provided `isPublished(name, version)`
 * predicate. Lets tests drive the decision without touching the
 * network.
 */
export function planPublish(pkgMetas, isPublished) {
  const toPublish = [];
  const alreadyPublished = [];
  for (const m of pkgMetas) {
    if (isPublished(m.name, m.version)) {
      alreadyPublished.push(m);
    } else {
      toPublish.push(m);
    }
  }
  return { toPublish, alreadyPublished };
}

/**
 * Build the pnpm publish argv from a list of package metas. Returns
 * the args array to spawn (without the leading "pnpm" binary).
 *
 * Uses repeated --filter so pnpm restricts -r to exactly the packages
 * we need. `--no-git-checks` matches the existing release.yml
 * invocation. `--access public` is idempotent for already-public
 * scoped packages but harmless to repeat.
 */
export function buildPnpmPublishArgs(pkgsToPublish) {
  const args = ["-r"];
  for (const m of pkgsToPublish) {
    args.push("--filter", m.name);
  }
  args.push("publish", "--access", "public", "--no-git-checks");
  return args;
}

// ---- side effects -------------------------------------------------------

/**
 * Returns true iff `npm view <name>@<version> version` prints exactly
 * the requested version string. Anything else (404, network error,
 * stale-cache mismatch) returns false → fall through to publish.
 */
export function isPublishedNpmView(name, version) {
  try {
    const out = execSync(
      `npm view ${name}@${version} version`,
      { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 30_000 },
    ).trim();
    return out === version;
  } catch {
    return false;
  }
}

function logSummary({ toPublish, alreadyPublished }) {
  for (const m of alreadyPublished) {
    process.stdout.write(`already-published  ${m.name}@${m.version}\n`);
  }
  for (const m of toPublish) {
    process.stdout.write(`will-publish       ${m.name}@${m.version}\n`);
  }
  process.stdout.write(
    `\nsummary: ${toPublish.length} to publish, ${alreadyPublished.length} already on registry\n`,
  );
}

// ---- main --------------------------------------------------------------

async function main() {
  const repoRoot = process.cwd();
  const packagesDir = path.join(repoRoot, "packages");

  let dirs;
  try {
    dirs = listPackageDirs(packagesDir);
  } catch (err) {
    process.stderr.write(
      `Cannot read packages dir at ${packagesDir}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }
  if (dirs.length === 0) {
    process.stderr.write("No packages found under packages/\n");
    process.exit(2);
  }

  const metas = publishablePackages(
    dirs.map((d) => readPackageMeta(path.join(packagesDir, d))),
  );
  const plan = planPublish(metas, isPublishedNpmView);
  logSummary(plan);

  if (plan.toPublish.length === 0) {
    process.stdout.write(
      "All package versions already on registry — skipping publish (likely a tag-push re-trigger).\n",
    );
    process.exit(0);
  }

  const args = buildPnpmPublishArgs(plan.toPublish);
  process.stdout.write(`\n+ pnpm ${args.join(" ")}\n`);
  const r = spawnSync("pnpm", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.error) {
    process.stderr.write(
      `Failed to spawn pnpm: ${r.error.message}\n`,
    );
    process.exit(2);
  }
  process.exit(r.status ?? 1);
}

const invokedDirectly = (() => {
  try {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(
      `publish-unpublished failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(2);
  });
}
