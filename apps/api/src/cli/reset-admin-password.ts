import * as readline from 'node:readline/promises';

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

// Admin password reset (decision: requirements-analysis, section 7, item 6).
// Run by whoever has server/DB access:
//   pnpm --filter @madiro/api admin:reset-password
const prisma = new PrismaClient();

async function main(): Promise<void> {
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
