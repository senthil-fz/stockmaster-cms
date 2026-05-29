import { z } from 'zod';
import {
  authResponseSchema,
  chapterSchema,
  pageSchema,
  presignResponseSchema,
  userSchema,
  workDetailSchema,
  workSummarySchema,
  type CreateChapterInput,
  type CreatePageInput,
  type CreateWorkInput,
  type LoginInput,
  type PresignRequest,
  type SignupInput,
  type UpdatePageInput,
  type UpdateWorkInput,
  type WorksQuery,
} from '@blockpress/shared';

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

async function refreshAccessToken(): Promise<boolean> {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    accessToken = null;
    return false;
  }
  const data = (await res.json()) as { accessToken: string };
  accessToken = data.accessToken;
  return true;
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
  signup: async (input: SignupInput) => {
    const r = await request('/auth/signup', { method: 'POST', body: input, schema: authResponseSchema });
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

export const worksApi = {
  list: (query: WorksQuery = {}) =>
    request(`/works${qs({ kind: query.kind, status: query.status })}`, {
      schema: z.array(workSummarySchema),
    }),
  detail: (id: string) => request(`/works/${id}`, { schema: workDetailSchema }),
  create: (body: CreateWorkInput) => request('/works', { method: 'POST', body, schema: workSummarySchema }),
  update: (id: string, body: UpdateWorkInput) =>
    request(`/works/${id}`, { method: 'PATCH', body, schema: workSummarySchema }),
  remove: (id: string) => request(`/works/${id}`, { method: 'DELETE' }),
  addChapter: (workId: string, body: CreateChapterInput) =>
    request(`/works/${workId}/chapters`, { method: 'POST', body, schema: chapterSchema }),
};

export const pagesApi = {
  get: (id: string) => request(`/pages/${id}`, { schema: pageSchema }),
  addPage: (chapterId: string, body: CreatePageInput) =>
    request(`/chapters/${chapterId}/pages`, { method: 'POST', body, schema: pageSchema }),
  update: (id: string, body: UpdatePageInput) =>
    request(`/pages/${id}`, { method: 'PATCH', body, schema: pageSchema }),
  remove: (id: string) => request(`/pages/${id}`, { method: 'DELETE' }),
};

export const uploadsApi = {
  presign: (body: PresignRequest) =>
    request('/uploads/presign', { method: 'POST', body, schema: presignResponseSchema }),
};
