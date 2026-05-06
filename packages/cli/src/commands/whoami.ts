/**
 * v0.16 (Problem 3) — `conclave whoami`. Prints the currently
 * authenticated GitHub login + tier. Requires a token at
 * ~/.conclave/auth.json (run `conclave login` first).
 */
import { loadAuthToken } from "../lib/auth-token.js";

export async function whoami(_argv: string[]): Promise<void> {
  const out = process.stdout;
  const err = process.stderr;
  const stored = loadAuthToken();
  if (!stored) {
    err.write(`conclave whoami: not logged in. Run \`conclave login\` first.\n`);
    process.exit(1);
    return;
  }
  try {
    const r = await fetch(`${stored.endpoint}/saas/me`, {
      headers: { authorization: `Bearer ${stored.token}` },
    });
    if (r.status === 401) {
      err.write(`conclave whoami: token rejected by server (revoked or expired). Run \`conclave login\` again.\n`);
      process.exit(1);
      return;
    }
    if (!r.ok) {
      err.write(`conclave whoami: ${r.status} from ${stored.endpoint}/saas/me\n`);
      process.exit(1);
      return;
    }
    const me = (await r.json()) as {
      github_login?: string;
      tier?: string;
      byo_anthropic?: boolean;
      data_share_opt_in?: boolean;
    };
    out.write(`logged in as: ${me.github_login ?? "(unknown)"}\n`);
    out.write(`tier:         ${me.tier ?? "free"}\n`);
    out.write(`BYO key:      ${me.byo_anthropic ? "yes" : "no"}\n`);
    out.write(`data-share:   ${me.data_share_opt_in ? "yes" : "no (opt-out)"}\n`);
    out.write(`endpoint:     ${stored.endpoint}\n`);
  } catch (e) {
    err.write(`conclave whoami: cannot reach ${stored.endpoint} — ${(e as Error).message}\n`);
    process.exit(1);
  }
}
