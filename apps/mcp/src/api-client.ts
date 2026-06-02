/**
 * Tiny typed HTTP client for the Blockpress REST API.
 *
 * Every request carries `Authorization: ApiKey <BLOCKPRESS_API_KEY>` (NOT Bearer —
 * the API resolves ApiKey credentials to a scoped, draft-only principal). On a non-2xx
 * response we read the NestJS error body and surface its `message` field VERBATIM, so a
 * 403 reads "draft-only key cannot publish" and a 400 reads the exact zod limit message.
 * NestJS `message` is `string | string[]` (zod errors arrive as an array) — both forms
 * are flattened to a single string.
 *
 * This module THROWS on failure; tool handlers (tools.ts) catch and convert to an
 * `isError: true` tool result so they never throw. Nothing here writes to stdout
 * (stdout is the MCP stdio transport) — diagnostics go to stderr only.
 */

const API_URL = (process.env.BLOCKPRESS_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.BLOCKPRESS_API_KEY ?? '';

if (!API_URL) {
  // stderr only — stdout is the transport.
  console.error('[blockpress-mcp] BLOCKPRESS_API_URL is not set; API calls will fail.');
}
if (!API_KEY) {
  console.error('[blockpress-mcp] BLOCKPRESS_API_KEY is not set; API calls will fail.');
}

/** An error carrying the API's HTTP status + its verbatim `message`. */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Flatten NestJS's `message` (string | string[]) / `error` into one verbatim string. */
function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; error?: unknown };
    const m = b.message ?? b.error;
    if (Array.isArray(m)) return m.map((x) => String(x)).join(', ');
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return fallback;
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      // Injected on EVERY request — this is the draft-only credential.
      Authorization: `ApiKey ${API_KEY}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      /* non-JSON error body — fall back to statusText */
    }
    throw new ApiClientError(res.status, extractMessage(parsed, res.statusText));
  }

  // 204 No Content (and other empty bodies) → return undefined.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (text.length === 0) return undefined as T;
  return JSON.parse(text) as T;
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body),
};
