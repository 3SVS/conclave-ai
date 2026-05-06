/**
 * v0.16 (Problem 3) — SaaS auth-token storage.
 *
 * Stored at `~/.conclave/auth.json` (or `%USERPROFILE%\.conclave\auth.json`
 * on Windows). One file per machine; if the user logs in across multiple
 * devices, each gets its own token row in saas_tokens (server-side).
 *
 * Schema:
 *   {
 *     "version": 1,
 *     "token": "<opaque base64 string>",
 *     "endpoint": "https://conclave-ai.seunghunbae.workers.dev",
 *     "issuedAt": "2026-05-06T12:00:00Z",
 *     "githubLogin": "seunghunbae-3svs"
 *   }
 *
 * The file is written 0600 on Unix and locked-down via icacls on Windows
 * (same approach as ../credentials.ts).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AuthTokenFile {
  version: 1;
  token: string;
  endpoint: string;
  issuedAt: string;
  githubLogin?: string;
}

const DEFAULT_ENDPOINT = "https://conclave-ai.seunghunbae.workers.dev";

export function authDir(): string {
  if (process.platform === "win32") {
    const home = process.env["USERPROFILE"] ?? os.homedir();
    return path.join(home, ".conclave");
  }
  const xdg = process.env["XDG_CONFIG_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".config");
  return path.join(base, "conclave");
}

export function authPath(): string {
  return path.join(authDir(), "auth.json");
}

export function loadAuthToken(): AuthTokenFile | null {
  const p = authPath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<AuthTokenFile>;
    if (parsed?.version !== 1 || typeof parsed.token !== "string" || typeof parsed.endpoint !== "string") {
      return null;
    }
    return {
      version: 1,
      token: parsed.token,
      endpoint: parsed.endpoint,
      issuedAt: typeof parsed.issuedAt === "string" ? parsed.issuedAt : new Date().toISOString(),
      ...(typeof parsed.githubLogin === "string" ? { githubLogin: parsed.githubLogin } : {}),
    };
  } catch {
    return null;
  }
}

export function saveAuthToken(input: {
  token: string;
  endpoint?: string;
  githubLogin?: string;
}): void {
  const dir = authDir();
  fs.mkdirSync(dir, { recursive: true });
  const p = authPath();
  const file: AuthTokenFile = {
    version: 1,
    token: input.token,
    endpoint: input.endpoint ?? DEFAULT_ENDPOINT,
    issuedAt: new Date().toISOString(),
    ...(input.githubLogin ? { githubLogin: input.githubLogin } : {}),
  };
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n", "utf8");
  try {
    if (process.platform !== "win32") {
      fs.chmodSync(tmp, 0o600);
    }
    fs.renameSync(tmp, p);
    if (process.platform === "win32") {
      restrictWindowsAcl(p);
    }
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function clearAuthToken(): void {
  const p = authPath();
  if (fs.existsSync(p)) fs.rmSync(p, { force: true });
}

function restrictWindowsAcl(filePath: string): void {
  const user = process.env["USERNAME"] ?? process.env["USER"];
  if (!user) return;
  try {
    execFileSync("icacls", [filePath, "/inheritance:r"], { stdio: "ignore" });
    execFileSync("icacls", [filePath, "/grant:r", `${user}:F`], { stdio: "ignore" });
  } catch {
    process.stderr.write(
      `conclave login: icacls restriction failed (file is still in your user profile, but verify ACLs manually)\n`,
    );
  }
}

export function defaultEndpoint(): string {
  return process.env["CONCLAVE_SAAS_ENDPOINT"] ?? DEFAULT_ENDPOINT;
}
