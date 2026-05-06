/**
 * v0.16 (Problem 3) — `conclave login` command.
 *
 * Implements the client side of our Device Flow auth (RFC 8628 shape).
 * Flow:
 *   1. POST {endpoint}/auth/device → device_code, user_code, verification_uri
 *   2. Print user_code + URL; open the URL in the user's default browser.
 *   3. Poll POST {endpoint}/auth/token every `interval_sec` until:
 *        - 200 with { access_token } → save to ~/.conclave/auth.json + exit 0
 *        - 400 authorization_pending → wait + retry
 *        - 400 slow_down → wait longer + retry
 *        - 400 expired_token / access_denied → exit 1 with clear error
 *   4. Print the authenticated GH login + suggest `conclave whoami`.
 *
 * The CLI never sees the user's GitHub token; it only sees the
 * Conclave-issued bearer token. GitHub auth happens server-side.
 */
import { execFile } from "node:child_process";
import { saveAuthToken, defaultEndpoint } from "../lib/auth-token.js";
import { c, isInteractive, kv, nextAction, renderBanner, step } from "../lib/style.js";

const HELP = `conclave login — authenticate the CLI with the Conclave AI SaaS

Usage:
  conclave login [--endpoint <url>]

Options:
  --endpoint <url>   Override the SaaS endpoint (default: production Worker).
                     Useful for staging / self-hosted deployments.
                     Also reads CONCLAVE_SAAS_ENDPOINT env var.
  --no-open          Do not auto-open the verification URL in a browser
                     (just print it). Useful in headless environments.

After login the bearer token is stored at ~/.conclave/auth.json (or
%USERPROFILE%\\.conclave\\auth.json on Windows). Use \`conclave logout\` to
revoke + delete it. The token has no expiry; you can keep using the CLI
indefinitely until you explicitly log out.
`;

interface LoginArgs {
  endpoint: string;
  open: boolean;
  help: boolean;
}

function parseArgv(argv: string[]): LoginArgs {
  const out: LoginArgs = {
    endpoint: defaultEndpoint(),
    open: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--no-open") out.open = false;
    else if (a === "--endpoint" && argv[i + 1]) {
      out.endpoint = argv[i + 1]!.replace(/\/+$/, "");
      i += 1;
    }
  }
  return out;
}

export async function login(argv: string[]): Promise<void> {
  const args = parseArgv(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  const out = process.stdout;
  const err = process.stderr;

  if (isInteractive()) {
    out.write(renderBanner() + "\n\n");
  }

  out.write(step("pending", `Requesting device code from ${c.dim(args.endpoint)} …`) + "\n");

  let session: {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
  };
  try {
    const r = await fetch(`${args.endpoint}/auth/device`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!r.ok) {
      const tail = await r.text();
      err.write(`\n${step("err", `Server returned ${r.status} from /auth/device`)}\n`);
      err.write(`  ${c.dim(tail.slice(0, 200))}\n`);
      process.exit(1);
      return;
    }
    session = (await r.json()) as typeof session;
  } catch (e) {
    err.write(`\n${step("err", `Cannot reach ${args.endpoint}`)}\n`);
    err.write(`  ${c.dim((e as Error).message)}\n`);
    process.exit(1);
    return;
  }

  out.write("\n");
  out.write(`  ${c.bold("Open this URL in your browser:")}\n`);
  out.write(`  ${c.accent(session.verification_uri)}\n\n`);
  out.write(`  ${c.bold("Enter this code if asked:")}\n`);
  out.write(`  ${c.accent(session.user_code)}\n\n`);
  out.write(`  ${c.dim(`waiting for authorization (Ctrl-C to cancel) …`)}\n\n`);

  if (args.open) {
    openUrl(session.verification_uri);
  }

  // Poll /auth/token until approved / denied / expired.
  const start = Date.now();
  const expiresMs = (session.expires_in || 900) * 1000;
  let pollIntervalMs = Math.max(1000, session.interval * 1000);

  while (Date.now() - start < expiresMs) {
    await sleep(pollIntervalMs);
    let r: Response;
    try {
      r = await fetch(`${args.endpoint}/auth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_code: session.device_code }),
      });
    } catch (e) {
      // Transient — keep polling.
      err.write(`${c.dim(`(transient: ${(e as Error).message})`)}\n`);
      continue;
    }
    if (r.ok) {
      const j = (await r.json()) as { access_token: string };
      const me = await fetchMe(args.endpoint, j.access_token);
      saveAuthToken({
        token: j.access_token,
        endpoint: args.endpoint,
        ...(me?.github_login ? { githubLogin: me.github_login } : {}),
      });
      const who = me?.github_login ?? "(anonymous)";
      out.write(step("ok", `Logged in as ${c.bold(who)}`) + "\n");
      out.write(`  ${c.dim(`token saved to ~/.conclave/auth.json`)}\n`);
      out.write("\n");
      out.write(nextAction(`run ${c.code("conclave whoami")} to confirm`) + "\n");
      out.write(nextAction(`run ${c.code("conclave logout")} to revoke`) + "\n");
      return;
    }
    const body = (await r.json().catch(() => ({}))) as { error?: string; error_description?: string };
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      pollIntervalMs += 1000;
      continue;
    }
    err.write(`\n${step("err", body.error_description ?? body.error ?? "unknown error")}\n`);
    err.write(nextAction(`run ${c.code("conclave login")} to retry`) + "\n");
    process.exit(1);
    return;
  }
  err.write(`\n${step("err", `Device code expired after ${session.expires_in}s`)}\n`);
  err.write(nextAction(`run ${c.code("conclave login")} to start a new session`) + "\n");
  process.exit(1);
}

async function fetchMe(
  endpoint: string,
  token: string,
): Promise<{ github_login?: string; tier?: string } | null> {
  try {
    const r = await fetch(`${endpoint}/saas/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return (await r.json()) as { github_login?: string; tier?: string };
  } catch {
    return null;
  }
}

function openUrl(url: string): void {
  // Best-effort browser open; failure is non-fatal (user copies the URL).
  const platform = process.platform;
  let bin: string;
  let args: string[];
  if (platform === "win32") {
    bin = "cmd";
    args = ["/c", "start", "", url];
  } else if (platform === "darwin") {
    bin = "open";
    args = [url];
  } else {
    bin = "xdg-open";
    args = [url];
  }
  try {
    execFile(bin, args, () => undefined);
  } catch {
    /* ignore */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
