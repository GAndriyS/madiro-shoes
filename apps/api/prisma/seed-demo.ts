import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Demo dataset for the REAL database (sellers + variants + pairs + operations).
 * Purpose: de-risk the mock→real transition — once the scanner and real stock/
 * intake/overview endpoints land, they read representative data instead of an
 * empty DB, and this exercises the Prisma write paths today. The admin account
 * is left untouched. Never runs against production.
 *
 *   pnpm --filter @madiro/api db:seed:demo
 */
const prisma = new PrismaClient();

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function upsertSeller(name: string, login: string, password: string): Promise<string> {
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.upsert({
    where: { login },
    update: { name, deletedAt: null },
    create: { name, login, passwordHash, role: 'SELLER' },
  });
  return user.id;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:seed:demo is not allowed in production.');
  }

  // Fresh inventory each run (demo-only), keep users/admin.
  await prisma.operation.deleteMany();
  await prisma.pair.deleteMany();
  await prisma.variant.deleteMany();

  const olia = await upsertSeller('Оля', 'olia', 'olia-2026');
  const iryna = await upsertSeller('Ірина', 'iryna', 'iryna-2026');
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', deletedAt: null } });
  const actor = admin?.id ?? olia;

  const variants = [
    { style: '7645', color: '36', material: 'LEATHER', season: 'SHEEPSKIN', price: 1400 },
    { style: '8102', color: '01', material: 'LEATHER', season: 'NONE', price: 1800 },
    { style: '6310', color: '05', material: 'SUEDE', season: 'NONE', price: 2500 },
    { style: '5211', color: '44', material: 'SUEDE', season: 'BAIKA', price: null }, // awaiting price
    { style: '9031', color: '14', material: 'LEATHER', season: 'SHEEPSKIN', price: 2100 },
  ] as const;

  for (const v of variants) {
    const variant = await prisma.variant.create({
      data: {
        style: v.style,
        color: v.color,
        material: v.material,
        season: v.season,
        purchasePrice: v.price,
      },
    });

    // Two pairs per variant; the priceless variant's pairs are seller drafts.
    const draft = v.price == null;
    for (const size of [37, 39]) {
      const pair = await prisma.pair.create({
        data: {
          variantId: variant.id,
          size,
          status: 'IN_STOCK',
          awaitingPrice: draft,
          intakeDate: daysAgo(20),
          createdById: draft ? olia : actor,
        },
      });
      await prisma.operation.create({
        data: {
          type: 'INTAKE',
          pairId: pair.id,
          userId: draft ? olia : actor,
          purchasePriceAtTime: v.price,
          createdAt: daysAgo(20),
        },
      });
    }
  }

  // A couple of sales so the overview/analytics have movement.
  const firstPair = await prisma.pair.findFirst({ where: { awaitingPrice: false } });
  if (firstPair) {
    await prisma.operation.create({
      data: {
        type: 'SALE',
        pairId: firstPair.id,
        userId: iryna,
        salePrice: 2850,
        paymentMethod: 'CARD',
        createdAt: daysAgo(1),
      },
    });
    await prisma.pair.update({ where: { id: firstPair.id }, data: { status: 'SOLD' } });
  }

  console.log('Demo dataset seeded: 2 sellers, 5 variants, 10 pairs, intake + a sale.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
