/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { countWordsInDoc } from '@blockpress/shared';
import { bookSchema } from './ir';
import { blocksToDoc } from './convert';

/**
 * Seed a book.json (the extractor IR) into the database as Work → Chapters → Pages.
 *
 * Idempotent: any existing Work with the same title is deleted first, so re-running
 * after a re-extraction produces a clean result. `createdBy` is attributed to the
 * first app user (shared workspace — it's display-only and never gates access).
 *
 *   pnpm --filter @blockpress/extractor ingest -- out/book.json
 */
const prisma = new PrismaClient();

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

  await prisma.work.deleteMany({ where: { title: book.work.title } });

  const work = await prisma.work.create({
    data: {
      kind: book.work.kind,
      title: book.work.title,
      subtitle: book.work.subtitle,
      author: book.work.author,
      year: book.work.year,
      coverTone: book.work.coverTone,
      status: book.work.status,
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

  const chapters = work.chapters.length;
  const pages = work.chapters.reduce((n, c) => n + c.pages.length, 0);
  const words = work.chapters.reduce((n, c) => n + c.pages.reduce((m, p) => m + p.wordCount, 0), 0);
  console.log(`✓ Imported "${work.title}" — ${chapters} chapters, ${pages} pages, ${words.toLocaleString()} words`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
