#!/usr/bin/env node
/**
 * Blockpress draft-only MCP server entry point.
 *
 * Speaks MCP over the Streamable HTTP transport: a long-lived service reachable by URL
 * (POST /mcp), e.g. a Docker container behind a domain. Clients connect with
 * `claude mcp add --transport http <name> <url> --header "Authorization: Bearer <bp_key>"`.
 *
 * The server holds NO credential of its own. Each client authenticates by presenting its
 * own draft-only ApiKey (Authorization: Bearer <bp_key>); the server forwards it to the
 * Blockpress API per session, so the connection can only do what that key allows — i.e.
 * create/edit drafts, never publish or delete. Only BLOCKPRESS_API_URL is server config.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client';
import { registerTools } from './tools';
import { startHttpServer } from './http-transport';

/** Build a fresh MCP server bound to one client's API credential — one per HTTP session. */
export function buildServer(api: ApiClient): McpServer {
  const server = new McpServer({ name: 'blockpress-draft', version: '0.1.0' });
  registerTools(server, api);
  return server;
}

async function main(): Promise<void> {
  const apiUrl = process.env.BLOCKPRESS_API_URL ?? '';
  if (!apiUrl) {
    console.error('[blockpress-mcp] BLOCKPRESS_API_URL is not set; API calls will fail.');
  }
  const port = Number(process.env.MCP_HTTP_PORT ?? process.env.PORT ?? 3002);
  await startHttpServer(buildServer, port, apiUrl);
}

main().catch((err) => {
  console.error('[blockpress-mcp] fatal:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
