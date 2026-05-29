/* eslint-disable no-console */
import { PrismaClient, Prisma } from '@prisma/client';
import { countWordsInDoc, type TiptapDoc, type TiptapNode } from '@blockpress/shared';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Tiptap node builders (mirror the prototype's block factories) ──────────────
const text = (s: string): TiptapNode[] => (s ? [{ type: 'text', text: s }] : []);
const h = (level: number, t: string): TiptapNode => ({ type: 'heading', attrs: { level }, content: text(t) });
const p = (t = ''): TiptapNode => ({ type: 'paragraph', content: text(t) });
const li = (t: string): TiptapNode => ({ type: 'listItem', content: [p(t)] });
const bullet = (items: string[]): TiptapNode => ({ type: 'bulletList', content: items.map(li) });
const numbered = (items: string[]): TiptapNode => ({ type: 'orderedList', content: items.map(li) });
const quote = (t: string, cite = ''): TiptapNode => ({ type: 'quote', attrs: { cite }, content: text(t) });
const callout = (tone: string, icon: string, t: string): TiptapNode => ({
  type: 'callout',
  attrs: { tone, icon },
  content: text(t),
});
const image = (src: string, caption: string, align = 'full'): TiptapNode => ({
  type: 'captionedImage',
  attrs: { src, caption, align, label: 'photograph' },
});
const divider = (variant = 'line'): TiptapNode => ({ type: 'divider', attrs: { variant } });
const cell = (t: string, header = false): TiptapNode => ({
  type: header ? 'tableHeader' : 'tableCell',
  content: [p(t)],
});
const table = (rows: string[][], hasHeader = true): TiptapNode => ({
  type: 'table',
  content: rows.map((row, ri) => ({
    type: 'tableRow',
    content: row.map((c) => cell(c, hasHeader && ri === 0)),
  })),
});
const doc = (...nodes: TiptapNode[]): TiptapDoc => ({ type: 'doc', content: nodes });

interface SeedPage {
  title: string;
  status: 'draft' | 'published';
  content: TiptapDoc;
}
interface SeedChapter {
  title: string;
  pages: SeedPage[];
}
interface SeedWork {
  kind: 'book' | 'article';
  title: string;
  subtitle: string;
  author: string;
  year: string;
  coverTone: string;
  status: 'draft' | 'published';
  tags: string[];
  chapters: SeedChapter[];
}

// ─── Content (ported from the design's data.jsx) ────────────────────────────────
const works: SeedWork[] = [
  {
    kind: 'book',
    title: 'The Outermost House',
    subtitle: 'A Year of Life on the Great Beach of Cape Cod',
    author: 'Henry Beston',
    year: '1928',
    coverTone: 'sand',
    status: 'draft',
    tags: ['Nature', 'Memoir', 'Non-fiction'],
    chapters: [
      {
        title: 'Part I — The Beach',
        pages: [
          {
            title: 'Orientation',
            status: 'published',
            content: doc(
              p('East and ahead of the coast of North America, some thirty miles and more from the inner shores of Massachusetts, there stands in the open Atlantic the last fragment of an ancient and vanished land.'),
              p('For twenty thousand years the sea and the sand have disputed this fantastic headland, and so they will dispute it till the end of time. It is a place of wind and tide, of the breaking wave and the long sand-bar.'),
              callout('neutral', 'Pin', "This page sets the scene for the year ahead. Keep it short — it is the reader's first breath of salt air."),
              h(3, 'The shape of the land'),
              p('The seaward side of the Cape is one immense beach, running unbroken from the elbow at Chatham to the wrist at Provincetown, a single curve of forty miles.'),
              divider('line'),
              quote('A year indoors is a journey along a paper calendar; a year in outer nature is the accomplishment of a tremendous ritual.', 'Henry Beston, 1928'),
            ),
          },
          {
            title: 'The Year at High Tide',
            status: 'draft',
            content: doc(
              p('My house stood by itself atop a dune, a little less than halfway south on Eastham bar. I had a chimney and a fireplace built, and put up a wind-vane on the roof.'),
              bullet([
                'Two rooms and a wide southern window facing the sea',
                'A fireplace of beach stone, gathered at low water',
                'Twenty windows in all — the house was a lantern of glass',
              ]),
              image('', "The Fo'castle, looking south along the great beach", 'full'),
              p("I called the house the Fo'castle. It was a snug little place, and from its windows I could watch the whole theater of the surf."),
            ),
          },
          {
            title: 'Autumn, Ocean, and Birds',
            status: 'published',
            content: doc(
              p('My special interest is rather the instant and synchronous obedience of each speeding body to the new volition. By what means, by what methods of communication does this will so suffuse the living constellation that its dozen or more tiny brains know it and obey it in such an instancy of time?'),
              p('We need another and a wiser and perhaps a more mystical concept of animals. Remote from universal nature, and living by complicated artifice, man in civilization surveys the creature through the glass of his knowledge and sees thereby a feather magnified and the whole image in distortion.'),
              quote('In a world older and more complete than ours they move finished and complete, gifted with extensions of the senses we have lost or never attained, living by voices we shall never hear.', 'On the migration of shore birds'),
              p('They are not brethren, they are not underlings; they are other nations, caught with ourselves in the net of life and time, fellow prisoners of the splendour and travail of the earth.'),
            ),
          },
        ],
      },
      {
        title: 'Part II — Winter',
        pages: [
          {
            title: 'Winter Visitors',
            status: 'draft',
            content: doc(
              p("With the coming of December the great cold settled along the beach, and the sea took on the iron colour of the year's last light."),
              table([
                ['Month', 'Mean temp.', 'Notable arrivals'],
                ['December', '34°F', 'Snow bunting, dovekie'],
                ['January', '29°F', 'Northern gannet'],
                ['February', '31°F', 'Ice on the marsh creeks'],
              ]),
              p('The dunes wore their snow as a kind of pelt, and the wind off the water was a knife.'),
            ),
          },
          {
            title: 'Midwinter',
            status: 'draft',
            content: doc(
              p('Draft of the midwinter chapter. The nights here are immense and the stars are without number.'),
            ),
          },
        ],
      },
    ],
  },
  {
    kind: 'book',
    title: 'Herbs and the Earth',
    subtitle: 'Reflections from a New England garden',
    author: 'Henry Beston',
    year: '1935',
    coverTone: 'sage',
    status: 'draft',
    tags: ['Gardening', 'Essays'],
    chapters: [
      {
        title: 'The Garden',
        pages: [
          {
            title: 'A Word at the Beginning',
            status: 'draft',
            content: doc(
              p('Outline. To be written: the philosophy of herbs, the dignity of the kitchen garden, and the long human companionship of growing things.'),
              callout('warn', 'Callout', 'Draft outline only — needs the opening essay and at least two plates.'),
            ),
          },
        ],
      },
    ],
  },
  {
    kind: 'article',
    title: 'On Keeping a Weather Journal',
    subtitle: '',
    author: 'Editorial',
    year: '2026',
    coverTone: 'default',
    status: 'published',
    tags: ['Craft', 'Field notes'],
    chapters: [
      {
        title: 'Article',
        pages: [
          {
            title: 'On Keeping a Weather Journal',
            status: 'published',
            content: doc(
              p('A daily record of wind and sky is the simplest of instruments and the most demanding. It asks only attention, and attention is the rarest thing we have to give.'),
              h(3, 'What to record'),
              numbered([
                'Wind direction and a rough sense of its force',
                'The quality of the light at dawn and at dusk',
                'Any single thing you would otherwise forget',
              ]),
              divider('dots'),
              p('Do this for a year and you will have written, almost without noticing, a book.'),
            ),
          },
        ],
      },
    ],
  },
  {
    kind: 'article',
    title: 'Field Notes: The Spring Marsh',
    subtitle: '',
    author: 'Editorial',
    year: '2026',
    coverTone: 'default',
    status: 'draft',
    tags: ['Field notes'],
    chapters: [
      {
        title: 'Article',
        pages: [{ title: 'Field Notes: The Spring Marsh', status: 'draft', content: doc(p('')) }],
      },
    ],
  },
];

async function main(): Promise<void> {
  console.log('Seeding Blockpress…');

  // Demo user (shared workspace — one is enough). Password: password123
  const passwordHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'sienna@blockpress.io' },
    update: {},
    create: {
      email: 'sienna@blockpress.io',
      name: 'Sienna Hewitt',
      passwordHash,
      avatarColor: '#7d8b6a',
    },
  });
  console.log(`  user: ${user.email} (password: password123)`);

  // Wipe existing works so re-seeding is idempotent.
  await prisma.work.deleteMany({});

  for (const w of works) {
    const created = await prisma.work.create({
      data: {
        kind: w.kind,
        title: w.title,
        subtitle: w.subtitle,
        author: w.author,
        year: w.year,
        coverTone: w.coverTone,
        status: w.status,
        tags: w.tags,
        createdById: user.id,
        chapters: {
          create: w.chapters.map((ch, ci) => ({
            title: ch.title,
            order: ci,
            pages: {
              create: ch.pages.map((pg, pi) => ({
                title: pg.title,
                status: pg.status,
                order: pi,
                content: pg.content as unknown as Prisma.InputJsonValue,
                wordCount: countWordsInDoc(pg.content),
              })),
            },
          })),
        },
      },
    });
    console.log(`  work: ${created.title} (${created.kind})`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
