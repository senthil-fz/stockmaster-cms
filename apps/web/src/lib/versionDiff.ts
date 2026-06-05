import { diffWords } from 'diff';
import type { ArticleSnapshot, BookSnapshot, TiptapDoc, TiptapNode } from '@stockmaster/shared';

/**
 * Client-side version diffing for the version viewer.
 *
 * Snapshots are self-contained TipTap JSON, so "what changed" is computed entirely in the
 * browser between any two version snapshots — no API/diff backend. This is a TEXT-level diff:
 * we flatten each page's rich content to plain text (block-per-line) and run a word diff.
 * Formatting-only changes (bold, links, image swaps) therefore read as unchanged text — a
 * deliberate trade-off for a simple, robust "what words changed" view. Structural changes
 * (added / removed / reordered pages) are detected by the stable, snapshot-preserved page id.
 */

/** Flatten a TipTap doc to plain text — one line per block node, text nodes concatenated. */
export function docToText(doc: TiptapDoc | null | undefined): string {
  if (!doc) return '';
  const lines: string[] = [];
  const walkBlock = (node: TiptapNode): void => {
    // A node carrying inline text children → emit one line; otherwise recurse into blocks.
    const text = collectInline(node).trim();
    if (text) lines.push(text);
    else if (node.content) for (const child of node.content) walkBlock(child);
  };
  const collectInline = (node: TiptapNode): string => {
    if (typeof node.text === 'string') return node.text;
    if (!node.content) return '';
    // Only collect inline runs (text/hardBreak); a nested block returns '' here and is
    // instead recursed into by walkBlock, so each block becomes its own line.
    return node.content.every((c) => c.type === 'text' || c.type === 'hardBreak')
      ? node.content.map(collectInline).join('')
      : '';
  };
  for (const node of doc.content ?? []) walkBlock(node);
  return lines.join('\n');
}

export interface DiffSeg {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/** Word-level diff of two plain-text blobs → ordered segments (added / removed / unchanged). */
export function textDiff(before: string, after: string): DiffSeg[] {
  return diffWords(before, after).map((p) => ({
    value: p.value,
    added: p.added,
    removed: p.removed,
  }));
}

export type PageChange = 'added' | 'removed' | 'changed' | 'unchanged';

export interface PageDiff {
  id: string;
  /** Display label, e.g. "Chapter One · Introduction". */
  label: string;
  change: PageChange;
  titleChanged: boolean;
  /** Word segments — present for added / removed / changed pages. */
  segments: DiffSeg[];
}

export interface BookDiff {
  pages: PageDiff[];
  reordered: boolean;
  changedCount: number;
}

interface FlatPage {
  id: string;
  label: string;
  title: string;
  text: string;
}

function flattenBook(snap: BookSnapshot | null): FlatPage[] {
  if (!snap) return [];
  return snap.chapters.flatMap((c) =>
    c.pages.map((p) => ({
      id: p.id,
      label: `${c.title || 'Untitled chapter'} · ${p.title || 'Untitled page'}`,
      title: p.title,
      text: docToText(p.content),
    })),
  );
}

/**
 * Diff two book snapshots page-by-page, matched on the stable page id. `before` may be null
 * (the first version — everything reads as added). Pages are returned in the NEW reading
 * order, with removed pages appended at the end.
 */
export function diffBookSnapshots(before: BookSnapshot | null, after: BookSnapshot): BookDiff {
  const oldPages = flattenBook(before);
  const newPages = flattenBook(after);
  const oldById = new Map(oldPages.map((p) => [p.id, p]));
  const newIds = new Set(newPages.map((p) => p.id));

  const pages: PageDiff[] = [];
  let changedCount = 0;

  for (const np of newPages) {
    const op = oldById.get(np.id);
    if (!op) {
      pages.push({ id: np.id, label: np.label, change: 'added', titleChanged: false, segments: textDiff('', np.text) });
      changedCount += 1;
      continue;
    }
    const titleChanged = op.title !== np.title;
    if (op.text === np.text) {
      pages.push({ id: np.id, label: np.label, change: titleChanged ? 'changed' : 'unchanged', titleChanged, segments: [] });
      if (titleChanged) changedCount += 1;
    } else {
      pages.push({ id: np.id, label: np.label, change: 'changed', titleChanged, segments: textDiff(op.text, np.text) });
      changedCount += 1;
    }
  }

  for (const op of oldPages) {
    if (!newIds.has(op.id)) {
      pages.push({ id: op.id, label: op.label, change: 'removed', titleChanged: false, segments: textDiff(op.text, '') });
      changedCount += 1;
    }
  }

  // Reorder = the common pages appear in a different relative order between versions.
  const commonOld = oldPages.filter((p) => newIds.has(p.id)).map((p) => p.id);
  const commonNew = newPages.filter((p) => oldById.has(p.id)).map((p) => p.id);
  const reordered = commonOld.join(',') !== commonNew.join(',');

  return { pages, reordered, changedCount };
}

/** Diff two article snapshots (single doc) → word segments. */
export function diffArticleSnapshots(before: ArticleSnapshot | null, after: ArticleSnapshot): DiffSeg[] {
  return textDiff(docToText(before?.content), docToText(after.content));
}
