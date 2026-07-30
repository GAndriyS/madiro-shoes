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
 *
 * The dataset is DETERMINISTIC by contract — docs/manual-test-plan.md asserts
 * exact figures against it. Every pair states who created it and the sold pair
 * is named outright (SOLD_SIZE) instead of falling out of a `findFirst`, so a
 * test never has to discover which size left the shelf. Keep it that way when
 * editing: any change here is a change to the plan's expected numbers.
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

  /** The one pair that leaves the shelf, named so tests need not discover it. */
  const SOLD = { style: '7645', size: 37, price: 2850, payment: 'CARD' } as const;
  const SIZES = [37, 39] as const;

  const variants = [
    { style: '7645', color: '36', material: 'LEATHER', season: 'SHEEPSKIN', price: 1400 },
    { style: '8102', color: '01', material: 'LEATHER', season: 'NONE', price: 1800 },
    { style: '6310', color: '05', material: 'SUEDE', season: 'NONE', price: 2500 },
    { style: '5211', color: '44', material: 'SUEDE', season: 'BAIKA', price: null }, // awaiting price
    { style: '9031', color: '14', material: 'LEATHER', season: 'SHEEPSKIN', price: 2100 },
  ] as const;

  let soldPairId: string | null = null;

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
    for (const size of SIZES) {
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
      if (v.style === SOLD.style && size === SOLD.size) soldPairId = pair.id;
    }
  }

  // One sale yesterday so the overview has movement and «% до вчора» has a base.
  if (soldPairId == null) {
    throw new Error(
      `Демо-сід: пара ${SOLD.style} р.${SOLD.size} не створена — сід неконсистентний.`,
    );
  }
  await prisma.operation.create({
    data: {
      type: 'SALE',
      pairId: soldPairId,
      userId: iryna,
      salePrice: SOLD.price,
      paymentMethod: SOLD.payment,
      createdAt: daysAgo(1),
    },
  });
  await prisma.pair.update({ where: { id: soldPairId }, data: { status: 'SOLD' } });

  const pairs = variants.length * SIZES.length;
  console.log(
    `Demo dataset seeded: 2 sellers, ${variants.length} variants, ${pairs} pairs, ` +
      `intake + 1 sale (${SOLD.style} р.${SOLD.size} — ${SOLD.price} ₴, Ірина, вчора).`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
