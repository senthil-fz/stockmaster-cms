#!/usr/bin/env node
/**
 * Blockpress draft-only MCP server entry point.
 *
 * Speaks MCP over the Streamable HTTP transport: a long-lived service reachable by URL
 * (POST /mcp), e.g. a Docker container behind a domain. Clients connect with
 * `claude mcp add --transport http <name> <url>` (or any MCP client's HTTP option).
 *
 * Every tool maps to the Blockpress REST API using a draft-only ApiKey
 * (BLOCKPRESS_API_URL / BLOCKPRESS_API_KEY), so the agent physically cannot publish or delete.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools';
import { startHttpServer } from './http-transport';

/** Build a fresh, fully-wired MCP server — one per HTTP session. */
export function buildServer(): McpServer {
  const server = new McpServer({ name: 'blockpress-draft', version: '0.1.0' });
  registerTools(server);
  return server;
}

async function main(): Promise<void> {
  const port = Number(process.env.MCP_HTTP_PORT ?? process.env.PORT ?? 3002);
  await startHttpServer(buildServer, port);
}

main().catch((err) => {
  console.error('[blockpress-mcp] fatal:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
