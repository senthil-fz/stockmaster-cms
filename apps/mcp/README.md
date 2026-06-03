# @blockpress/mcp — draft-only MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent
**create and edit Blockpress books and articles — but only ever as drafts.** It runs as a
long-lived service speaking MCP over the **Streamable HTTP** transport (`POST /mcp`), and calls
the existing Blockpress REST API using a **scoped, draft-only API key**. The key carries
`works:write` only, so the agent is *physically unable* to publish or delete content: those
operations return **403** at the API, regardless of what the client tries.

There is intentionally **no publish, status, or delete tool** in this server, and the
`update_*` tools deliberately omit the `status` field. The 403 is the backstop; the missing
tools are the primary UX.

---

## 1. Configure the environment

Copy `.env.example` and fill in the two variables (see [.env.example](./.env.example)):

| Variable             | Meaning                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `BLOCKPRESS_API_URL` | Base URL of the running NestJS API. `http://localhost:3001` on the host; `http://api:3001` from inside the docker network. |
| `BLOCKPRESS_API_KEY` | The raw draft-only key (shown once at mint time). Begins with `bp_`. |
| `MCP_HTTP_PORT`      | Port the Streamable HTTP server listens on (default `3002`).        |
| `MCP_ALLOWED_HOSTS`  | *(optional, production)* comma-separated allowlist of `Host` headers; setting it enables DNS-rebinding protection, e.g. `mcp.example.com`. |

The server sends `Authorization: ApiKey <BLOCKPRESS_API_KEY>` on **every** request. It never
touches Postgres directly — all validation, serializers, word-count, and read-tracking run in
the API.

## 2. Mint a draft-only API key

A key is owned by a real Blockpress user; drafts the agent creates are authored by that user.
Two ways to mint one:

**Web UI (recommended).** Sign in to the Blockpress web app → **API Keys** → **Create key**.
Give it a name (e.g. `MCP draft agent`), keep the default scope `works:write`, optionally set
an expiry. The raw key is shown **exactly once** — copy it immediately into `BLOCKPRESS_API_KEY`.
It is never shown again (only its sha256 hash is stored).

**curl.** `/api-keys` is **JWT-only** (an ApiKey can never mint another key), so authenticate
with a user **Bearer** token:

```bash
curl -X POST http://localhost:3001/api-keys \
  -H 'Authorization: Bearer <your-jwt-access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"MCP draft agent","scopes":["works:write"]}'
# → { ..., "prefix":"bp_1a2b3", "rawKey":"bp_<64-hex>" }   ← copy rawKey ONCE
```

Scopes are a fixed enum: `works:write` (create + edit drafts — what you want),
`works:publish`, `works:delete`. A draft-only key uses **only** `works:write`.
To revoke: `DELETE /api-keys/:id` (or the **Revoke** button) — the key then 401s immediately.

## 3. Run it

**Docker (recommended)** — runs as the `mcp` service alongside the API/web stack. Set
`BLOCKPRESS_MCP_KEY` in the repo-root `.env` to your draft-only key, then:

```bash
pnpm docker:up                        # docker compose --profile apps up -d --build
curl http://localhost:3002/health     # { "ok": true, "transport": "streamable-http", ... }
```

The compose `mcp` service reaches the API over the internal docker network (`api:3001`) and
reads `BLOCKPRESS_MCP_KEY` from `.env`. The endpoint is then `http://localhost:3002/mcp`.

**Standalone (no docker):**

```bash
pnpm --filter @blockpress/editor-schema build   # apps/mcp consumes its dist
pnpm --filter @blockpress/mcp build             # tsc → dist/
MCP_HTTP_PORT=3002 \
BLOCKPRESS_API_URL=http://localhost:3001 \
BLOCKPRESS_API_KEY=bp_your-draft-only-key \
node dist/server.js
```

## 4. Connect a client

The server is reachable by **URL** — no per-session process spawn. Point any MCP client at the
Streamable HTTP endpoint `http://localhost:3002/mcp`.

**Claude Code:**

```bash
claude mcp add --transport http blockpress-draft http://localhost:3002/mcp
claude mcp list                       # verify it's connected
# in a session, /mcp lists the tools
```

**`.mcp.json` / `claude_desktop_config.json` (URL form):**

```json
{
  "mcpServers": {
    "blockpress-draft": { "type": "http", "url": "http://localhost:3002/mcp" }
  }
}
```

> The server uses **stateful** Streamable HTTP — it mints an `Mcp-Session-Id` on `initialize`
> and clients carry it automatically. `POST /mcp` is the protocol endpoint; `GET /health` is a
> liveness check; logs go to stderr.

### Deploying behind a domain

In production, run the container and front it with a TLS reverse proxy:

```
https://mcp.example.com  →  reverse proxy (nginx/Caddy/Traefik, TLS)  →  mcp container :3002
```

Clients then use `https://mcp.example.com/mcp`
(`claude mcp add --transport http blockpress https://mcp.example.com/mcp`).

**Secure it first.** This endpoint carries one API key, so anyone who can reach the URL can use
it. Before exposing it publicly:

- Put **auth in front of it** — a bearer token your proxy validates (clients pass it via a
  header; Claude Code: `--header "Authorization: Bearer <token>"`), or OAuth.
- Set `MCP_ALLOWED_HOSTS=mcp.example.com` to enable **DNS-rebinding (Host header) protection**.
- Serve over **HTTPS only**.

## 5. Tools

| Tool                | REST mapping            | Notes                                                              |
| ------------------- | ----------------------- | ------------------------------------------------------------------ |
| `list_works`        | `GET /works`            | Filters `kind` / `status` are **read-only filtering**, not publishing. |
| `get_work`          | `GET /works/:id`        | Full chapter/page tree — where chapter ids + page ids come from.   |
| `create_work`       | `POST /works`           | Always a DRAFT. Returns a summary **without** the tree → call `get_work` next for chapter ids. |
| `update_work`       | `PATCH /works/:id`      | Metadata only. **No `status` field** — cannot publish.            |
| `add_chapter`       | `POST /works/:id/chapters` | Returns the chapter with its id.                               |
| `update_chapter`    | `PATCH /chapters/:id`   | Title / order.                                                    |
| `get_page`          | `GET /pages/:id`        | Returns the **stored content** — read-modify-write base.          |
| `add_page`          | `POST /chapters/:id/pages` | Returns the page with id + a blank starter doc.               |
| `update_page`       | `PATCH /pages/:id`      | Title / `content` (Tiptap doc) / order. **No `status` field.**    |
| `validate_content`  | local (no API call)     | Validates a doc against the real ProseMirror schema before saving. |

There is intentionally **NO publish/status/delete tool** in v1. `validate_content` **IS**
included — it is local-only and never mutates anything.

## 6. Page content vocabulary

`update_page` content is a Tiptap (ProseMirror) JSON document. The editor's StarterKit has
`blockquote` and `codeBlock` **disabled** and adds four custom nodes plus the table family, so
the supported set is:

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

**Recommended flow:** `get_page` → edit the returned doc → `validate_content` → `update_page`.

## 7. Known residuals (v1)

- **`callout.icon` name validity is unchecked.** `validate_content` validates node/mark types,
  the content model, dropped content, and enum attrs (`tone` / `variant` / `align`), but the
  icon registry lives in `apps/web`, so an unknown icon name (e.g. `"FakeIcon"`) is **not**
  flagged — it persists and the web reader falls back to a default icon.
- The round-trip drop-diff is heuristic: it catches dropped/added node & mark *types*, not a
  normalization that reorders or merges same-type content. Always `get_page` to read the
  canonical persisted form.
