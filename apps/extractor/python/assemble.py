#!/usr/bin/env python3
"""
assemble.py — combine per-chapter structured files into a single book.json (the IR),
with a deterministic word-coverage check against the source chapter items.

  <out>/structured/chapter-NN.json  +  <out>/manifest.json  ->  <out>/book.json

The coverage check is a faithfulness backstop independent of the agent verifiers:
each chapter's output word count should be ~equal to its source word count (the only
legal edits are paragraph joins, list-marker stripping, and page-number removal).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def words_in_blocks(blocks: list[dict]) -> int:
    n = 0
    for b in blocks:
        if b.get("type") in ("paragraph", "heading", "quote", "callout"):
            n += len((b.get("text") or "").split())
        elif b.get("type") in ("bulletList", "orderedList"):
            for it in b.get("items", []):
                n += len((it or "").split())
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True, help="dir with manifest.json, chapters/, structured/")
    args = ap.parse_args()

    manifest = json.loads((args.out / "manifest.json").read_text(encoding="utf-8"))
    work = manifest["work"]

    chapters = []
    print(f"{'ch':>3} {'source':>7} {'output':>7} {'cover':>6}  sections  title")
    flagged = []
    for cm in manifest["chapters"]:
        idx = cm["index"]
        struct = json.loads((args.out / "structured" / f"chapter-{idx:02d}.json").read_text(encoding="utf-8"))
        source = json.loads((args.out / "chapters" / f"chapter-{idx:02d}.json").read_text(encoding="utf-8"))

        src_words = sum(len((it["text"] or "").split()) for it in source["items"])
        out_words = sum(words_in_blocks(s.get("blocks", [])) for s in struct["sections"])
        cover = (out_words / src_words) if src_words else 1.0
        flag = "" if 0.90 <= cover <= 1.10 else "  <-- CHECK"
        if flag:
            flagged.append(idx)
        print(f"{idx:>3} {src_words:>7} {out_words:>7} {cover:>6.2f}  {len(struct['sections']):>8}  {struct['title'][:40]}{flag}")

        chapters.append({"title": struct["title"], "sections": struct["sections"]})

    book = {"work": work, "chapters": chapters}
    (args.out / "book.json").write_text(json.dumps(book, ensure_ascii=False, indent=2), encoding="utf-8")

    total_sections = sum(len(c["sections"]) for c in chapters)
    print(f"\n✓ book.json: {len(chapters)} chapters, {total_sections} pages -> {args.out / 'book.json'}")
    if flagged:
        print(f"⚠ coverage outside 0.90–1.10 for chapters: {flagged}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
