/**
 * v0.16 (Problem 3) — `conclave whoami`. Prints the currently
 * authenticated GitHub login + tier. Requires a token at
 * ~/.conclave/auth.json (run `conclave login` first).
 */
import { loadAuthToken } from "../lib/auth-token.js";
import { c, kv, nextAction, step } from "../lib/style.js";

export async function whoami(_argv: string[]): Promise<void> {
  const out = process.stdout;
  const err = process.stderr;
  const stored = loadAuthToken();
  if (!stored) {
    err.write(step("err", "Not logged in.") + "\n");
    err.write(nextAction(`run ${c.code("conclave login")}`) + "\n");
    process.exit(1);
    return;
  }
  try {
    const r = await fetch(`${stored.endpoint}/saas/me`, {
      headers: { authorization: `Bearer ${stored.token}` },
    });
    if (r.status === 401) {
      err.write(step("err", "Token rejected (revoked or expired).") + "\n");
      err.write(nextAction(`run ${c.code("conclave login")} to re-authenticate`) + "\n");
      process.exit(1);
      return;
    }
    if (!r.ok) {
      err.write(step("err", `Server returned ${r.status} from /saas/me`) + "\n");
      process.exit(1);
      return;
    }
    const me = (await r.json()) as {
      github_login?: string;
      tier?: string;
      byo_anthropic?: boolean;
      data_share_opt_in?: boolean;
    };
    out.write("\n");
    out.write(kv("logged in as", c.bold(me.github_login ?? "(unknown)")) + "\n");
    out.write(kv("tier", c.accent(me.tier ?? "free")) + "\n");
    out.write(kv("BYO key", me.byo_anthropic ? "yes" : "no") + "\n");
    out.write(kv("data-share", me.data_share_opt_in ? c.ok("yes") : c.warn("no (opt-out)")) + "\n");
    out.write(kv("endpoint", c.dim(stored.endpoint)) + "\n");
    out.write("\n");
  } catch (e) {
    err.write(step("err", `Cannot reach ${stored.endpoint}`) + "\n");
    err.write(`  ${c.dim((e as Error).message)}\n`);
    process.exit(1);
  }
}
