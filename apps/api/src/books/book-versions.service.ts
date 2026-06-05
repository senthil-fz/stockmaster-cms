import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SNAPSHOT_SCHEMA_VERSION, type VersionSummary } from '@stockmaster/shared';
import { PrismaService } from '../prisma/prisma.service';
import { buildBookSnapshot } from '../common/versioning/snapshot';
import { toBookSummary } from './serializers';

// Include shape carrying the scalars a book summary derives (publishedVersionId, draftDirty)
// plus each page's wordCount. Mirrors books.service's summaryInclude.
const summaryInclude = {
  chapters: { include: { pages: { select: { id: true, wordCount: true } } } },
} satisfies Prisma.BookInclude;

// Full live tree for snapshotting — every chapter/page scalar buildBookSnapshot reads.
const treeInclude = {
  chapters: {
    orderBy: { order: 'asc' },
    include: { pages: { orderBy: { order: 'asc' } } },
  },
} satisfies Prisma.BookInclude;

// Row shape returned by the version metadata select (history list — no full snapshot).
interface VersionRow {
  id: string;
  versionNumber: number;
  schemaVersion: number;
  wordCount: number;
  pageCount: number;
  note: string | null;
  createdById: string | null;
  createdAt: Date;
}

/**
 * Publish / unpublish / version-history / restore for books — the published-version /
 * working-draft split. The live Book→Chapter→Page tree stays the editable draft;
 * publishing freezes an immutable {@link buildBookSnapshot} into a BookVersion and points
 * Book.publishedVersionId at it. `publishedVersionId != null` is the sole source of truth
 * for public visibility.
 */
@Injectable()
export class BookVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Snapshot the current draft → new immutable version (next versionNumber) → repoint
   * the published pointer → clear the dirty flag, all in one transaction (atomic swap).
   */
  async publish(bookId: string, note: string | undefined, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const book = await tx.book.findUnique({ where: { id: bookId }, include: treeInclude });
      if (!book) throw new NotFoundException('Book not found');

      const snapshot = buildBookSnapshot(book);
      let pageCount = 0;
      let wordCount = 0;
      for (const ch of snapshot.chapters) {
        for (const pg of ch.pages) {
          pageCount += 1;
          wordCount += pg.wordCount;
        }
      }

      // Next monotonic version number (max + 1; starts at 1).
      const agg = await tx.bookVersion.aggregate({
        where: { bookId },
        _max: { versionNumber: true },
      });
      const versionNumber = (agg._max.versionNumber ?? 0) + 1;

      const version = await tx.bookVersion.create({
        data: {
          bookId,
          versionNumber,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          wordCount,
          pageCount,
          note: note ?? null,
          createdById: userId,
        },
      });

      const updated = await tx.book.update({
        where: { id: bookId },
        data: { publishedVersionId: version.id, draftDirty: false },
        include: summaryInclude,
      });
      return toBookSummary(updated);
    });
  }

  /** Pull the book from the public by clearing the published pointer. */
  async unpublish(bookId: string) {
    await this.ensureBook(bookId);
    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: { publishedVersionId: null },
      include: summaryInclude,
    });
    return toBookSummary(updated);
  }

  /** Version history — metadata only, newest first; no full snapshot blobs. */
  async list(bookId: string): Promise<VersionSummary[]> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { publishedVersionId: true },
    });
    if (!book) throw new NotFoundException('Book not found');
    const versions = await this.prisma.bookVersion.findMany({
      where: { bookId },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        schemaVersion: true,
        wordCount: true,
        pageCount: true,
        note: true,
        createdById: true,
        createdAt: true,
      },
    });
    return versions.map((v) => this.toVersionSummary(v, book.publishedVersionId));
  }

  /** One version's full snapshot (preview / diff). */
  async get(bookId: string, versionId: string) {
    const version = await this.prisma.bookVersion.findUnique({ where: { id: versionId } });
    if (!version || version.bookId !== bookId) throw new NotFoundException('Version not found');
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { publishedVersionId: true },
    });
    return {
      ...this.toVersionSummary(version, book?.publishedVersionId ?? null),
      snapshot: version.snapshot,
    };
  }

  /**
   * Rollback (MVP) — repoint the published pointer to an existing older version. The
   * public reverts atomically; the working draft is left untouched. Overwriting the
   * draft tree from a snapshot is out of scope for v1.
   *
   * `draftDirty` is set true: after restoring an older version the live draft tree
   * (left as-is) diverges from what is now published, so "unpublished changes" holds.
   */
  async restore(bookId: string, versionId: string) {
    const version = await this.prisma.bookVersion.findUnique({
      where: { id: versionId },
      select: { id: true, bookId: true },
    });
    if (!version || version.bookId !== bookId) throw new NotFoundException('Version not found');
    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: { publishedVersionId: version.id, draftDirty: true },
      include: summaryInclude,
    });
    return toBookSummary(updated);
  }

  private toVersionSummary(v: VersionRow, publishedVersionId: string | null): VersionSummary {
    return {
      id: v.id,
      versionNumber: v.versionNumber,
      schemaVersion: v.schemaVersion,
      wordCount: v.wordCount,
      pageCount: v.pageCount,
      note: v.note,
      createdById: v.createdById,
      createdAt: v.createdAt.toISOString(),
      isPublished: v.id === publishedVersionId,
    };
  }

  private async ensureBook(id: string) {
    const exists = await this.prisma.book.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Book not found');
  }
}
