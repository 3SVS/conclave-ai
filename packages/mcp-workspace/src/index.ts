#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WorkspaceClient } from "./client.js";
import { buildServer } from "./server.js";

export { WorkspaceClient } from "./client.js";
export { buildServer } from "./server.js";
export type { ServerOptions } from "./server.js";

const DEFAULT_BASE_URL = "https://conclave-ai.seunghunbae.workers.dev";

const HELP = `conclave-mcp-workspace — Conclave acceptance/PR-review workflow as MCP tools (stdio)

Configure via environment, then launch from an MCP client (Claude Code, Cursor, …):

  CONCLAVE_USER_KEY                 (required) your workspace user key (uk_…)
  CONCLAVE_CENTRAL_PLANE_URL        (optional) default ${DEFAULT_BASE_URL}
  CONCLAVE_MCP_ENABLE_POST_COMMENT  (optional) "true" to expose the write tool
                                    post_pr_comment (disabled by default)

Example MCP client config:
  {
    "mcpServers": {
      "conclave-workspace": {
        "command": "conclave-mcp-workspace",
        "env": { "CONCLAVE_USER_KEY": "uk_..." }
      }
    }
  }

The GitHub token never leaves central-plane; this server only calls Conclave's API.
`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }

  const userKey = process.env.CONCLAVE_USER_KEY?.trim();
  if (!userKey) {
    process.stderr.write("conclave-mcp-workspace: CONCLAVE_USER_KEY is required.\n");
    process.exitCode = 1;
    return;
  }
  const baseUrl = process.env.CONCLAVE_CENTRAL_PLANE_URL?.trim() || DEFAULT_BASE_URL;
  const enablePostComment = (process.env.CONCLAVE_MCP_ENABLE_POST_COMMENT ?? "").toLowerCase() === "true";

  const client = new WorkspaceClient({ baseUrl, userKey });
  const server = buildServer({ client, enablePostComment });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `conclave-mcp-workspace: ready on stdio (base=${baseUrl}, post_pr_comment=${enablePostComment ? "on" : "off"})\n`,
  );
}

// Run when invoked as a binary (not when imported by tests).
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("index.js");
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`conclave-mcp-workspace: fatal ${(err as Error).message}\n`);
    process.exitCode = 1;
  });
}
