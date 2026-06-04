# StockMaster

A block-based editor for writing **books** and **articles** — a Notion-style writing
surface with a library manager, a contextual **Book → Chapters → Pages** tree, and a
rich block editor whose JSON document is the silent source of truth.

Recreated from the Claude Design "Book editor UI" handoff. See
[`docs/plans/2026-05-30-stockmaster-design.md`](docs/plans/2026-05-30-stockmaster-design.md)
for the full design and the design-block → Tiptap-node mapping, and
[`docs/plans/2026-05-30-stack-decisions.md`](docs/plans/2026-05-30-stack-decisions.md)
for pinned versions and integration gotchas.

## Stack

| Layer | Tech |
| --- | --- |
| Monorepo | pnpm workspaces + **Turborepo** |
| Frontend | React 18 · Vite · **TanStack Router** (file-based) · **TanStack Query** · React Hook Form + Zod · **Tiptap v3** |
| Backend | **NestJS** · **Prisma 6** · **PostgreSQL** · `nestjs-zod` |
| Auth | Email/password · JWT (access token + httpOnly refresh cookie) · bcryptjs |
| Storage | **S3** presigned PUT (AWS SDK v3) — MinIO in dev, AWS S3 in prod |
| Shared | `@stockmaster/shared` — Zod schemas used by the API, the query layer, and forms |

The workspace is a **shared editorial space**: multiple users, no roles, everyone sees and
edits every work.

## Layout

```
apps/
  api/        NestJS + Prisma API
  web/        Vite + React + Tiptap SPA
packages/
  shared/     Zod schemas + shared types (single source of truth for the wire)
docker-compose.yml   Postgres + MinIO
```

## Prerequisites

- Node ≥ 20 (tested on 24)
- pnpm 10
- Docker (for Postgres + MinIO)

## Getting started

```bash
# 1. install
pnpm install

# 2. env — defaults work out of the box for local dev
cp .env.example .env

# 3. start Postgres + MinIO (creates a public-read `stockmaster` bucket)
pnpm infra:up

# 4. database: run migrations + seed demo content
pnpm db:migrate      # applies prisma migrations
pnpm db:seed         # seeds the demo user + The Outermost House, etc.

# 5. run both apps (Turborepo)
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3001

**Demo login:** `sienna@stockmaster.io` / `password123` (local dev only — created by `pnpm db:seed`)

> **Server / production:** seeding is **not** run automatically (the compose `app-init` step
> applies migrations only), so the demo user never lands on a server. Create the first real
> account with `pnpm db:create-user` — it prompts for email / name / password, so it needs an
> interactive terminal. In Docker, allocate a TTY:
> ```bash
> docker compose run -it --rm app-init pnpm -C apps/api create-user
> ```
> (Run without `-it`, it refuses with a clear error rather than doing nothing.) There is no
> public self-signup — further accounts are added from the in-app Authors view.

> Note: Postgres is mapped to host port **5433** (to avoid clashing with a local
> Postgres on 5432). MinIO console is at http://localhost:9001 (`minioadmin` / `minioadmin`).

## Scripts (root)

| Command | What |
| --- | --- |
| `pnpm dev` | Run web + api in watch mode (Turborepo) |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm infra:up` / `infra:down` | Start / stop Postgres + MinIO |
| `pnpm infra:reset` | Stop and wipe volumes |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Prisma migrate / seed / studio |
| `pnpm db:create-user` | Create one account interactively (prompts for email / name / password, hidden) — used to bootstrap the first user on a server, where the demo seed is **not** run |

## Features

- **Library** — card grid of books & articles with status, page/word counts, and
  All / Books / Articles / Drafts tabs. Create new books and articles.
- **Editor** — one Tiptap document per page. Block types: heading (H1–H3), paragraph,
  bulleted/numbered list, quote (+ citation), callout (tone + icon), image (upload to S3),
  divider (line/dots), table.
- **Interactions** — `/` slash menu, drag handle to reorder, `+` to insert, a B/I/U/link
  bubble toolbar on selection.
- **Right panel** — per-block settings (selection-driven) and page meta with live
  word/block/reading-time stats.
- **Persistence** — debounced autosave, explicit Save-as-draft / Publish, optimistic tree edits.
- **Appearance** — accent color, light/dark, body font (sans/serif), editor width.

## Production storage (AWS S3)

In production, drop `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` and provide real AWS
credentials + region. Remember to attach a bucket **CORS** config (`PUT`/`GET` from your
web origin) and a public-read policy (or serve via CloudFront) — MinIO handles this
automatically in dev but AWS does not. See the stack-decisions doc.
