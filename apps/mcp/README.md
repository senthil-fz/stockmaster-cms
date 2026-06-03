# @blockpress/mcp — draft-only MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent
**create and edit Blockpress books and articles — but only ever as drafts.** It runs as a
long-lived service speaking MCP over the **Streamable HTTP** transport (`POST /mcp`), and calls
the existing Blockpress REST API using a **scoped, draft-only API key**. The key carries
`content:write` only, so the agent is *physically unable* to publish or delete content: those
operations return **403** at the API, regardless of what the client tries.

There is intentionally **no publish, status, or delete tool** in this server, and the
`update_*` tools deliberately omit the `status` field. The 403 is the backstop; the missing
tools are the primary UX.

---

## 1. Configure the environment

The server holds **no API key of its own** — see [Auth](#auth) below. Its only config:

| Variable             | Meaning                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `BLOCKPRESS_API_URL` | Base URL of the running NestJS API. `http://localhost:3001` on the host; `http://api:3001` from inside the docker network. |
| `MCP_HTTP_PORT`      | Port the Streamable HTTP server listens on (default `3002`).        |
| `MCP_ALLOWED_HOSTS`  | *(optional, production)* comma-separated allowlist of `Host` headers; setting it enables DNS-rebinding protection, e.g. `mcp.example.com`. |

<a id="auth"></a>
**Auth — the client brings the key.** The server holds no credential. Each client presents its
own draft-only key as `Authorization: Bearer <bp_key>`; the server forwards it to the API as
`Authorization: ApiKey <key>` on every request, and **rejects connections that present no key
(401)**. A connection can therefore only do what its key allows — create/edit drafts, never
publish or delete. The server never touches Postgres — all validation, serializers, word-count,
and read-tracking run in the API.

## 2. Mint a draft-only API key

A key is owned by a real Blockpress user; drafts the agent creates are authored by that user.
Two ways to mint one:

**Web UI (recommended).** Sign in to the Blockpress web app → **API Keys** → **Create key**.
Give it a name (e.g. `MCP draft agent`), keep the default scope `content:write`, optionally set
an expiry. The raw key is shown **exactly once** — copy it; you'll hand it to your MCP client in
[§4](#4-connect-a-client). It is never shown again (only its sha256 hash is stored).

**curl.** `/api-keys` is **JWT-only** (an ApiKey can never mint another key), so authenticate
with a user **Bearer** token:

```bash
curl -X POST http://localhost:3001/api-keys \
  -H 'Authorization: Bearer <your-jwt-access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"MCP draft agent","scopes":["content:write"]}'
# → { ..., "prefix":"bp_1a2b3", "rawKey":"bp_<64-hex>" }   ← copy rawKey ONCE
```

Scopes are a fixed enum: `content:write` (create + edit drafts — what you want),
`content:publish`, `content:delete`. A draft-only key uses **only** `content:write`.
These scopes govern both books and articles.
To revoke: `DELETE /api-keys/:id` (or the **Revoke** button) — the key then 401s immediately.

## 3. Run it

**Docker (recommended)** — runs as the `mcp` service alongside the API/web stack. No key to
configure (clients bring their own):

```bash
pnpm docker:up                        # docker compose --profile apps up -d --build
curl http://localhost:3002/health     # { "ok": true, "transport": "streamable-http", ... }
```

The compose `mcp` service reaches the API over the internal docker network (`api:3001`); the
endpoint is `http://localhost:3002/mcp`.

**Standalone (no docker):**

```bash
pnpm --filter @blockpress/editor-schema build   # apps/mcp consumes its dist
pnpm --filter @blockpress/mcp build             # tsc → dist/
MCP_HTTP_PORT=3002 BLOCKPRESS_API_URL=http://localhost:3001 node dist/server.js
```

## 4. Connect a client

The server is reachable by **URL** — no per-session process spawn. Point any MCP client at the
Streamable HTTP endpoint `http://localhost:3002/mcp` and pass your draft-only key as a
`Authorization: Bearer <bp_key>` header.

**Claude Code:**

```bash
claude mcp add --transport http blockpress-draft http://localhost:3002/mcp \
  --header "Authorization: Bearer bp_your-draft-only-key"
claude mcp list                       # verify it's connected
# in a session, /mcp lists the tools
```

**`.mcp.json` / `claude_desktop_config.json` (URL form):**

```json
{
  "mcpServers": {
    "blockpress-draft": {
      "type": "http",
      "url": "http://localhost:3002/mcp",
      "headers": { "Authorization": "Bearer bp_your-draft-only-key" }
    }
  }
}
```

> The server uses **stateful** Streamable HTTP — it mints an `Mcp-Session-Id` on `initialize`
> and clients carry it automatically. `POST /mcp` is the protocol endpoint; `GET /health` is a
> liveness check; logs go to stderr. A connection with **no key is rejected (401)**; a connection
> with a **bad key** initializes but every tool call returns the API's `Invalid API key`.

### Deploying behind a domain

In production, run the container and front it with a TLS reverse proxy:

```
https://mcp.example.com  →  reverse proxy (nginx/Caddy/Traefik, TLS)  →  mcp container :3002
```

Clients then use `https://mcp.example.com/mcp` with their key header
(`claude mcp add --transport http blockpress https://mcp.example.com/mcp --header "Authorization: Bearer <bp_key>"`).

**Auth is already per-client** — the URL alone is useless without a valid draft-only key, and
every key is scoped to drafts and individually revocable. Still, before exposing it publicly:

- Serve over **HTTPS only** (the key travels in a header — never send it over plain http off-box).
- Set `MCP_ALLOWED_HOSTS=mcp.example.com` to enable **DNS-rebinding (Host header) protection**.
- Treat the `bp_` keys as secrets; rotate/revoke via the API Keys UI if one leaks.

## 5. Tools

**Books** (chapter → page tree):

| Tool                | REST mapping            | Notes                                                              |
| ------------------- | ----------------------- | ------------------------------------------------------------------ |
| `list_books`        | `GET /books`            | Filter by `status` is **read-only filtering**, not publishing.    |
| `get_book`          | `GET /books/:id`        | Full chapter/page tree — where chapter ids + page ids come from.   |
| `create_book`       | `POST /books`           | Always a DRAFT. Returns a summary **without** the tree → call `get_book` next for chapter ids. |
| `update_book`       | `PATCH /books/:id`      | Metadata only (incl. `buyLink`). **No `status` field** — cannot publish. |
| `add_chapter`       | `POST /books/:id/chapters` | Returns the chapter with its id.                               |
| `update_chapter`    | `PATCH /chapters/:id`   | Title / order.                                                    |
| `get_page`          | `GET /pages/:id`        | Returns the **stored content** — read-modify-write base.          |
| `add_page`          | `POST /chapters/:id/pages` | Returns the page with id + a blank starter doc.               |
| `update_page`       | `PATCH /pages/:id`      | Title / `content` (Tiptap doc) / order. **No `status` field.**    |

**Articles** (single-page — one Tiptap `content` doc, NO chapters/pages, NO buyLink):

| Tool                | REST mapping              | Notes                                                            |
| ------------------- | ------------------------- | ---------------------------------------------------------------- |
| `create_article`    | `POST /articles`          | Always a DRAFT. Returns the created article summary (id + slug). |
| `list_articles`     | `GET /articles`           | Filter by `status` is **read-only filtering**, not publishing.   |
| `get_article`       | `GET /articles/:idOrSlug` | Returns the **stored content** — read-modify-write base (by id or slug). |
| `update_article`    | `PATCH /articles/:id`     | Metadata + `slug` + `content` (same vocabulary as book pages). **No `status` field** — cannot publish. |

**Local:**

| Tool                | REST mapping            | Notes                                                              |
| ------------------- | ----------------------- | ------------------------------------------------------------------ |
| `validate_content`  | local (no API call)     | Validates a doc against the real ProseMirror schema before saving (pages **and** articles). |

There is intentionally **NO publish/status/delete tool** in v1, for either books or articles.
`validate_content` **IS** included — it is local-only and never mutates anything.

## 6. Content vocabulary (book pages AND articles)

Both `update_page` (a book page) and `update_article` (a single-page article) take a Tiptap
(ProseMirror) JSON document as their `content` — the **exact same vocabulary**. A book is a
chapter → page tree; an article is one standalone `content` doc with no chapters or pages. The
editor's StarterKit has `blockquote` and `codeBlock` **disabled** and adds four custom nodes
plus the table family, so the supported set is:

**Block nodes** (children of `doc`):

- `paragraph` — `{ type:"paragraph", content:[ ...text ] }`
- `heading` — `{ type:"heading", attrs:{ level: 1|2|3 }, content:[ ...text ] }`
- `bulletList` / `orderedList` — `{ type:"bulletList", content:[ listItem... ] }`
- `listItem` — `{ type:"listItem", content:[ paragraph... ] }` (only inside a list)
- `quote` — `{ type:"quote", attrs:{ cite }, content:[ ...text ] }` (pull-quote; `cite` optional)
- `callout` — `{ type:"callout", attrs:{ tone:"info"|"neutral"|"warn"|"success", icon }, content:[ ...text ] }`
- `captionedImage` — `{ type:"captionedImage", attrs:{ src, caption, align:"full"|"left", label } }` (atom — no children)
- `divider` — `{ type:"divider", attrs:{ variant:"line"|"dots" } }` (atom — no children)
- `table` / `tableRow` / `tableHeader` / `tableCell`

**Marks** (attach to **text** nodes via a `marks` array — they are *not* node types):
`bold`, `italic`, `code`, `link` (with `attrs:{ href }`).

A text node: `{ type:"text", text:"hello", marks:[{ type:"bold" }] }`.

> ⚠️ `blockquote` and `codeBlock` **do not exist** — use `quote` and the `code` mark.
> ⚠️ `captionedImage.src` **must be an absolute external http(s) URL.** There is **no upload
> tool** — the agent cannot upload files.

**Worked example:**

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Risk premia" }] },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Markets reward " },
        { "type": "text", "text": "patience", "marks": [{ "type": "bold" }] },
        { "type": "text", "text": ". See " },
        { "type": "text", "text": "the source", "marks": [{ "type": "link", "attrs": { "href": "https://example.com/paper" } }] },
        { "type": "text", "text": "." }
      ]
    },
    {
      "type": "callout",
      "attrs": { "tone": "warn", "icon": "Callout" },
      "content": [{ "type": "text", "text": "Past performance does not guarantee future results." }]
    },
    {
      "type": "quote",
      "attrs": { "cite": "Benjamin Graham" },
      "content": [{ "type": "text", "text": "The investor’s chief problem is himself." }]
    }
  ]
}
```

**Recommended flow (pages):** `get_page` → edit the returned doc → `validate_content` → `update_page`.
**Recommended flow (articles):** `get_article` → edit the returned doc → `validate_content` → `update_article`.

## 7. Known residuals (v1)

- **`callout.icon` name validity is unchecked.** `validate_content` validates node/mark types,
  the content model, dropped content, and enum attrs (`tone` / `variant` / `align`), but the
  icon registry lives in `apps/web`, so an unknown icon name (e.g. `"FakeIcon"`) is **not**
  flagged — it persists and the web reader falls back to a default icon.
- The round-trip drop-diff is heuristic: it catches dropped/added node & mark *types*, not a
  normalization that reorders or merges same-type content. Always `get_page` / `get_article` to
  read the canonical persisted form.
