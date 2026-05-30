# @blockpress/extractor

A reusable pipeline for turning a source **document (PDF)** into a Blockpress
**Work → Chapter → Page** tree in the database.

```
PDF ──▶ extract.py ──▶ items.json ──▶ structure.py ──▶ book.json ──▶ ingest.ts ──▶ Postgres
        (docling OCR)    (clean text     (chapter /        (IR)        (Tiptap +
                          + labels)       section split)               Prisma)
```

## Why OCR (and why forced full-page)

Some PDFs embed subsetted fonts with a **scrambled glyph→unicode map**: the page
renders correctly, but the extractable text layer is garbage (`financial` copies
out as `bnancial`). We bypass that entirely by forcing **full-page OCR** on the
rendered glyphs (`force_full_page_ocr=True`). docling's layout model still gives
us heading levels, reading order, and `page_header`/`page_footer` labels so we can
drop running heads and page numbers.

On macOS the default engine is **Apple Vision** (`ocrmac`) — native, fast, no model
downloads, excellent quality. The layout model runs on **CPU** (`--device cpu`)
because docling's layout post-processing trips on float64 under Apple MPS.

## Setup

```bash
# 1. Python env (docling + ocrmac). Requires `uv`.
pnpm --filter @blockpress/extractor setup:py

# 2. TS deps + Prisma client are installed with the workspace (`pnpm install`).
```

## Usage

```bash
# Extract → out/<name>/{extract.md, items.json}
pnpm --filter @blockpress/extractor extract -- \
  --pdf "/path/to/book.pdf" --pages 3-176 --out-dir out/full

# Structure items.json → book.json (chapter/section split, cleanup)
#   (see python/structure.py)

# Seed book.json into the DB as Work → Chapters → Pages (idempotent by title)
pnpm --filter @blockpress/extractor ingest -- out/full/book.json
```

`out/` and `python/.venv/` are git-ignored — artifacts and the venv are
regenerated, not committed.

## The IR (`book.json`)

`src/ir.ts` defines the app-agnostic intermediate representation (Zod-validated):
a `work` plus `chapters[].sections[].blocks[]`, where a block is one of
`paragraph | heading | bulletList | orderedList | quote | callout | divider`.
`src/convert.ts` maps those blocks to the exact Tiptap node shapes the editor
expects (custom `quote`/`callout`/`divider`, **not** StarterKit `blockquote`).
