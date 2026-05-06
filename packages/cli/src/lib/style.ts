/**
 * v0.16 (Problem 3) — CLI visual style tokens.
 *
 * Tone: Linear / Vercel no-bullshit. Direct words. No marketing fluff.
 * Use color sparingly — accent (one) + severity (four) + grayscale.
 * Emoji only in human-facing first-run / login confirmation paths;
 * machine-parseable output (--json, exit codes, stdin pipes) stays clean.
 *
 * The terminal capability check (`isColorTerminal`) respects:
 *   - NO_COLOR env var (https://no-color.org/)
 *   - non-TTY stdout (e.g. piped to `tee` or a log file)
 *   - TERM=dumb
 *
 * When color is off, every `c.X(s)` returns the bare string.
 */

const NO_COLOR =
  typeof process !== "undefined" &&
  ((process.env["NO_COLOR"] !== undefined && process.env["NO_COLOR"] !== "") ||
    process.env["TERM"] === "dumb");

function isColorTerminal(stream?: NodeJS.WriteStream): boolean {
  if (NO_COLOR) return false;
  const s = stream ?? process.stdout;
  return Boolean(s.isTTY);
}

const useColor = isColorTerminal();

function wrap(open: number, close: number): (s: string) => string {
  if (!useColor) return (s) => s;
  return (s) => `\x1b[${open}m${s}\x1b[${close}m`;
}

// 8 + 16-color basics, plus a few 256-color picks for the accent.
// Why 256-color: the deep-blue accent looks washed-out on plain ANSI 16.
// Falls back automatically on terminals that don't support 256 — they
// just render the closest 16-color match.
function wrap256(fg: number): (s: string) => string {
  if (!useColor) return (s) => s;
  return (s) => `\x1b[38;5;${fg}m${s}\x1b[39m`;
}

export const c = {
  // Severity palette — used in review/audit output. NOT decorative.
  blocker: wrap(31, 39), // red
  major: wrap(33, 39), // yellow
  minor: wrap(36, 39), // cyan
  nit: wrap(90, 39), // bright black
  // Status / outcome
  ok: wrap(32, 39), // green — login success, approve
  warn: wrap(33, 39), // yellow
  err: wrap(31, 39), // red
  // Accent (brand) — deep blue 256-color slot. Replace when Bae picks a brand color.
  accent: wrap256(33),
  // De-emphasis
  dim: wrap(2, 22),
  // Structural emphasis
  bold: wrap(1, 22),
  // Inline code
  code: wrap(36, 39),
};

/** ASCII wordmark for first-run / login banners. ~6 lines tall. */
export const BANNER = [
  "  ╭─────────────────────────────────────────────╮",
  "  │  ▐▌▗▖ ▗▖ ▐▌  ▟█▙ ▝█▘█▌▟█▙ ▗▖▟▙ █                │",
  "  │   conclave-ai  ·  multi-agent code review  │",
  "  ╰─────────────────────────────────────────────╯",
];

/** Render the banner with accent color. Returns the full string. */
export function renderBanner(): string {
  return BANNER.map((line) => c.accent(line)).join("\n");
}

/**
 * Format a step indicator line:
 *   →  Loading PRD …
 *   ✓  Loaded PRD (412 chars)
 *   ✗  PRD missing
 *
 * Use for multi-line interactive flows (login, review startup, etc.).
 */
export function step(state: "pending" | "ok" | "err" | "warn", msg: string): string {
  const glyphs = { pending: "→", ok: "✓", err: "✗", warn: "!" };
  const colors = {
    pending: c.dim,
    ok: c.ok,
    err: c.err,
    warn: c.warn,
  };
  return `${colors[state](glyphs[state])} ${msg}`;
}

/**
 * Format a "next action" arrow pointer for error messages:
 *   error: token rejected by server (revoked or expired).
 *   → run `conclave login`
 */
export function nextAction(action: string): string {
  return `${c.dim("→")} ${action}`;
}

/**
 * Render a key/value pair right-aligned in a fixed column for the
 * `whoami` / `status` style output:
 *   logged in as:   seunghunbae-3svs
 *   tier:           free
 *   endpoint:       https://...
 */
export function kv(label: string, value: string, labelWidth: number = 14): string {
  return `${c.dim(label.padEnd(labelWidth))} ${value}`;
}

/** True when stdout is a TTY and color is enabled. CLI commands check this
 * to decide whether to print banners (skip on pipe-to-jq runs). */
export function isInteractive(): boolean {
  return useColor;
}
