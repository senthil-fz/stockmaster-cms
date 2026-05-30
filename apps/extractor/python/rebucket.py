#!/usr/bin/env python3
"""
rebucket.py — re-cast an audited, section-based book IR into one page per PRINTED PAGE.

Why: the agent "section" split is a judgement call (where does a section begin/end?)
we don't want to trust for an imported book. The faithful unit is the printed page:
page 1 -> page 1, page 2 -> page 2. Chapters stay the grouping (a "meta" parent, shown
in nav), but a page's name is just its sequential number, never a section title.

The subtle part: the agent structuring pass sometimes MERGES a paragraph (or list) that
the book actually breaks across a page boundary. docling never does this — every source
item carries exactly one `page`. So we word-align the (possibly merged) audited blocks
back onto the page-tagged source items and **split any block at the page boundary**, so
the text physically printed on page N lands on page N and the remainder on page N+1.
A list the book continues onto the next page keeps its numbering via `start`.

Correct-by-construction: after splitting, every word on an output page comes from that
same printed page's source items. We ASSERT this (same-page coverage) at the end, so a
future straddle can never silently leak — it fails the build instead.

Input:
  books/<name>.json                   audited IR (chapters[].sections[].blocks[]) — has the manual fixes
  out/full/chapters/chapter-NN.json   the SOURCE items per chapter, each {label,text,page}
Output:
  out/full/book.pages.json            IR with chapters[].sections[] = one section PER PRINTED PAGE,
                                      title = global sequential page number ("1".."N").
  out/full/book.pages.map.json        sidecar {seq -> source PDF page} for verification only.
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
from collections import Counter
from pathlib import Path


def norm_word(w: str) -> str:
    return "".join(c.lower() for c in w if c.isalnum())


def block_words(b: dict) -> list[str]:
    if b["type"] in ("paragraph", "heading", "quote", "callout"):
        return (b.get("text") or "").split()
    if b["type"] in ("bulletList", "orderedList"):
        out: list[str] = []
        for it in b.get("items", []):
            out.extend((it or "").split())
        return out
    return []  # divider etc.


def flatten_chapter(ch: dict) -> list[dict]:
    """Audited chapter -> ordered blocks. Every section title becomes a leading heading
    block: section 0's title is the chapter title (printed as a display heading on the
    chapter's first page) and the rest are real printed sub-headings. These titles are
    genuine printed text, so re-emitting them keeps each page faithful to the book."""
    blocks: list[dict] = []
    for sec in ch["sections"]:
        title = (sec.get("title") or "").strip()
        if title:
            blocks.append({"type": "heading", "level": 2, "text": title})
        blocks.extend(sec["blocks"])
    return blocks


def fill_and_clamp(pages: list[int | None]) -> list[int] | None:
    """One block's per-word pages -> carry-forward fill (then back-fill leading None),
    then clamp non-decreasing (text reads top-to-bottom across a page break). Returns
    None if the block had no aligned word at all (resolved later from neighbours)."""
    if not pages or all(p is None for p in pages):
        return None
    out: list[int | None] = list(pages)
    last: int | None = None
    for i, p in enumerate(out):
        if p is None:
            out[i] = last
        else:
            last = p
    nxt: int | None = None
    for i in range(len(out) - 1, -1, -1):
        if out[i] is None:
            out[i] = nxt
        else:
            nxt = out[i]
    run = out[0]
    for i in range(len(out)):
        run = max(run, out[i])  # type: ignore[arg-type]
        out[i] = run
    return out  # type: ignore[return-value]


def split_block(b: dict, wpages: list[int] | None) -> list[tuple[int | None, dict]]:
    """Split one block into (page, subblock) segments at page boundaries."""
    typ = b["type"]
    if wpages is None:  # divider, or fully-unaligned block (e.g. chapter-title heading)
        return [(None, b)]

    if typ in ("paragraph", "heading", "quote", "callout"):
        words = (b.get("text") or "").split()
        segs: list[tuple[int | None, dict]] = []
        i = 0
        while i < len(words):
            pg = wpages[i]
            j = i
            while j < len(words) and wpages[j] == pg:
                j += 1
            sub = dict(b)
            sub["text"] = " ".join(words[i:j])
            segs.append((pg, sub))
            i = j
        return segs or [(None, b)]

    if typ in ("bulletList", "orderedList"):
        items = b.get("items", [])
        # page per item = its first word's page
        item_pages: list[int | None] = []
        off = 0
        for it in items:
            n = len((it or "").split())
            item_pages.append(wpages[off] if n and off < len(wpages) else None)
            off += n
        item_pages = fill_and_clamp(item_pages) or [None] * len(items)  # type: ignore[list-item]
        segs = []
        base = int(b.get("start", 1))
        i = 0
        no = base
        while i < len(items):
            pg = item_pages[i]
            j = i
            while j < len(items) and item_pages[j] == pg:
                j += 1
            sub: dict = {"type": typ, "items": items[i:j]}
            if typ == "orderedList" and no != 1:
                sub["start"] = no
            segs.append((pg, sub))
            no += j - i
            i = j
        return segs

    return [(wpages[0] if wpages else None, b)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--book", type=Path, required=True, help="audited section-based IR (input)")
    ap.add_argument("--chapters-dir", type=Path, required=True, help="out/full/chapters with chapter-NN.json")
    ap.add_argument("--out", type=Path, required=True, help="output book.pages.json")
    ap.add_argument(
        "--pageocr-dir",
        type=Path,
        default=None,
        help="dir of per-page OCR text (page-N.txt from pageocr.py). When given, the page "
        "of each word is taken from these IMAGE OCRs (authoritative) instead of docling's "
        "per-item page tags, which are unreliable for paragraphs that span a page break.",
    )
    args = ap.parse_args()

    def _is_num(w: str) -> bool:
        return bool(re.fullmatch(r"\d{1,4}", w))

    def _is_caps(w: str) -> bool:
        # an all-caps token (running header), allowing apostrophes/punctuation: e.g. "MAN'S".
        return any(c.isalpha() for c in w) and all(not c.isalpha() or c.isupper() for c in w)

    def strip_running_header(tokens: list[str]) -> list[str]:
        """Drop the page's running header from the top of the OCR token stream: an optional
        page number, then the title typeset in ALL CAPS (>=2 caps words), then an optional
        page number. We require the >=2-caps run so a chapter-opening page's *mixed-case*
        display title (e.g. "A Novice's First Steps") is kept — only the caps running head is
        removed. This stops a header like "...IN THE STOCK MARKET" from being a false match
        target for a paragraph that genuinely ends "...stock market." on the previous page."""
        n = len(tokens)
        i = 1 if n and _is_num(tokens[0]) else 0
        j = i
        while j < n and _is_caps(tokens[j]):
            j += 1
        if j - i >= 2:
            k = j + 1 if j < n and _is_num(tokens[j]) else j
            return tokens[k:]
        return tokens

    def page_text_words(pg: int) -> list[str] | None:
        if not args.pageocr_dir:
            return None
        f = args.pageocr_dir / f"page-{pg}.txt"
        return strip_running_header(f.read_text(encoding="utf-8").split()) if f.exists() else []

    book = json.loads(args.book.read_text(encoding="utf-8"))

    out_chapters: list[dict] = []
    page_map: list[dict] = []
    page_seq = 0
    total_blocks = 0
    split_blocks = 0
    unaligned = 0
    # per output page: (pdf page, words) — for the same-page assertion at the end
    page_words: dict[int, tuple[int, list[str]]] = {}

    print(f"{'ch':>2} {'pages':>5} {'blocks':>6}  title")
    for ci, ch in enumerate(book["chapters"]):
        src = json.loads((args.chapters_dir / f"chapter-{ci + 1:02d}.json").read_text(encoding="utf-8"))
        src_words: list[str] = []
        src_pages: list[int] = []
        chap_pages = sorted({it["page"] for it in src["items"]})
        if args.pageocr_dir and chap_pages:
            # authoritative: word -> page from the page IMAGE OCR, over this chapter's page span
            for pg in range(chap_pages[0], chap_pages[-1] + 1):
                for w in page_text_words(pg) or []:
                    src_words.append(norm_word(w))
                    src_pages.append(pg)
        else:
            for it in src["items"]:
                for w in (it["text"] or "").split():
                    src_words.append(norm_word(w))
                    src_pages.append(it["page"])

        blocks = flatten_chapter(ch)
        out_words: list[str] = []
        ranges: list[tuple[int, int]] = []
        for b in blocks:
            start = len(out_words)
            out_words.extend(norm_word(w) for w in block_words(b))
            ranges.append((start, len(out_words)))

        word_page: list[int | None] = [None] * len(out_words)
        sm = difflib.SequenceMatcher(None, out_words, src_words, autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                for k in range(i2 - i1):
                    word_page[i1 + k] = src_pages[j1 + k]

        # split every block at page boundaries -> ordered (page, subblock) segments
        segments: list[tuple[int | None, dict]] = []
        for b, (s, e) in zip(blocks, ranges):
            wp = fill_and_clamp(word_page[s:e])
            aligned = [p for p in word_page[s:e] if p is not None]
            if e > s and not aligned:
                unaligned += 1
            segs = split_block(b, wp)
            if len(segs) > 1:
                split_blocks += 1
            segments.extend(segs)

        # resolve None pages from neighbours, then clamp non-decreasing
        raw = [p for p, _ in segments]
        last = None
        for i in range(len(raw)):
            if raw[i] is None:
                raw[i] = last
            else:
                last = raw[i]
        nxt = None
        for i in range(len(raw) - 1, -1, -1):
            if raw[i] is None:
                raw[i] = nxt
            else:
                nxt = raw[i]
        run = -1
        pages: list[int] = []
        for p in raw:
            p = p if p is not None else run
            run = max(run, p)
            pages.append(run)
        subs = [sb for _, sb in segments]

        # group consecutive segments by printed page
        sections: list[dict] = []
        i = 0
        n = len(subs)
        while i < n:
            pg = pages[i]
            j = i
            grp: list[dict] = []
            while j < n and pages[j] == pg:
                grp.append(subs[j])
                j += 1
            if grp:
                page_seq += 1
                sections.append({"title": str(page_seq), "status": "published", "blocks": grp})
                page_map.append({"seq": page_seq, "pdfPage": pg, "chapter": ch["title"]})
                page_words[page_seq] = (pg, [norm_word(w) for b in grp for w in block_words(b)])
                total_blocks += len(grp)
            i = j

        out_chapters.append({"title": ch["title"], "sections": sections})
        print(f"{ci + 1:>2} {len(sections):>5} {sum(len(s['blocks']) for s in sections):>6}  {ch['title'][:46]}")

    out = {"work": book["work"], "chapters": out_chapters}
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    args.out.with_suffix(".map.json").write_text(json.dumps(page_map, ensure_ascii=False, indent=2), encoding="utf-8")

    # ── conservation + same-page assertion ──────────────────────────────────────
    def wc(blocks: list[dict]) -> int:
        return sum(len(block_words(b)) for b in blocks)

    in_words = sum(wc(s["blocks"]) for c in book["chapters"] for s in c["sections"]) + sum(
        len(s["title"].split()) for c in book["chapters"] for s in c["sections"] if (s.get("title") or "").strip()
    )
    out_words_total = sum(wc(s["blocks"]) for c in out_chapters for s in c["sections"])

    # source words per pdf page, for the assertion. Prefer the page IMAGE OCR (authoritative);
    # fall back to docling items (page tags) if no pageocr dir was given.
    src_by_page: dict[int, Counter] = {}
    if args.pageocr_dir:
        for pg in {mp["pdfPage"] for mp in page_map}:
            src_by_page[pg] = Counter(norm_word(w) for w in (page_text_words(pg) or []))
    else:
        items_path = args.chapters_dir.parent / "items.json"
        if items_path.exists():
            for it in json.loads(items_path.read_text(encoding="utf-8")):
                t = (it.get("text") or "").strip()
                if it["label"] in ("page_header", "page_footer") or not t:
                    continue
                if re.fullmatch(r"[0-9ivxlcdm]{1,4}", t, re.IGNORECASE):
                    continue
                src_by_page.setdefault(it["page"], Counter()).update(norm_word(w) for w in t.split())

    leaks = []
    for seq, (pg, words) in page_words.items():
        if not words:
            continue
        bag = Counter(w for w in words if w)
        avail = src_by_page.get(pg, Counter())
        same = sum(min(c, avail[w]) for w, c in bag.items()) / sum(bag.values())
        if same < 0.92:  # this page shows words NOT printed on this page -> a straddle leaked
            leaks.append((seq, pg, round(same, 3)))

    print(
        f"\n✓ {page_seq} pages across {len(out_chapters)} chapters -> {args.out}"
        f"\n  words: in {in_words}  out {out_words_total}  (Δ {out_words_total - in_words})"
        f"\n  blocks out: {total_blocks}   page-boundary splits: {split_blocks}   unaligned (neighbour-filled): {unaligned}"
    )
    if out_words_total != in_words:
        print("  ⚠ word count changed — investigate")
    if leaks:
        print(f"  ⚠ SAME-PAGE ASSERTION FAILED for {len(leaks)} page(s) (content not on its own printed page):")
        for seq, pg, same in leaks[:20]:
            print(f"      seq {seq} (pdf {pg}) same-page coverage {same}")
        return 1
    print(f"  ✓ same-page assertion passed: every page's words come from its own printed page ({len(page_words)} pages)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
