#!/usr/bin/env node
/**
 * Blockpress draft-only MCP server entry point.
 *
 * Speaks MCP over stdio (stdin/stdout IS the transport), so this process must write
 * NOTHING to stdout except the protocol stream. All diagnostics go to stderr.
 *
 * Launched by an agent host (Claude Desktop / Claude Code) with BLOCKPRESS_API_URL and
 * BLOCKPRESS_API_KEY in the environment. Every tool maps to the Blockpress REST API and
 * the credential is a draft-only ApiKey, so the agent physically cannot publish or delete.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools';

async function main(): Promise<void> {
  const server = new McpServer({ name: 'blockpress-draft', version: '0.1.0' });
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr only — stdout is the MCP stdio transport.
  console.error('[blockpress-mcp] draft-only MCP server ready on stdio.');
}

main().catch((err) => {
  console.error('[blockpress-mcp] fatal:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
