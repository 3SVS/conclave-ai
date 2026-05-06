/**
 * v0.16 (Problem 3) — `conclave logout`. Revokes the bearer token
 * server-side and removes ~/.conclave/auth.json. Idempotent: safe to
 * run when there's no stored token.
 */
import { clearAuthToken, loadAuthToken } from "../lib/auth-token.js";

export async function logout(_argv: string[]): Promise<void> {
  const out = process.stdout;
  const err = process.stderr;
  const stored = loadAuthToken();
  if (!stored) {
    out.write(`conclave logout: not logged in (no token at ~/.conclave/auth.json)\n`);
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
      err.write(`conclave logout: server returned ${r.status} (token wiped locally anyway)\n`);
    }
  } catch (e) {
    err.write(`conclave logout: revoke call failed (${(e as Error).message}); wiping local token only\n`);
  }
  clearAuthToken();
  out.write(`✓ Logged out${stored.githubLogin ? ` (was ${stored.githubLogin})` : ""}. Token removed.\n`);
}
