/**
 * Tiny typed HTTP client factory for the StockMaster REST API.
 *
 * `createApiClient(apiUrl, apiKey)` binds a client to one draft-only key. The HTTP transport
 * builds one per session from the key the CLIENT presents (Authorization: Bearer <bp_key>),
 * so the MCP server holds no credential of its own — each connection acts as its own key.
 *
 * Every request carries `Authorization: ApiKey <apiKey>` (NOT Bearer — the API resolves
 * ApiKey credentials to a scoped, draft-only principal). On a non-2xx response we read the
 * NestJS error body and surface its `message` field VERBATIM, so a 403 reads "draft-only key
 * cannot publish" and a 400 reads the exact zod limit message. NestJS `message` is
 * `string | string[]` (zod errors arrive as an array) — both forms are flattened.
 *
 * This module THROWS on failure; tool handlers (tools.ts) catch and convert to an
 * `isError: true` tool result so they never throw. Diagnostics go to stderr only.
 */

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

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
}

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

/** Build a client bound to one API base URL + one draft-only key. */
export function createApiClient(apiUrl: string, apiKey: string): ApiClient {
  const base = apiUrl.replace(/\/+$/, '');

  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        // The draft-only credential the client presented, forwarded to the API.
        Authorization: `ApiKey ${apiKey}`,
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

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  };
}
