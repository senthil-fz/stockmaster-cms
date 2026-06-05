/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { countWordsInDoc } from '@stockmaster/shared';
import { bookSchema, type Block } from './ir';
import { blocksToDoc } from './convert';

/**
 * Seed a book.json (the extractor IR) into the database.
 *
 * Books become a Book → Chapters → Pages tree. Articles (IR `kind: 'article'`)
 * are single-page content: every chapter's section blocks are flattened into ONE
 * TipTap doc and written to a standalone Article row.
 *
 * Idempotent: any existing Book/Article with the same title is deleted first, so
 * re-running after a re-extraction produces a clean result. `createdBy` is attributed
 * to the first app user (shared workspace — it's display-only and never gates access).
 *
 *   pnpm --filter @stockmaster/extractor ingest -- out/book.json
 */
const prisma = new PrismaClient();

/**
 * URL-friendly slug matching @stockmaster/shared `slugSchema`
 * (`^[a-z0-9]+(?:-[a-z0-9]+)*$`): lowercase, non-alphanumerics → `-`, collapsed,
 * truncated (~80 chars) then trimmed of stray hyphens. Frozen on create.
 */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/^-|-$/g, '');
  return slug || 'untitled';
}

async function main(): Promise<void> {
  // Tolerate a stray `--` separator forwarded by pnpm/dotenv.
  const file = process.argv.slice(2).find((a) => a !== '--') ?? process.env.BOOK_JSON;
  if (!file) throw new Error('usage: ingest <path/to/book.json>');

  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const book = bookSchema.parse(raw);

  const creator = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!creator) {
    console.warn('! No users found — importing with createdBy=null. Run the API seed first if you want an author.');
  }

  if (book.work.kind === 'article') {
    // Articles are single-page: flatten every chapter's section blocks into one doc.
    const blocks: Block[] = book.chapters.flatMap((ch) => ch.sections.flatMap((s) => s.blocks));
    const content = blocksToDoc(blocks);
    const wordCount = countWordsInDoc(content);

    await prisma.article.deleteMany({ where: { title: book.work.title } });

    const article = await prisma.article.create({
      data: {
        slug: slugify(book.work.title),
        title: book.work.title,
        subtitle: book.work.subtitle,
        author: book.work.author,
        year: book.work.year,
        coverTone: book.work.coverTone,
        tags: book.work.tags,
        content: content as unknown as Prisma.InputJsonValue,
        wordCount,
        createdById: creator?.id ?? null,
      },
    });

    console.log(`✓ Imported article "${article.title}" — ${wordCount.toLocaleString()} words`);
    return;
  }

  await prisma.book.deleteMany({ where: { title: book.work.title } });

  const created = await prisma.book.create({
    data: {
      title: book.work.title,
      subtitle: book.work.subtitle,
      author: book.work.author,
      year: book.work.year,
      coverTone: book.work.coverTone,
      tags: book.work.tags,
      createdById: creator?.id ?? null,
      chapters: {
        create: book.chapters.map((ch, ci) => ({
          title: ch.title,
          order: ci,
          pages: {
            create: ch.sections.map((s, si) => {
              const content = blocksToDoc(s.blocks);
              return {
                title: s.title,
                status: s.status,
                order: si,
                content: content as unknown as Prisma.InputJsonValue,
                wordCount: countWordsInDoc(content),
              };
            }),
          },
        })),
      },
    },
    include: { chapters: { include: { pages: true } } },
  });

  const chapters = created.chapters.length;
  const pages = created.chapters.reduce((n, c) => n + c.pages.length, 0);
  const words = created.chapters.reduce((n, c) => n + c.pages.reduce((m, p) => m + p.wordCount, 0), 0);
  console.log(`✓ Imported "${created.title}" — ${chapters} chapters, ${pages} pages, ${words.toLocaleString()} words`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
