/**
 * v0.16.10 — Sprint B: `conclave feedback` subcommand.
 *
 * Wraps POST /feedback (Sprint A) so users can submit feedback on a
 * conclave run without crafting curl by hand. Three modes:
 *
 *   1. Interactive (no flags) — prompts for each field. Best for
 *      first-time / occasional use. Uses node:readline.
 *
 *   2. Flag-based (`--domain X --severity Y --wanted "..." --produced "..."`)
 *      — scriptable. Skips prompts when all required flags are present;
 *      prompts only for missing ones.
 *
 *   3. List (`--list`) — prints user's last 50 feedback entries from
 *      GET /me/feedback so users can audit what they've submitted +
 *      check classification status.
 *
 * Output:
 *   - default: pretty-printed status + category + reasoning
 *   - `--json`: raw API response (for scripting)
 *
 * Auth: reads ~/.conclave/auth.json. If missing, prompts to run
 * `conclave login` and exits 1.
 */
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { loadAuthToken } from "../lib/auth-token.js";
import { c, kv, nextAction, step } from "../lib/style.js";

const VALID_DOMAINS = ["code", "design"] as const;
const VALID_SEVERITIES = ["blocker", "major", "minor", "nit"] as const;
type Domain = (typeof VALID_DOMAINS)[number];
type Severity = (typeof VALID_SEVERITIES)[number];

const HELP = `conclave feedback — submit feedback on a prior conclave review

Usage:
  conclave feedback [options]
  conclave feedback --list

Options (intake mode):
  --domain <code|design>          PR domain (required)
  --severity <blocker|major|minor|nit>   How bad was it (required)
  --wanted <text>                 What you expected conclave to catch / produce
  --produced <text>               What conclave actually produced
  --run-id <id>                   Optional correlation id (free-form)
  --job-id <id>                   Optional FK to jobs.id

Other:
  --list                          Show your last 50 feedback entries
  --json                          Machine-readable output (intake or list)
  --help, -h                      Show this

Modes:
  no flags          → interactive (prompts for each required field)
  partial flags     → prompts only for missing required fields
  all flags + values → fully non-interactive (good for scripts / CI)

Auth: requires \`~/.conclave/auth.json\`. Run \`conclave login\` if absent.

Examples:
  conclave feedback                                                    # interactive
  conclave feedback --domain design --severity major \\
    --wanted "buttons use design-system token" \\
    --produced "hardcoded #3B82F6"
  conclave feedback --list
  conclave feedback --list --json | jq '.feedback[] | .category'
`;

interface FeedbackArgs {
  domain?: Domain;
  severity?: Severity;
  wanted?: string;
  produced?: string;
  runId?: string;
  jobId?: string;
  list: boolean;
  json: boolean;
  help: boolean;
}

function parseArgv(argv: string[]): FeedbackArgs {
  const out: FeedbackArgs = { list: false, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--list") out.list = true;
    else if (a === "--json") out.json = true;
    else if (a === "--domain" && argv[i + 1]) {
      const v = argv[++i]!;
      if ((VALID_DOMAINS as readonly string[]).includes(v)) out.domain = v as Domain;
      else throw new Error(`--domain must be one of: ${VALID_DOMAINS.join(", ")}`);
    } else if (a === "--severity" && argv[i + 1]) {
      const v = argv[++i]!;
      if ((VALID_SEVERITIES as readonly string[]).includes(v)) out.severity = v as Severity;
      else throw new Error(`--severity must be one of: ${VALID_SEVERITIES.join(", ")}`);
    } else if (a === "--wanted" && argv[i + 1]) out.wanted = argv[++i];
    else if (a === "--produced" && argv[i + 1]) out.produced = argv[++i];
    else if (a === "--run-id" && argv[i + 1]) out.runId = argv[++i];
    else if (a === "--job-id" && argv[i + 1]) out.jobId = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

async function prompt(rl: ReadlineInterface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));
}

async function promptDomain(rl: ReadlineInterface): Promise<Domain> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ans = (await prompt(rl, `${c.bold("domain")} ${c.dim("(code|design)")}: `)).toLowerCase();
    if ((VALID_DOMAINS as readonly string[]).includes(ans)) return ans as Domain;
    process.stdout.write(c.warn(`  not valid; pick one of: ${VALID_DOMAINS.join(", ")}\n`));
  }
  throw new Error("domain required");
}

async function promptSeverity(rl: ReadlineInterface): Promise<Severity> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ans = (
      await prompt(rl, `${c.bold("severity")} ${c.dim("(blocker|major|minor|nit)")}: `)
    ).toLowerCase();
    if ((VALID_SEVERITIES as readonly string[]).includes(ans)) return ans as Severity;
    process.stdout.write(c.warn(`  not valid; pick one of: ${VALID_SEVERITIES.join(", ")}\n`));
  }
  throw new Error("severity required");
}

async function promptText(rl: ReadlineInterface, label: string, hint: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ans = await prompt(rl, `${c.bold(label)} ${c.dim(`(${hint})`)}:\n  `);
    if (ans.length > 0) return ans;
    process.stdout.write(c.warn("  cannot be empty\n"));
  }
  throw new Error(`${label} required`);
}

interface IntakeResponse {
  id: string;
  status: "classified" | "pending";
  category: string | null;
  confidence: number | null;
  reasoning: string | null;
}

interface ListResponse {
  feedback: Array<{
    id: string;
    domain: string;
    severity: string;
    category: string | null;
    confidence: number | null;
    reasoning: string | null;
    status: string;
    created_at: string;
    classified_at: string | null;
  }>;
}

export async function feedback(argv: string[]): Promise<void> {
  const out = process.stdout;
  const err = process.stderr;

  let args: FeedbackArgs;
  try {
    args = parseArgv(argv);
  } catch (e) {
    err.write(step("err", (e as Error).message) + "\n\n");
    err.write(HELP);
    process.exit(2);
    return;
  }

  if (args.help) {
    out.write(HELP);
    return;
  }

  const stored = loadAuthToken();
  if (!stored) {
    err.write(step("err", "Not logged in.") + "\n");
    err.write(nextAction(`run ${c.code("conclave login")}`) + "\n");
    process.exit(1);
    return;
  }

  if (args.list) {
    return doList(stored.endpoint, stored.token, args.json);
  }

  return doIntake(stored.endpoint, stored.token, args);
}

async function doList(endpoint: string, token: string, asJson: boolean): Promise<void> {
  const out = process.stdout;
  const err = process.stderr;
  let r: Response;
  try {
    r = await fetch(`${endpoint}/me/feedback`, {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (e) {
    err.write(step("err", `Cannot reach ${endpoint}`) + "\n");
    err.write(`  ${c.dim((e as Error).message)}\n`);
    process.exit(1);
    return;
  }
  if (r.status === 401) {
    err.write(step("err", "Token rejected (revoked or expired).") + "\n");
    err.write(nextAction(`run ${c.code("conclave login")} to re-authenticate`) + "\n");
    process.exit(1);
    return;
  }
  if (!r.ok) {
    err.write(step("err", `Server returned ${r.status}`) + "\n");
    process.exit(1);
    return;
  }
  const body = (await r.json()) as ListResponse;
  if (asJson) {
    out.write(JSON.stringify(body, null, 2) + "\n");
    return;
  }
  if (body.feedback.length === 0) {
    out.write(step("ok", "No feedback submitted yet.") + "\n");
    out.write(nextAction(`run ${c.code("conclave feedback")} to submit your first one`) + "\n");
    return;
  }
  out.write("\n");
  out.write(`  ${c.bold(`${body.feedback.length} feedback entries`)} ${c.dim("(newest first)")}\n\n`);
  for (const f of body.feedback) {
    const when = new Date(f.created_at).toISOString().slice(0, 16).replace("T", " ");
    const sev = renderSeverity(f.severity);
    const status = renderStatus(f.status);
    const cat = f.category ? c.accent(f.category) : c.dim("(awaiting classify)");
    const conf = f.confidence !== null ? c.dim(` ${(f.confidence * 100).toFixed(0)}%`) : "";
    out.write(`  ${c.dim(when)}  ${sev}  ${c.dim(f.domain.padEnd(6))}  ${cat}${conf}  ${status}\n`);
    out.write(`    ${c.dim(f.id)}\n`);
  }
  out.write("\n");
}

async function doIntake(endpoint: string, token: string, args: FeedbackArgs): Promise<void> {
  const out = process.stdout;
  const err = process.stderr;

  // Fill in missing required fields via interactive prompts.
  const missing = !args.domain || !args.severity || !args.wanted || !args.produced;
  let rl: ReadlineInterface | null = null;
  if (missing) {
    if (!process.stdin.isTTY) {
      err.write(step("err", "Missing required fields and stdin is not a TTY.") + "\n");
      err.write(`  ${c.dim("provide --domain, --severity, --wanted, --produced when scripting")}\n`);
      process.exit(2);
      return;
    }
    rl = createInterface({ input: process.stdin, output: process.stdout });
    out.write("\n");
    out.write(`  ${c.bold("Submit feedback on a conclave review")}\n`);
    out.write(`  ${c.dim("Tells the council what to learn from. Press Ctrl+C to cancel.")}\n\n`);
  }

  try {
    if (!args.domain) args.domain = await promptDomain(rl!);
    if (!args.severity) args.severity = await promptSeverity(rl!);
    if (!args.wanted) {
      args.wanted = await promptText(rl!, "What you wanted", "what conclave should have caught/produced");
    }
    if (!args.produced) {
      args.produced = await promptText(rl!, "What was produced", "what conclave actually produced");
    }
  } finally {
    rl?.close();
  }

  const body: Record<string, unknown> = {
    domain: args.domain,
    severity: args.severity,
    what_user_wanted: args.wanted,
    what_we_produced: args.produced,
  };
  if (args.runId) body.run_id = args.runId;
  if (args.jobId) body.job_id = args.jobId;

  let r: Response;
  try {
    r = await fetch(`${endpoint}/feedback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    err.write("\n" + step("err", `Cannot reach ${endpoint}`) + "\n");
    err.write(`  ${c.dim((e as Error).message)}\n`);
    process.exit(1);
    return;
  }

  if (r.status === 401) {
    err.write("\n" + step("err", "Token rejected (revoked or expired).") + "\n");
    err.write(nextAction(`run ${c.code("conclave login")} to re-authenticate`) + "\n");
    process.exit(1);
    return;
  }
  if (r.status === 400) {
    const j = (await r.json().catch(() => ({}))) as { error?: string; error_description?: string };
    err.write("\n" + step("err", j.error_description ?? j.error ?? "invalid request") + "\n");
    process.exit(2);
    return;
  }
  if (!r.ok) {
    err.write("\n" + step("err", `Server returned ${r.status}`) + "\n");
    process.exit(1);
    return;
  }

  const result = (await r.json()) as IntakeResponse;
  if (args.json) {
    out.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  out.write("\n");
  if (result.status === "classified") {
    out.write(step("ok", `Feedback recorded — ${c.accent(result.category ?? "?")}`) + "\n");
    out.write(kv("id", c.dim(result.id)) + "\n");
    if (result.confidence !== null) {
      out.write(kv("confidence", `${(result.confidence * 100).toFixed(0)}%`) + "\n");
    }
    if (result.reasoning) out.write(kv("reasoning", c.dim(result.reasoning)) + "\n");
  } else {
    out.write(step("warn", "Feedback queued for classification (Haiku temporarily unavailable)") + "\n");
    out.write(kv("id", c.dim(result.id)) + "\n");
    out.write(`  ${c.dim("retry happens within 6h via cron — check `conclave feedback --list` later")}\n`);
  }
  out.write("\n");
}

function renderSeverity(s: string): string {
  switch (s) {
    case "blocker":
      return c.warn("[blocker]");
    case "major":
      return c.warn("[major]  ");
    case "minor":
      return c.dim("[minor]  ");
    case "nit":
      return c.dim("[nit]    ");
    default:
      return c.dim(`[${s}]`.padEnd(10));
  }
}

function renderStatus(s: string): string {
  switch (s) {
    case "classified":
      return c.ok("✓");
    case "pending":
      return c.dim("…");
    case "failed":
      return c.warn("!");
    default:
      return c.dim(s);
  }
}
