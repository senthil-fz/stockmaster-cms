# @blockpress/mcp — draft-only MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent
**create and edit Blockpress books and articles — but only ever as drafts.** It calls the
existing Blockpress REST API over stdio-launched HTTP using a **scoped, draft-only API key**.
The key carries `works:write` only, so the agent is *physically unable* to publish or delete
content: those operations return **403** at the API, regardless of what the client tries.

There is intentionally **no publish, status, or delete tool** in this server, and the
`update_*` tools deliberately omit the `status` field. The 403 is the backstop; the missing
tools are the primary UX.

---

## 1. Configure the environment

Copy `.env.example` and fill in the two variables (see [.env.example](./.env.example)):

| Variable             | Meaning                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `BLOCKPRESS_API_URL` | Base URL of the running NestJS API, e.g. `http://localhost:3001`.   |
| `BLOCKPRESS_API_KEY` | The raw draft-only key (shown once at mint time). Begins with `bp_`. |

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

## 3. Build and run

```bash
pnpm --filter @blockpress/editor-schema build   # build the schema package first (apps/mcp consumes its dist)
pnpm --filter @blockpress/mcp build             # tsc → dist/server.js (with #!/usr/bin/env node shebang)
```

For local development (loads the repo-root `.env`):

```bash
pnpm --filter @blockpress/mcp dev               # dotenv -e ../../.env -- ts-node src/server.ts
```

## 4. Register with an agent host (stdio)

The server speaks MCP over **stdio**. Add it to your agent host's MCP config.

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "blockpress-draft": {
      "command": "node",
      "args": ["/absolute/path/to/blockpress/apps/mcp/dist/server.js"],
      "env": {
        "BLOCKPRESS_API_URL": "http://localhost:3001",
        "BLOCKPRESS_API_KEY": "bp_your-raw-draft-only-key"
      }
    }
  }
}
```

**Claude Code** — Claude Code reads the **same `mcpServers` shape** from a project-level
`.mcp.json` (in your repo root). Use the identical snippet, env block included:

```json
{
  "mcpServers": {
    "blockpress-draft": {
      "command": "node",
      "args": ["/absolute/path/to/blockpress/apps/mcp/dist/server.js"],
      "env": {
        "BLOCKPRESS_API_URL": "http://localhost:3001",
        "BLOCKPRESS_API_KEY": "bp_your-raw-draft-only-key"
      }
    }
  }
}
```

To run from source instead of the built `dist/server.js`, point `command`/`args` at the dev
script — `"command": "pnpm", "args": ["--filter", "@blockpress/mcp", "dev"]` — which loads the
repo-root `.env` for the two variables (so the `env` block above can be omitted).

> stdout is the transport — the server logs **only to stderr**. Do not pipe anything into
> stdout when launching it.

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
