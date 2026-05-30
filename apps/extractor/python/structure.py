#!/usr/bin/env python3
"""
structure.py — split a flat items.json (from extract.py) into per-chapter files.

This is the *deterministic, faithful* half of structuring: it only splits the
book into chapters (using known chapter titles as anchors) and drops obvious
noise (running heads, page numbers). It does NOT decide section boundaries —
that judgement (real sections vs. sub-headings vs. pull-quotes) is left to the
per-chapter agent pass, which sees each chapter's cleaned items.

Output:
  <out>/chapters/chapter-01.json … chapter-NN.json   {index, title, items:[...]}
  <out>/manifest.json                                {work, chapters:[{index,title,...}]}

The chapter anchors + work metadata below are the config for THIS book; swap them
to reuse the pipeline for another document.
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
from pathlib import Path

# ── Config for this book ────────────────────────────────────────────────────────
WORK = {
    "kind": "book",
    "title": "A Common Man's Voyage in the Stock Market",
    "subtitle": "",
    "author": "Nagaraj Balasubramaniam",
    "year": "2024",
    "tags": ["Investing", "Finance", "Stock Market", "Personal Finance"],
    "coverTone": "default",
    "status": "published",
}
CHAPTER_ANCHORS = [
    "A Novice's First Steps",
    "The Market Warfare",
    "Common Sense in Uncommon Markets",
    "Mistakes as Choices",
    "Simplicity: A Pathway to Success",
    "The Power of Patience in Investing",
    "Navigating Economic Storms",
    "The Art of Stock Selection",
    "Balancing Act: Risk and Reward",
    "Harnessing Technology for Financial Success",
    "Conclusion Of the Book",
]
# Section headers we never want as content (book back-matter we're skipping).
DROP_HEADERS = {"fullpage image", "contents"}
# ────────────────────────────────────────────────────────────────────────────────


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", "".join(c.lower() for c in s if c.isalnum() or c == " ")).strip()


def is_noise(it: dict) -> bool:
    label = it["label"]
    text = (it["text"] or "").strip()
    if label in ("page_header", "page_footer"):
        return True
    if not text:
        return True
    # Pure page numbers / tiny numeric fragments that leak into the body.
    if re.fullmatch(r"[0-9ivxlcdm]{1,4}", text.strip(), flags=re.IGNORECASE):
        return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--items", type=Path, required=True, help="items.json from extract.py")
    ap.add_argument("--out", type=Path, required=True, help="output dir (chapters/ + manifest.json)")
    args = ap.parse_args()

    items = json.loads(args.items.read_text(encoding="utf-8"))
    anchors_norm = [norm(a) for a in CHAPTER_ANCHORS]

    # Locate each chapter anchor in sequence (first section_header that fuzzy-matches
    # the next expected anchor, scanning forward only — avoids TOC / out-of-order hits).
    boundaries: list[tuple[int, str]] = []  # (item index, chapter title)
    ai = 0
    for idx, it in enumerate(items):
        if ai >= len(anchors_norm):
            break
        if it["label"] != "section_header":
            continue
        if difflib.SequenceMatcher(None, norm(it["text"]), anchors_norm[ai]).ratio() > 0.9:
            boundaries.append((idx, CHAPTER_ANCHORS[ai]))
            ai += 1
    if len(boundaries) != len(CHAPTER_ANCHORS):
        found = [t for _, t in boundaries]
        missing = [c for c in CHAPTER_ANCHORS if c not in found]
        raise SystemExit(f"! only matched {len(boundaries)}/{len(CHAPTER_ANCHORS)} chapters; missing: {missing}")

    chapters_dir = args.out / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)

    manifest_chapters = []
    for n, (start, title) in enumerate(boundaries):
        end = boundaries[n + 1][0] if n + 1 < len(boundaries) else len(items)
        body = items[start + 1 : end]  # skip the anchor header itself; it's the chapter title
        cleaned = []
        for it in body:
            if is_noise(it):
                continue
            if it["label"] == "section_header" and norm(it["text"]) in DROP_HEADERS:
                continue
            cleaned.append({"label": it["label"], "text": it["text"].strip(), "page": it["page"]})

        words = sum(len(c["text"].split()) for c in cleaned)
        chapter = {"index": n + 1, "title": title, "items": cleaned}
        path = chapters_dir / f"chapter-{n + 1:02d}.json"
        path.write_text(json.dumps(chapter, ensure_ascii=False, indent=2), encoding="utf-8")
        hdrs = sum(1 for c in cleaned if c["label"] == "section_header")
        manifest_chapters.append({"index": n + 1, "title": title, "items": len(cleaned),
                                  "headers": hdrs, "words": words, "file": path.name})
        print(f"  ch{n + 1:>2} | {title[:42]:42} | items={len(cleaned):>3} headers={hdrs:>2} words={words:>5}")

    (args.out / "manifest.json").write_text(
        json.dumps({"work": WORK, "chapters": manifest_chapters}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    total_words = sum(c["words"] for c in manifest_chapters)
    print(f"\n✓ {len(manifest_chapters)} chapters → {chapters_dir}  (total ~{total_words:,} words)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
