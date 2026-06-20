/**
 * COVER URL CONTRACT — covers are persisted domain-free and rebased onto the current API
 * origin at read time, so a domain change never dead-links an image.
 *
 *   toStoredCoverUrl (write): absolute /uploads URL -> "/uploads/…"; relative -> normalized
 *   toPublicCoverUrl (read):  relative or any-host /uploads -> absolute on PUBLIC_API_URL
 *
 * PUBLIC_API_URL is unset under jest, so the read base defaults to http://localhost:3001.
 */
import { toPublicCoverUrl, toStoredCoverUrl } from '../src/common/media/cover-url';

describe('toStoredCoverUrl — strip domain before persisting', () => {
  it('reduces an absolute /uploads URL to a relative path', () => {
    expect(toStoredCoverUrl('https://api.stockmasternagaraj.com/uploads/2026/x.jpg')).toBe(
      '/uploads/2026/x.jpg',
    );
    expect(toStoredCoverUrl('https://api.laabam.in/uploads/2026/x.jpg')).toBe('/uploads/2026/x.jpg');
  });

  it('normalizes a relative path and is idempotent', () => {
    expect(toStoredCoverUrl('/uploads/2026/x.jpg')).toBe('/uploads/2026/x.jpg');
    expect(toStoredCoverUrl('uploads/2026/x.jpg')).toBe('/uploads/2026/x.jpg');
    expect(toStoredCoverUrl(toStoredCoverUrl('https://h/uploads/a.png'))).toBe('/uploads/a.png');
  });

  it('leaves externally hosted (non-uploads) URLs untouched, and passes null through', () => {
    expect(toStoredCoverUrl('https://images.cdn.com/a.png')).toBe('https://images.cdn.com/a.png');
    expect(toStoredCoverUrl(null)).toBeNull();
    expect(toStoredCoverUrl('')).toBeNull();
  });
});

describe('toPublicCoverUrl — rebase onto the current origin when read', () => {
  it('expands a relative path to an absolute URL on the current host', () => {
    expect(toPublicCoverUrl('/uploads/2026/x.jpg')).toBe('http://localhost:3001/uploads/2026/x.jpg');
    expect(toPublicCoverUrl('uploads/2026/x.jpg')).toBe('http://localhost:3001/uploads/2026/x.jpg');
  });

  it('rebases any-host /uploads URL (legacy or current) onto the current host', () => {
    expect(toPublicCoverUrl('https://api.laabam.in/uploads/2026/x.jpg')).toBe(
      'http://localhost:3001/uploads/2026/x.jpg',
    );
  });

  it('leaves externally hosted URLs untouched, and passes null through', () => {
    expect(toPublicCoverUrl('https://images.cdn.com/a.png')).toBe('https://images.cdn.com/a.png');
    expect(toPublicCoverUrl(null)).toBeNull();
  });

  it('round-trips: store then read yields an absolute current-host URL', () => {
    const stored = toStoredCoverUrl('https://api.laabam.in/uploads/2026/x.jpg');
    expect(toPublicCoverUrl(stored)).toBe('http://localhost:3001/uploads/2026/x.jpg');
  });
});
