#!/usr/bin/env python3
"""
extract.py — PDF → clean text + structure, via docling with forced full-page OCR.

Why forced OCR: some PDFs embed subsetted fonts with a *scrambled* glyph→unicode
map, so the page renders correctly but the extractable text layer is garbage
(e.g. "financial" copies out as "bnancial"). Forcing full-page OCR reads the
rendered glyphs instead, sidestepping the broken text layer entirely. docling's
layout model still gives us heading levels, reading order, and page-header/footer
labels (so running heads + page numbers can be dropped).

Outputs (into --out-dir):
  extract.md     human-readable markdown (for eyeballing quality)
  items.json     flat list of {page, label, level, text} — the structural signal
                 used downstream to split chapters/sections and classify blocks.

Usage:
  python extract.py --pdf book.pdf --pages 3-176 --out-dir out
  python extract.py --pdf book.pdf            # whole document
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    OcrMacOptions,
    EasyOcrOptions,
    RapidOcrOptions,
    TesseractCliOcrOptions,
    AcceleratorOptions,
    AcceleratorDevice,
)


def build_ocr_options(engine: str):
    """All engines forced to whole-page OCR so the embedded text layer is ignored."""
    if engine == "ocrmac":
        return OcrMacOptions(force_full_page_ocr=True)
    if engine == "easyocr":
        return EasyOcrOptions(force_full_page_ocr=True)
    if engine == "rapidocr":
        return RapidOcrOptions(force_full_page_ocr=True)
    if engine == "tesseract":
        return TesseractCliOcrOptions(force_full_page_ocr=True)
    raise SystemExit(f"unknown --engine {engine!r}")


def parse_pages(spec: str | None) -> tuple[int, int] | None:
    if not spec:
        return None
    if "-" in spec:
        a, b = spec.split("-", 1)
        return (int(a), int(b))
    n = int(spec)
    return (n, n)


def page_no(item) -> int | None:
    prov = getattr(item, "prov", None)
    if prov:
        return getattr(prov[0], "page_no", None)
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", required=True, type=Path, help="source PDF path")
    ap.add_argument("--pages", help="1-based inclusive range, e.g. 3-176 (default: all)")
    ap.add_argument("--out-dir", type=Path, default=Path("out"), help="output directory")
    ap.add_argument("--engine", default="ocrmac",
                    choices=["ocrmac", "easyocr", "rapidocr", "tesseract"],
                    help="OCR engine (default: ocrmac — Apple Vision)")
    ap.add_argument("--device", default="cpu", choices=["cpu", "mps", "cuda", "auto"],
                    help="torch device for the layout model. Default cpu: docling's "
                         "layout model trips on float64 under Apple MPS, so cpu is the "
                         "safe choice on macOS.")
    args = ap.parse_args()

    if not args.pdf.exists():
        raise SystemExit(f"PDF not found: {args.pdf}")
    args.out_dir.mkdir(parents=True, exist_ok=True)

    opts = PdfPipelineOptions()
    opts.do_ocr = True
    opts.ocr_options = build_ocr_options(args.engine)
    opts.accelerator_options = AcceleratorOptions(device=AcceleratorDevice(args.device))
    opts.do_table_structure = False          # text-only book; skip table model for speed
    opts.generate_page_images = False
    opts.generate_picture_images = False

    converter = DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)}
    )

    page_range = parse_pages(args.pages)
    print(f"[extract] {args.pdf.name} engine={args.engine} "
          f"pages={page_range or 'all'} …", file=sys.stderr)
    t0 = time.time()
    convert_kwargs = {}
    if page_range:
        convert_kwargs["page_range"] = page_range
    result = converter.convert(str(args.pdf), **convert_kwargs)
    doc = result.document
    dt = time.time() - t0
    print(f"[extract] done in {dt:.1f}s", file=sys.stderr)

    # 1) Markdown for human inspection.
    md = doc.export_to_markdown()
    (args.out_dir / "extract.md").write_text(md, encoding="utf-8")

    # 2) Flat structural items — the real downstream signal.
    items = []
    for it in getattr(doc, "texts", []):
        items.append({
            "page": page_no(it),
            "label": str(getattr(it, "label", "")),
            "level": getattr(it, "level", None),
            "text": (getattr(it, "text", "") or "").strip(),
        })
    (args.out_dir / "items.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    labels = {}
    for it in items:
        labels[it["label"]] = labels.get(it["label"], 0) + 1
    print(f"[extract] {len(items)} text items → {args.out_dir}/items.json", file=sys.stderr)
    print(f"[extract] label histogram: {labels}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
