# Mobile Reader API — serving books to the StockMaster Expo app

**Date:** 2026-06-01
**Status:** Steps 1 & 2 implemented (reader API + HMAC app-signature + rate limit). Native
attestation remains an optional future upgrade.

## Goal

Expose published books/articles from the StockMaster CMS to the **StockMaster Expo
mobile app**. Content is **free** and read **anonymously** (no reader accounts, no
purchases). The only real requirement beyond "published-only" is that the content should
be served to **genuine installs of our app**, not arbitrary clients/scrapers.

## Decisions (locked)

- **Reading:** free, anonymous. No CMS reader accounts, no store entitlement.
- **Continue-reading:** stored **on-device** in the app (AsyncStorage). No server state.
- **Media (covers/images):** stay on the **public-read** bucket. No signed URLs.
- **Platform:** Expo (React Native, iOS + Android).
- **"Only our app":** scheme **B — HMAC request signing** with a shared secret
  (`MOBILE_APP_SECRET`), plus IP rate limiting and (client-side) TLS pinning. Chosen over
  Firebase App Check because there is **no Firebase account** and the content is free —
  this deters casual scraping with zero extra infra. Native attestation (Play Integrity /
  App Attest, self-verified, no Firebase) is the documented upgrade path if the bar needs
  raising.

## Honest security caveat

The HMAC secret ships inside the app binary, so a determined reverse-engineer can extract
it and call the API. This is acceptable for **free** content — the goal is to stop casual
scraping/curl, not a motivated attacker. If that bar ever needs raising, swap the HMAC
guard for native attestation (see "Upgrade path").

## Architecture (defense-in-depth)

1. **Reader API `/v1/*` — published-only.** Separate `ReaderModule`, distinct from the
   editor API. Returns only `status: 'published'` at both work and page level.
2. **HMAC app-signature** (the "only our app" gate). The app signs every `/v1` request with
   `MOBILE_APP_SECRET`; `AppHmacGuard` verifies signature + timestamp window + nonce replay.
3. **IP rate limiting** (`RateLimitGuard`, in-memory fixed window) to deter bulk scraping.
4. **TLS + certificate pinning** in the Expo app (client-side).
5. **Network-isolate the editor API** — expose only `/v1/*` publicly; keep `/works`,
   `/auth`, admin on a private hostname/allowlist.
6. **Abuse monitoring** via the existing ReadEvent tracking (mobile reads tagged
   `X-Client: expo`).

## Request signing scheme (what the Expo app must send)

```
canonical = `${METHOD}\n${path+query}\n${timestamp}\n${nonce}`
signature = base64( HMAC_SHA256(MOBILE_APP_SECRET, canonical) )
```

Headers on every `/v1` request:

| Header | Value |
| --- | --- |
| `X-App-Timestamp` | epoch **seconds** (must be within ±300s of server time) |
| `X-App-Nonce` | random per request (e.g. UUID); never reused within the window |
| `X-App-Signature` | base64 HMAC above |
| `X-Client` | `expo` (tags reads in analytics) |

`path+query` is the request path the server sees (e.g. `/v1/books/abc`), matching
Express `req.originalUrl`. Failures → `401`; rate limit → `429`.

Expo client helper:

```ts
import * as Crypto from 'expo-crypto';
import 'react-native-get-random-values';

const BASE = 'https://api.example.com';
const SECRET = process.env.EXPO_PUBLIC_MOBILE_APP_SECRET!; // bundled; see caveat

async function signedFetch(path: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const canonical = `GET\n${path}\n${ts}\n${nonce}`;
  // HMAC-SHA256 → base64. Use expo-crypto's HMAC, or a small JS hmac lib.
  const sig = await hmacSha256Base64(SECRET, canonical);
  return fetch(`${BASE}${path}`, {
    headers: {
      'X-App-Timestamp': ts,
      'X-App-Nonce': nonce,
      'X-App-Signature': sig,
      'X-Client': 'expo',
    },
  });
}
```

## Step 1 — Reader API (IMPLEMENTED)

`apps/api/src/reader/` — `ReaderModule`, `ReaderController` (`@Controller('v1')`,
`@Public()`), `ReaderService`.

| Endpoint | Returns |
| --- | --- |
| `GET /v1/books` | Published works (summary; counts reflect published pages only) |
| `GET /v1/books/:id` | Published work → chapters → page summaries (id, title, wordCount, **`pageNumber`**); empty chapters hidden. 404 if not published |
| `GET /v1/books/:id/pages/:pageno` | The **Nth published page** (1-based, book-global reading order) with full content + `pageNumber`, `totalPages`, `prevPage`, `nextPage` (null at the ends). 404 if the book isn't published or the number is out of range |

Pages are addressed by **page number**, not page id — the book detail exposes the same
`pageNumber` on each page so the app can jump straight to `/v1/books/:id/pages/:pageno`,
and the page response carries `prevPage`/`nextPage` for the reader's pager.

- Reuses `works/serializers.ts` (`toWorkSummary`, `toWorkDetail`, `toPage`).
- `@TrackRead('book_open' | 'page_read')` records anonymous ReadEvents (userId null,
  client `expo`) — feeds existing analytics.
- Lazy-load shape: list/detail are small; page content fetched on demand.

**Verified:** drafts excluded (draft work → 404, draft page → 404 and dropped from its
chapter); editor API still returns 401 without a token.

## Step 2 — HMAC app-signature + rate limit (IMPLEMENTED)

`@Public()` opts these routes out of the editor JwtAuthGuard; instead
`@UseGuards(RateLimitGuard, AppHmacGuard)` gates them.

- `apps/api/src/common/guards/app-hmac.guard.ts` — verifies `X-App-Signature` over the
  canonical string, rejects timestamps outside ±300s and reused nonces (in-memory cache).
- `apps/api/src/common/guards/rate-limit.guard.ts` — 120 req/min/IP, in-memory fixed window.
- `MOBILE_APP_SECRET` added to env validation (`secret`, ≥32 chars; production rejects the
  `change-me` placeholder), `.env`, `.env.example`, and the compose `api` service env.

**Verified:** unsigned → 401, signed → 200, replayed nonce → 401, tampered signature → 401,
stale timestamp → 401; signed requests return the published content.

## Step 3 — Production hardening (PENDING)

- Deployment: reverse proxy terminating TLS; expose only `/v1/*` publicly; editor API on a
  private hostname/allowlist/VPN.
- **Certificate pinning** in the Expo app.
- Rotate `MOBILE_APP_SECRET` to a real value (production boot refuses the placeholder).
- If horizontally scaled: move the nonce cache + rate limiter to Redis (or
  `@nestjs/throttler` + Redis), and set `app.set('trust proxy', …)` so `req.ip` is the real
  client behind the load balancer.

## Upgrade path — native attestation (no Firebase, optional)

If "only our app" needs to be genuinely enforced later: replace `AppHmacGuard` with
self-verified **Play Integrity** (Android, decode the token with Play Console keys) +
**App Attest** (iOS, verify against Apple's root). No Firebase, no third party — just the
store developer accounts. More server code; same `/v1` surface.

## Notes / gotchas

- `nest --watch` in the dev container can hit `EADDRINUSE` on restart (old process not
  killed); `docker compose --profile apps restart api` gives a clean single process.
- Mobile content shape is raw Tiptap JSON. If the app shouldn't depend on editor block
  internals, add a thin `tiptap → reader-blocks` transform at the API later.
