/**
 * WorkspaceClient — thin, audited HTTP wrapper around the Conclave central-plane
 * workspace API. Every method is userKey-scoped. The GitHub access token lives only
 * inside central-plane (encrypted) and is NEVER requested or returned here.
 */

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type AuditEntry = {
  ts: string;
  tool: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  error?: string;
};

export type AuditSink = (entry: AuditEntry) => void;

/** Default audit sink: one JSON line per call on stderr (stdout is the MCP channel). */
export function stderrAudit(entry: AuditEntry): void {
  try {
    process.stderr.write(`${JSON.stringify({ audit: "conclave-mcp", ...entry })}\n`);
  } catch {
    /* ignore */
  }
}

export type WorkspaceClientOptions = {
  baseUrl: string;
  userKey: string;
  fetchImpl?: FetchLike;
  audit?: AuditSink;
  userAgent?: string;
  timeoutMs?: number;
};

export type ApiResult<T = Record<string, unknown>> = { ok: boolean } & T & {
  error?: string;
  status?: number;
};

export class WorkspaceClient {
  private readonly baseUrl: string;
  private readonly userKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly audit: AuditSink;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(opts: WorkspaceClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.userKey = opts.userKey;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.audit = opts.audit ?? stderrAudit;
    this.userAgent = opts.userAgent ?? "conclave-mcp-workspace";
    this.timeoutMs = opts.timeoutMs ?? 45000;
  }

  /** Core request. userKey is injected here (query for GET, body for write) so it is
   *  never a tool argument an agent can spoof. Audited; never logs the key or bodies. */
  private async request(
    tool: string,
    method: "GET" | "POST",
    path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: Record<string, unknown>; idempotencyKey?: string } = {},
  ): Promise<ApiResult> {
    const query = new URLSearchParams();
    if (method === "GET") query.set("userKey", this.userKey);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) query.set(k, String(v));
    }
    const qs = query.toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;

    const headers: Record<string, string> = { "User-Agent": this.userAgent };
    let body: string | undefined;
    if (method === "POST") {
      headers["content-type"] = "application/json";
      if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
      body = JSON.stringify({ userKey: this.userKey, ...(opts.body ?? {}) });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let status = 0;
    try {
      const resp = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
      status = resp.status;
      const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
      const result: ApiResult = { ok: resp.ok && (data.ok !== false), status, ...data };
      this.audit({ ts: nowIso(), tool, method, path, status, ok: result.ok, error: result.ok ? undefined : String(data.error ?? "") });
      return result;
    } catch (err) {
      this.audit({ ts: nowIso(), tool, method, path, status, ok: false, error: (err as Error).message });
      return { ok: false, error: `request_failed: ${(err as Error).message}`, status };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Tools ───────────────────────────────────────────────────────────────────

  listProjects(): Promise<ApiResult> {
    return this.request("list_projects", "GET", "/workspace/projects");
  }

  /** Ownership-checked: only returns the project if it belongs to this userKey. */
  async getProject(projectId: string): Promise<ApiResult> {
    const r = await this.request("get_project", "GET", `/workspace/projects/${enc(projectId)}`);
    if (r.ok) {
      const project = (r as { project?: { userKey?: string } }).project;
      if (project && project.userKey && project.userKey !== this.userKey) {
        this.audit({ ts: nowIso(), tool: "get_project", method: "GET", path: `/workspace/projects/${projectId}`, status: 403, ok: false, error: "forbidden" });
        return { ok: false, error: "forbidden", status: 403 };
      }
    }
    return r;
  }

  listPullRequests(projectId: string): Promise<ApiResult> {
    return this.request("list_pull_requests", "GET", `/workspace/projects/${enc(projectId)}/github/pulls`);
  }

  runPrReview(
    projectId: string,
    prNumber: number,
    body: { selectedItemIds?: string[]; items?: unknown[]; productSpec?: unknown; idempotencyKey?: string; rerunOfReviewRunId?: string },
  ): Promise<ApiResult> {
    const { idempotencyKey, ...rest } = body;
    return this.request("run_pr_review", "POST", `/workspace/projects/${enc(projectId)}/github/pulls/${prNumber}/review`, {
      body: rest,
      idempotencyKey,
    });
  }

  getReviewHistory(projectId: string, prNumber?: number): Promise<ApiResult> {
    if (prNumber !== undefined) {
      return this.request("get_review_history", "GET", `/workspace/projects/${enc(projectId)}/github/pulls/${prNumber}/review/history`);
    }
    return this.request("get_review_history", "GET", `/workspace/projects/${enc(projectId)}/github/review-history`);
  }

  getReviewRun(projectId: string, runId: string): Promise<ApiResult> {
    return this.request("get_review_run", "GET", `/workspace/projects/${enc(projectId)}/github/review/runs/${enc(runId)}`);
  }

  createFixInstructions(
    projectId: string,
    prNumber: number,
    body: { selectedItemIds?: string[]; target?: "claude_code" | "codex" | "both"; reviewRunId?: string; items?: unknown[]; productSpec?: unknown },
  ): Promise<ApiResult> {
    return this.request("create_fix_instructions", "POST", `/workspace/projects/${enc(projectId)}/github/pulls/${prNumber}/fix-brief`, { body });
  }

  compareRuns(projectId: string, prNumber: number): Promise<ApiResult> {
    return this.request("compare_runs", "GET", `/workspace/projects/${enc(projectId)}/github/pulls/${prNumber}/review/compare`);
  }

  previewPrComment(
    projectId: string,
    prNumber: number,
    body: { selectedItemIds?: string[]; includeFixBrief?: boolean; includeComparison?: boolean; includeRerunComparison?: boolean; reviewRunId?: string },
  ): Promise<ApiResult> {
    return this.request("preview_pr_comment", "POST", `/workspace/projects/${enc(projectId)}/github/pulls/${prNumber}/comment/preview`, { body });
  }

  /** WRITE — posts a real GitHub comment. Guarded by the server (disabled by default
   *  + explicit confirm). */
  postPrComment(
    projectId: string,
    prNumber: number,
    body: { selectedItemIds?: string[]; includeFixBrief?: boolean; includeComparison?: boolean; includeRerunComparison?: boolean; reviewRunId?: string; mode?: "new" | "update_latest" },
  ): Promise<ApiResult> {
    return this.request("post_pr_comment", "POST", `/workspace/projects/${enc(projectId)}/github/pulls/${prNumber}/comment`, { body });
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function nowIso(): string {
  return new Date().toISOString();
}
