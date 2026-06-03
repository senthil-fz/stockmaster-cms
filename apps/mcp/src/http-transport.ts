import { randomUUID } from 'node:crypto';
import express from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createApiClient, type ApiClient } from './api-client';

/** Pull the draft-only key the client presents: `Authorization: Bearer <bp_key>` (or ApiKey). */
function extractApiKey(req: express.Request): string | undefined {
  const h = req.headers['authorization'];
  if (typeof h !== 'string') return undefined;
  const m = h.match(/^(?:Bearer|ApiKey)\s+(.+)$/i);
  const token = (m ? m[1] : h).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Serve the MCP server over the Streamable HTTP transport so it can run as a long-lived
 * service (a Docker container) reachable by URL — `POST /mcp` — instead of being spawned
 * per session over stdio. Clients (e.g. `claude mcp add --transport http <name> <url>`)
 * connect to the URL.
 *
 * STATEFUL (session-id) mode: the client sends `initialize`, the transport mints an
 * `Mcp-Session-Id`, and subsequent requests carry it so they route back to the same
 * connected McpServer. We use stateful mode deliberately — stateless mode
 * (`sessionIdGenerator: undefined`) has regressions in current SDK versions where a fresh
 * server rejects non-initialize requests (e.g. typescript-sdk issue #1994). Stateful is the
 * canonical, well-tested pattern for remote servers and every client handles it transparently.
 *
 * Auth: each client presents its OWN draft-only key as `Authorization: Bearer <bp_key>`; the
 * server holds none and forwards it to the API per session (401 if absent). A connection can
 * therefore only do what its key allows — create/edit drafts, never publish or delete.
 *
 * DEPLOYMENT: behind a public domain (e.g. https://mcp.example.com), set MCP_ALLOWED_HOSTS to
 * enable DNS-rebinding (Host header) protection, and serve over HTTPS.
 */
export async function startHttpServer(
  buildServer: (api: ApiClient) => McpServer,
  port: number,
  apiUrl: string,
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '8mb' })); // TipTap docs can be large

  // One live transport (and its connected McpServer) per MCP session id.
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Opt-in DNS-rebinding protection for production (e.g. MCP_ALLOWED_HOSTS=mcp.example.com).
  const allowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const dnsProtection = allowedHosts?.length
    ? { enableDnsRebindingProtection: true, allowedHosts }
    : {};

  app.get('/health', (_req, res) => {
    res.json({ ok: true, server: 'blockpress-draft', transport: 'streamable-http', sessions: transports.size });
  });

  app.post('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (!sessionId && isInitializeRequest(req.body)) {
          const apiKey = extractApiKey(req);
          if (!apiKey) {
            res.status(401).json({
              jsonrpc: '2.0',
              error: {
                code: -32001,
                message: 'Unauthorized: present your draft-only key as `Authorization: Bearer <bp_key>`.',
              },
              id: null,
            });
            return;
          }
          // New session — create a transport + fresh server bound to THIS client's key.
          const newTransport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports.set(sid, newTransport);
            },
            ...dnsProtection,
          });
          newTransport.onclose = () => {
            if (newTransport.sessionId) transports.delete(newTransport.sessionId);
          };
          await buildServer(createApiClient(apiUrl, apiKey)).connect(newTransport);
          transport = newTransport;
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: no valid session id (send an initialize request first).' },
            id: null,
          });
          return;
        }
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[blockpress-mcp] request error:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  // GET = server→client SSE stream; DELETE = terminate the session. Both need a live session.
  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send('Invalid or missing Mcp-Session-Id');
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.error(`[blockpress-mcp] Streamable HTTP transport listening on :${port}/mcp`);
      resolve();
    });
  });
}
