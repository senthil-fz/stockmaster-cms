/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

  // No demo library content is seeded. Real works are loaded separately via the
  // extractor ingest pipeline (see apps/extractor), and are intentionally left
  // untouched here so re-seeding never wipes ingested books.

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
