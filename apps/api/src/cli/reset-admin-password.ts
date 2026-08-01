import * as readline from 'node:readline/promises';

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

// Admin password reset (decision: requirements-analysis, section 7, item 6).
// Run by whoever has server/DB access:
//   pnpm --filter @madiro/api admin:reset-password
//
// It changes whatever DATABASE_URL resolves to — on a laptop that is the local
// dev database, NOT production. To change the production password, run it on
// the server, where Railway injects the real DATABASE_URL:
//   railway ssh --service api --environment production
const prisma = new PrismaClient();

/**
 * Which database this is about to rewrite, without leaking the password.
 *
 * PrismaClient picks DATABASE_URL up from apps/api/.env on its own, so running
 * this on a laptop silently targets the local dev database — which looks like a
 * success and changes nothing in production. Printing the target makes that
 * visible before the prompt instead of after the support call.
 */
function describeTarget(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return 'DATABASE_URL не задано';
  try {
    const url = new URL(raw);
    return `${url.host}${url.pathname}`;
  } catch {
    return 'нерозбірливий DATABASE_URL';
  }
}

async function main(): Promise<void> {
  console.log(`База даних: ${describeTarget()}`);

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', deletedAt: null } });
  if (!admin) {
    throw new Error('Адміністратора не знайдено. Спершу виконайте сід: pnpm db:seed');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question(`Новий пароль для «${admin.login}»: `);
  rl.close();

  if (password.length < 6) {
    throw new Error('Пароль закороткий — мінімум 6 символів.');
  }

  await prisma.user.update({
    where: { id: admin.id },
    // Bump tokenVersion so any existing admin sessions are revoked immediately.
    data: { passwordHash: await argon2.hash(password), tokenVersion: { increment: 1 } },
  });
  console.log(`Пароль адміністратора «${admin.login}» оновлено.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
