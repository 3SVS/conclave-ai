# @conclave-ai/mcp-workspace

Agent-facing MCP server (stdio) that exposes Conclave's acceptance / PR-review
workflow as tools. It wraps the central-plane HTTP API — it adds **no new product
behavior**, only a safe tool interface for agents (Claude Code, Cursor, Codex-like).

## Tools (MVP)

| Tool | Kind | Maps to |
|------|------|---------|
| `list_projects` | read | `GET /workspace/projects` |
| `get_project` | read (ownership-checked) | `GET /workspace/projects/:id` |
| `list_pull_requests` | read | `GET …/github/pulls` |
| `run_pr_review` | action (no GitHub write, billing dry-run) | `POST …/pulls/:n/review` |
| `get_review_history` | read | `GET …/review-history` |
| `get_review_run` | read | `GET …/review/runs/:runId` |
| `create_fix_instructions` | read (generates text) | `POST …/pulls/:n/fix-brief` |
| `compare_runs` | read | `GET …/pulls/:n/review/compare` |
| `preview_pr_comment` | read (no post) | `POST …/pulls/:n/comment/preview` |
| `post_pr_comment` | **write — disabled by default** | `POST …/pulls/:n/comment` |

## Security model

- **No raw GitHub token** is ever requested or returned. The token lives encrypted
  in central-plane; this server only calls Conclave's API.
- **userKey is injected server-side** from `CONCLAVE_USER_KEY` (env), never a tool
  argument — an agent cannot spoof identity. `get_project` is ownership-checked.
- **Write-first-preview.** `post_pr_comment` is **off by default**
  (`CONCLAVE_MCP_ENABLE_POST_COMMENT=true` to enable) and, even then, requires
  `confirm:true`. Always `preview_pr_comment` first.
- **Auditable.** Every tool call emits one JSON line on stderr (tool, method, path,
  status) — never the userKey or request bodies. stdout is the MCP channel only.
- **No actual credit debit/blocking** (central-plane billing stays in dry-run); **no
  private-repo scope expansion**.
- Tool descriptions mark PR/diff/review text as untrusted **data**, not instructions
  (tool-poisoning / prompt-injection defense).

## Configure

```
CONCLAVE_USER_KEY                 (required) uk_…
CONCLAVE_CENTRAL_PLANE_URL        (optional) default production worker
CONCLAVE_MCP_ENABLE_POST_COMMENT  (optional) "true" to expose post_pr_comment
```

MCP client config:

```json
{
  "mcpServers": {
    "conclave-workspace": {
      "command": "conclave-mcp-workspace",
      "env": { "CONCLAVE_USER_KEY": "uk_..." }
    }
  }
}
```
