/**
 * Domain-independent cover/image URLs.
 *
 * Covers used to be persisted as ABSOLUTE urls (e.g. https://api.laabam.in/uploads/x.jpg),
 * which froze the API domain into every Article/Book row AND every immutable publish
 * snapshot. A single domain change (laabam.in -> stockmasternagaraj.com) then dead-linked
 * every cover and forced a legacy-host rewrite hack.
 *
 * Fix: persist covers as RELATIVE paths ("/uploads/<year>/<uuid>.<ext>") and attach the
 * current domain only at READ time. Storage carries no domain, so a future move is a no-op.
 *
 *   - toStoredCoverUrl  — WRITE boundary: strip any domain off an /uploads URL -> "/uploads/…"
 *   - toPublicCoverUrl  — READ boundary:  prefix the current API origin -> absolute, current
 *
 * Both are null-safe and idempotent. Non-upload absolute URLs (an externally hosted image a
 * user pasted) are left untouched — only our own /uploads/* references are rebased.
 */

// The current public origin of the API (where /uploads/* is statically served).
const PUBLIC_BASE = (process.env.PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

const isUploadPath = (pathname: string): boolean => pathname.startsWith('/uploads/');

/**
 * WRITE: reduce a cover reference to a domain-free path before persisting.
 * Absolute /uploads URL -> "/uploads/…"; already-relative -> normalized leading slash;
 * external absolute URL -> kept as-is.
 */
export function toStoredCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url); // absolute
    return isUploadPath(u.pathname) ? `${u.pathname}${u.search}` : url;
  } catch {
    // Relative input ("/uploads/…" or "uploads/…") — guarantee a single leading slash.
    return url.startsWith('/') ? url : `/${url}`;
  }
}

/**
 * READ: expand a stored cover reference to an absolute URL on the CURRENT API origin.
 * Relative path -> PUBLIC_BASE + path; absolute /uploads URL (legacy or current host) ->
 * rebased onto PUBLIC_BASE; external absolute URL -> kept as-is.
 */
export function toPublicCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url); // absolute
    return isUploadPath(u.pathname) ? `${PUBLIC_BASE}${u.pathname}${u.search}` : url;
  } catch {
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${PUBLIC_BASE}${path}`;
  }
}
