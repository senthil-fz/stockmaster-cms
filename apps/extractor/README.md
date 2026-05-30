# @blockpress/extractor

A reusable pipeline for turning a source **document (PDF)** into a Blockpress
**Work → Chapter → Page** tree in the database.

```
PDF ─▶ extract.py ─▶ items.json ─▶ structure.py ─▶ chapters/ ─▶ (agents + audit) ─▶ <name>.sections.json ─┐
  │    (docling OCR)   (text)        (split by ch)   (per-ch)      (audited SECTION IR, master)            ├▶ rebucket.py ─▶ <name>.json ─▶ ingest.ts
  └─▶ render PNGs ─▶ pageocr.py ─▶ pageocr/page-N.txt ─────────────────────────────────────────────────────┘  (split at TRUE   (page seed)     (→ Postgres)
                     (Apple Vision per-page image OCR = the true page boundaries)                                page boundary)
```

**Page model.** For an *imported* book we don't trust an agent's guess at where a
"section" begins or ends — the faithful unit is the **printed page**: page 1 → page 1,
page 2 → page 2. `rebucket.py` recasts the audited section IR into one DB Page per
printed page, keeping the **chapter as the grouping** (a "meta" parent shown in nav) and
naming each page by a plain sequential number. Authoring *new* content digitally can
still use any section structure; this faithfulness rule is for importing an existing book.

**Why splitting matters — and why we OCR each page image.** The book breaks many
paragraphs mid-sentence across a page boundary. You might expect docling's per-item
`page` tag to tell us where — but it is **unreliable**: for a cross-page paragraph docling
sometimes splits it correctly and sometimes absorbs the *whole* paragraph (including the
half printed on the next page) into one page's item. So we don't trust those tags for
boundaries. Instead `pageocr.py` OCRs **each rendered page image independently** (Apple
Vision) — the image is the only ground truth for what's physically on a page. `rebucket.py`
word-aligns the audited text onto those per-page OCRs and **splits every block at the real
page boundary**: a mid-sentence paragraph becomes two paragraphs on two pages; a list
continued onto the next page keeps its numbering (`start`). It ends with a **same-page
assertion** — every word on an output page must appear in that page's own image OCR, or
the run fails (exit 1). So a straddle can't silently survive: fidelity is verified against
the page images, not hoped for. (On this book the image-truth pass found **81** cross-page
paragraphs; docling's tags had only revealed 3.)

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

# Structure items.json → per-chapter cleaned items (chapter split, drop running heads)
#   (see python/structure.py)  → out/full/chapters/chapter-NN.json + manifest.json

# (per-chapter agent structuring + page-by-page OCR audit) → audited SECTION IR master:
#   books/<name>.sections.json

# OCR every rendered page image independently (Apple Vision) = the true page boundaries.
# (render page-N.png first, e.g. `pdftoppm -png -r 150 book.pdf out/full/audit/full/page`)
uv run --with ocrmac --python 3.13 python/pageocr.py \
  --images out/full/audit/full --out out/full/pageocr --pages 5-176

# Recast the section master into one page per PRINTED page, splitting straddles at the
# real (image-OCR) boundary; asserts every page's words appear in its own page image.
python python/rebucket.py \
  --book books/a-common-mans-voyage-in-the-stock-market.sections.json \
  --chapters-dir out/full/chapters --pageocr-dir out/full/pageocr \
  --out out/full/book.pages.json
cp out/full/book.pages.json books/a-common-mans-voyage-in-the-stock-market.json   # the page seed

# Seed a committed book into the DB as Work → Chapters → Pages (idempotent by title)
pnpm --filter @blockpress/extractor ingest -- books/a-common-mans-voyage-in-the-stock-market.json
```

`out/` and `python/.venv/` are git-ignored — the venv and the intermediate
artifacts (`items.json`, per-chapter files, rendered pages) are regenerated,
not committed.

## Committed seed data: `books/`

`books/<book-name>.json` holds the **final, page-faithful IR** for a fully imported
document — the exact content that seeded the DB, one section per printed page. These
are committed so the import is reproducible without re-running OCR + the
(non-deterministic) agent structuring pass:

```bash
pnpm --filter @blockpress/extractor ingest -- books/a-common-mans-voyage-in-the-stock-market.json
```

- `books/a-common-mans-voyage-in-the-stock-market.json` — the **page seed** that ingest
  uses: 11 chapters, **170 pages** (one per printed page), ~43k words.
- `books/a-common-mans-voyage-in-the-stock-market.sections.json` — the **audited section
  master**: 11 chapters, 70 sections, audited page-by-page against the source images
  (99.9%+) with all OCR/formatting issues corrected. This is the human-reviewed source of
  record and the input to `rebucket.py`; the page seed is mechanically derived from it
  (and re-verified against the page images, including a same-page assertion).

## The IR (`book.json`)

`src/ir.ts` defines the app-agnostic intermediate representation (Zod-validated):
a `work` plus `chapters[].sections[].blocks[]`, where a block is one of
`paragraph | heading | bulletList | orderedList | quote | callout | divider`.
A `section` maps 1:1 to a DB `Page`; in the page-faithful model produced by
`rebucket.py` each section is one **printed page** (its `title` is the sequential
page number, and the page's printed heading/sub-headings appear as `heading` blocks).
`src/convert.ts` maps those blocks to the exact Tiptap node shapes the editor
expects (custom `quote`/`callout`/`divider`, **not** StarterKit `blockquote`).
