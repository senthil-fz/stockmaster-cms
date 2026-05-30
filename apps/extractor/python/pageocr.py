#!/usr/bin/env python3
"""
pageocr.py — OCR each rendered page image *independently* (Apple Vision) to get the
GROUND-TRUTH text of each printed page.

Why this exists: docling tags every extracted text fragment with a single `page`, but for
a paragraph that the book breaks across a page boundary docling is unreliable — sometimes
it splits the fragment correctly, sometimes it absorbs the whole paragraph (including the
part printed on the next page) into one page's item. The page IMAGE is the only truth, so
`rebucket.py` uses these per-page OCR files (not docling's tags) to place each word on the
page it is physically printed on, and to assert that fidelity.

Run with uv (no managed venv needed — ocrmac is tiny):
  uv run --with ocrmac --python 3.13 python/pageocr.py \
    --images out/full/audit/full --out out/full/pageocr --pages 5-176
"""
from __future__ import annotations

import argparse
from pathlib import Path

from ocrmac import ocrmac


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", type=Path, required=True, help="dir containing page-N.png")
    ap.add_argument("--out", type=Path, required=True, help="output dir for page-N.txt")
    ap.add_argument("--pages", required=True, help="inclusive PDF page range, e.g. 5-176")
    args = ap.parse_args()

    lo, hi = (int(x) for x in args.pages.split("-"))
    args.out.mkdir(parents=True, exist_ok=True)

    done = blank = 0
    for pg in range(lo, hi + 1):
        img = args.images / f"page-{pg}.png"
        if not img.exists():
            blank += 1
            continue
        # Apple Vision, accurate level; returns (text, confidence, bbox) ~in reading order.
        res = ocrmac.OCR(str(img), language_preference=["en-US"]).recognize()
        text = " ".join(t for t, _, _ in res)
        (args.out / f"page-{pg}.txt").write_text(text, encoding="utf-8")
        done += 1
        print(f"  page {pg}: {len(text.split())} words")

    print(f"\n✓ OCR'd {done} pages -> {args.out}  ({blank} pages had no image — blanks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
