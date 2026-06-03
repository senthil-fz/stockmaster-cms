import { z } from 'zod';
import {
  apiKeySummarySchema,
  articleDetailSchema,
  articleSummarySchema,
  authResponseSchema,
  bookDetailSchema,
  bookStatDetailSchema,
  bookStatsResponseSchema,
  bookSummarySchema,
  chapterSchema,
  createApiKeyResponseSchema,
  pageSchema,
  uploadResponseSchema,
  userSchema,
  type ApiKeyScope,
  type ArticlesQuery,
  type BooksQuery,
  type CreateArticleInput,
  type CreateBookInput,
  type CreateChapterInput,
  type CreatePageInput,
  type LoginInput,
  type SignupInput,
  type StatsQuery,
  type UpdateArticleInput,
  type UpdateBookInput,
  type UpdatePageInput,
} from '@stockmaster/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// Access token lives in memory; the refresh token is an httpOnly cookie the
// browser sends to /auth/refresh automatically.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null): void => {
  accessToken = t;
};
export const getAccessToken = (): string | null => accessToken;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Single-flight: concurrent 401s collapse into one /auth/refresh call so we don't
// stampede the endpoint or let racing refreshes clobber each other's token.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const { method = 'GET', body, schema, signal } = opts;
  const doFetch = (): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'X-Client': 'web', // tags this app's reads in analytics (see ReadTrackingInterceptor)
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

  let res = await doFetch();

  // Transparently refresh once on 401 (except for auth routes themselves).
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await doFetch();
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const err = (await res.json()) as { message?: string | string[]; error?: string };
      const m = err.message ?? err.error;
      message = Array.isArray(m) ? m.join(', ') : (m ?? message);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json();
  return schema ? schema.parse(data) : (data as T);
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries as [string, string][]).toString();
}

const meResponseSchema = z.object({ user: userSchema });

export const authApi = {
  login: async (input: LoginInput) => {
    const r = await request('/auth/login', { method: 'POST', body: input, schema: authResponseSchema });
    setAccessToken(r.accessToken);
    return r;
  },
  me: () => request('/auth/me', { schema: meResponseSchema }),
  refresh: refreshAccessToken,
  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
    }
  },
};

// Authenticated user management. Creating a user does NOT touch the current session's
// access token — the signed-in creator stays themselves; the new user signs in later.
export const usersApi = {
  create: (input: SignupInput) =>
    request('/auth/users', { method: 'POST', body: input, schema: meResponseSchema }),
};

// Personal API keys for the MCP server (and other programmatic, draft-only callers).
// Every call rides the existing Bearer-auth request() helper — the /api-keys routes are
// JWT-only, so an ApiKey credential can never reach them.
export const apiKeysApi = {
  list: () => request('/api-keys', { schema: z.array(apiKeySummarySchema) }),
  create: (name: string, scopes: ApiKeyScope[], expiresAt?: string) =>
    request('/api-keys', {
      method: 'POST',
      // `expiresAt` is omitted when never-expiring; when set it MUST be an absolute UTC/ISO
      // instant (see api-keys.tsx) so the server's future-date check can't skew by the client.
      body: { name, scopes, ...(expiresAt ? { expiresAt } : {}) },
      schema: createApiKeyResponseSchema,
    }),
  // Revoke returns { ok: true } (HTTP 200, not 204) — no response schema needed.
  revoke: (id: string) => request(`/api-keys/${id}`, { method: 'DELETE' }),
};

const statsQs = (q: StatsQuery): string => qs({ client: q.client, from: q.from, to: q.to });

export const statsApi = {
  books: (q: StatsQuery = {}) =>
    request(`/stats/books${statsQs(q)}`, { schema: bookStatsResponseSchema }),
  bookDetail: (id: string, q: StatsQuery = {}) =>
    request(`/stats/books/${id}${statsQs(q)}`, { schema: bookStatDetailSchema }),
};

export const booksApi = {
  list: (query: BooksQuery = {}) =>
    request(`/books${qs({ status: query.status })}`, {
      schema: z.array(bookSummarySchema),
    }),
  detail: (id: string) => request(`/books/${id}`, { schema: bookDetailSchema }),
  create: (body: CreateBookInput) => request('/books', { method: 'POST', body, schema: bookSummarySchema }),
  update: (id: string, body: UpdateBookInput) =>
    request(`/books/${id}`, { method: 'PATCH', body, schema: bookSummarySchema }),
  remove: (id: string) => request(`/books/${id}`, { method: 'DELETE' }),
  addChapter: (bookId: string, body: CreateChapterInput) =>
    request(`/books/${bookId}/chapters`, { method: 'POST', body, schema: chapterSchema }),
  removeChapter: (id: string) => request(`/chapters/${id}`, { method: 'DELETE' }),
};

export const articlesApi = {
  list: (query: ArticlesQuery = {}) =>
    request(`/articles${qs({ status: query.status })}`, {
      schema: z.array(articleSummarySchema),
    }),
  detail: (idOrSlug: string) => request(`/articles/${idOrSlug}`, { schema: articleDetailSchema }),
  create: (body: CreateArticleInput) =>
    request('/articles', { method: 'POST', body, schema: articleSummarySchema }),
  update: (id: string, body: UpdateArticleInput) =>
    request(`/articles/${id}`, { method: 'PATCH', body, schema: articleDetailSchema }),
  remove: (id: string) => request(`/articles/${id}`, { method: 'DELETE' }),
};

export const pagesApi = {
  get: (id: string) => request(`/pages/${id}`, { schema: pageSchema }),
  addPage: (chapterId: string, body: CreatePageInput) =>
    request(`/chapters/${chapterId}/pages`, { method: 'POST', body, schema: pageSchema }),
  update: (id: string, body: UpdatePageInput) =>
    request(`/pages/${id}`, { method: 'PATCH', body, schema: pageSchema }),
  remove: (id: string) => request(`/pages/${id}`, { method: 'DELETE' }),
  /**
   * Fire-and-forget page update that survives page unload (tab close / refresh).
   * Uses `keepalive: true` so the browser completes the request after teardown.
   * No refresh-on-401 retry (the page is going away) and no response parsing.
   */
  updateOnUnload: (id: string, body: UpdatePageInput): void => {
    void fetch(`${API_URL}/pages/${id}`, {
      method: 'PATCH',
      keepalive: true,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  },
};

export const uploadsApi = {
  /** Multipart image upload to the API (stored on disk). Returns { url, key }. */
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const doFetch = (): Promise<Response> =>
      fetch(`${API_URL}/uploads`, {
        method: 'POST',
        credentials: 'include',
        // No Content-Type — the browser sets the multipart boundary.
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: form,
      });
    let res = await doFetch();
    if (res.status === 401) {
      if (await refreshAccessToken()) res = await doFetch();
    }
    if (!res.ok) {
      let message = res.statusText;
      try {
        const err = (await res.json()) as { message?: string | string[] };
        const m = err.message;
        message = Array.isArray(m) ? m.join(', ') : (m ?? message);
      } catch {
        /* non-JSON */
      }
      throw new ApiError(res.status, message);
    }
    return uploadResponseSchema.parse(await res.json());
  },
};
