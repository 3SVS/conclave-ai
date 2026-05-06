/**
 * v0.16 (Problem 3) — `conclave logout`. Revokes the bearer token
 * server-side and removes ~/.conclave/auth.json. Idempotent: safe to
 * run when there's no stored token.
 */
import { clearAuthToken, loadAuthToken } from "../lib/auth-token.js";
import { c, nextAction, step } from "../lib/style.js";

export async function logout(_argv: string[]): Promise<void> {
  const out = process.stdout;
  const err = process.stderr;
  const stored = loadAuthToken();
  if (!stored) {
    out.write(step("ok", "Not logged in.") + "\n");
    out.write(`  ${c.dim("nothing to revoke")}\n`);
    return;
  }
  // Best-effort revoke server-side. If the network is down we still wipe
  // local — local wipe is the user's primary intent.
  try {
    const r = await fetch(`${stored.endpoint}/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${stored.token}` },
    });
    if (!r.ok && r.status !== 401) {
      err.write(step("warn", `Server returned ${r.status} (token wiped locally anyway)`) + "\n");
    }
  } catch (e) {
    err.write(step("warn", `Revoke call failed (${(e as Error).message})`) + "\n");
    err.write(`  ${c.dim("wiping local token only")}\n`);
  }
  clearAuthToken();
  const who = stored.githubLogin ? ` (was ${c.bold(stored.githubLogin)})` : "";
  out.write(step("ok", `Logged out${who}`) + "\n");
  out.write(nextAction(`run ${c.code("conclave login")} to sign back in`) + "\n");
}
